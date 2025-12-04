
// paymentController.js
const express = require('express');
const router = express.Router();
const { mercadopagoClient } = require('./mp');
const { protect } = require('./authMiddleware');

// Acessa o objeto de modelos inicializados via global
const models = global.solematesModels;

/**
 * @route POST /api/payment/create-payment
 * @desc Processa o pagamento via Checkout Transparente (Card Token ou Pix)
 * @access Private (Auth)
 */
const createPayment = async (req, res) => {
    // Dados enviados pelo frontend (após o Card Brick tokenizar ou selecionar Pix)
    const { siteId, purchaseType, price, customer, paymentData, paymentMethod } = req.body;
    const userId = req.user.id;

    if (!siteId || !price || !customer || !paymentMethod) {
        return res.status(400).json({ message: 'Dados do pedido incompletos.' });
    }

    try {
        const site = await models.Site.findByPk(siteId);
        if (!site) {
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        // --- 1. PREPARAÇÃO DOS DADOS DO PAGADOR ---
        const amount = parseFloat(price);
        const rawDoc = customer.cpfCnpj.replace(/\D/g, '');
        const identificationType = rawDoc.length === 11 ? 'CPF' : 'CNPJ';

        const payer = {
            email: customer.email,
            first_name: customer.fullName.split(' ')[0],
            last_name: customer.fullName.split(' ').slice(1).join(' ') || '.', 
            identification: {
                type: identificationType,
                number: rawDoc,
            },
            address: {
                zip_code: customer.address.zipCode.replace(/\D/g, ''),
                street_name: customer.address.streetName,
                street_number: customer.address.streetNumber,
            }
        };

        // --- 2. MONTAGEM DO CORPO DA REQUISIÇÃO DO MERCADO PAGO ---
        let paymentRequestBody = {
            transaction_amount: amount,
            description: purchaseType === 'sale' ? `Compra do Site: ${site.name}` : `Aluguel do Site: ${site.name} (30 dias)`,
            payer: payer,
            // Metadata para uso futuro
            metadata: {
                user_id: userId,
                site_id: siteId,
                purchase_type: purchaseType
            }
        };

        if (paymentMethod === 'card') {
            // Requisição de pagamento com Cartão de Crédito (tokenizado pelo Brick)
            if (!paymentData || !paymentData.token || !paymentData.installments) {
                return res.status(400).json({ message: 'Dados do cartão incompletos.' });
            }

            paymentRequestBody = {
                ...paymentRequestBody,
                payment_method_id: 'credit_card',
                token: paymentData.token, // Token do cartão
                installments: paymentData.installments,
                issuer_id: paymentData.issuer_id,
            };

        } else if (paymentMethod === 'pix') {
            // Requisição de pagamento com Pix
            paymentRequestBody = {
                ...paymentRequestBody,
                payment_method_id: 'pix',
            };
        } else {
            return res.status(400).json({ message: 'Método de pagamento inválido.' });
        }

        // --- 3. CRIAÇÃO DO PAGAMENTO NA API DO MERCADO PAGO ---
        const mpResponse = await mercadopagoClient.payments.create({ body: paymentRequestBody });
        
        const mpPaymentStatus = mpResponse.status;
        const isRental = purchaseType === 'rent';
        
        // --- 4. REGISTRO DO PEDIDO NO BANCO DE DADOS ---
        let rentExpiryDate = null;
        let orderStatus = 'pending';

        if (mpPaymentStatus === 'approved') {
            orderStatus = isRental ? 'rented' : 'completed';
            if (isRental) {
                const now = new Date();
                // Expira em 30 dias
                rentExpiryDate = new Date(now.setDate(now.getDate() + 30));
            }
        } else if (mpPaymentStatus === 'rejected') {
            orderStatus = 'rejected';
        } 
        // Se for Pix, o status inicial será 'pending' (aguardando pagamento)

        // Cria o registro do pedido
        await models.Order.create({
            user_id: userId,
            site_id: siteId,
            status: orderStatus,
            transaction_amount: amount,
            purchase_type: purchaseType,
            // Reutiliza o campo existente para armazenar o ID do pagamento direto
            mp_preference_id: mpResponse.id, 
            rent_expiry_date: rentExpiryDate,
        });


        // --- 5. RETORNA A RESPOSTA DO MERCADO PAGO PARA O FRONTEND ---
        res.json(mpResponse);

    } catch (error) {
        console.error('Erro ao criar pagamento via Checkout Transparente:', error);
        
        // Se o erro vier da API do MP, tentar extrair a mensagem de erro
        const mpErrorMessage = error.message || error.cause?.map(c => c.description).join('; ') || 'Erro ao processar pagamento no Mercado Pago.';
        
        res.status(500).json({ 
            message: mpErrorMessage 
        });
    }
};

// --- ROTAS ---
router.post('/create-payment', protect, createPayment);

module.exports = router;
