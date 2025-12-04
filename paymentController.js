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
    // O req.user é definido pelo middleware 'protect'
    const userId = req.user ? req.user.id : null; 

    console.log(`[MP_BACKEND_LOG] Requisição de Pagamento recebida. Método: ${paymentMethod}, UserID: ${userId}`);
    console.log('[MP_BACKEND_LOG] Dados do Cliente:', customer);
    console.log('[MP_BACKEND_LOG] Dados do Pedido:', { siteId, purchaseType, price });


    if (!siteId || !price || !customer || !paymentMethod) {
        console.error('[MP_BACKEND_LOG] Erro 400: Dados do pedido incompletos.');
        return res.status(400).json({ message: 'Dados do pedido incompletos.' });
    }
    
    // Se o middleware protect falhou, o userId será nulo (o 401 já teria sido enviado, mas verificamos por segurança)
    if (!userId) {
         console.error('[MP_BACKEND_LOG] Erro 401: Tentativa de acesso sem autenticação válida.');
         return res.status(401).json({ message: 'Não autorizado, token ausente ou inválido.' });
    }


    try {
        const site = await models.Site.findByPk(siteId);
        if (!site) {
            console.error(`[MP_BACKEND_LOG] Erro 404: Site ID ${siteId} não encontrado.`);
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        // --- 1. PREPARAÇÃO DOS DADOS DO PAGADOR (ROBUSTA) ---
        const amount = parseFloat(price);
        const rawDoc = customer.cpfCnpj.replace(/\D/g, '');
        const identificationType = rawDoc.length === 11 ? 'CPF' : 'CNPJ';

        // Lógica mais robusta para split de nome
        const nameParts = customer.fullName.trim().split(' ');
        const firstName = nameParts[0] || 'Cliente';
        // Se houver mais de uma palavra, o restante é o sobrenome, senão usa o nome completo
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0]; 
        
        const payer = {
            email: customer.email,
            first_name: firstName,
            last_name: lastName, 
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
        console.log('[MP_BACKEND_LOG] Dados do Pagador formatados:', payer);


        // --- 2. MONTAGEM DO CORPO DA REQUISIÇÃO DO MERCADO PAGO ---
        let paymentRequestBody = {
            transaction_amount: amount,
            description: purchaseType === 'sale' ? `Compra do Site: ${site.name}` : `Aluguel do Site: ${site.name} (30 dias)`,
            payer: payer,
            // URL de notificação para o Mercado Pago enviar atualizações (Webhook)
            // Assumimos que BACKEND_URL está definido no .env
            notification_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/orders/webhook`,
            metadata: {
                user_id: userId,
                site_id: siteId,
                purchase_type: purchaseType
            }
        };

        if (paymentMethod === 'card') {
            // Requisição de pagamento com Cartão de Crédito (tokenizado pelo Brick)
            if (!paymentData || !paymentData.token || !paymentData.installments) {
                console.error('[MP_BACKEND_LOG] Erro 400: Dados do cartão incompletos no paymentData.');
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
            console.error(`[MP_BACKEND_LOG] Erro 400: Método de pagamento inválido: ${paymentMethod}`);
            return res.status(400).json({ message: 'Método de pagamento inválido.' });
        }

        console.log('[MP_BACKEND_LOG] Corpo FINAL da Requisição MP:', paymentRequestBody);


        // --- 3. CRIAÇÃO DO PAGAMENTO NA API DO MERCADO PAGO ---
        const mpResponse = await mercadopagoClient.payments.create({ body: paymentRequestBody });
        
        console.log('[MP_BACKEND_LOG] Resposta da API do Mercado Pago recebida. Status:', mpResponse.status);
        
        const mpPaymentStatus = mpResponse.status;
        const isRental = purchaseType === 'rent';
        
        // --- 4. REGISTRO DO PEDIDO NO BANCO DE DADOS ---
        let rentExpiryDate = null;
        let orderStatus = 'pending';

        if (mpPaymentStatus === 'approved') {
            orderStatus = isRental ? 'rented' : 'completed';
            if (isRental) {
                const now = new Date();
                rentExpiryDate = new Date(now.setDate(now.getDate() + 30));
            }
        } else if (mpPaymentStatus === 'rejected') {
            orderStatus = 'rejected';
        } 
        // Se for Pix, o status será 'pending' no MP e no DB, esperando o pagamento

        // Cria o registro do pedido
        await models.Order.create({
            user_id: userId,
            site_id: siteId,
            status: orderStatus,
            transaction_amount: amount,
            purchase_type: purchaseType,
            mp_preference_id: mpResponse.id, // Armazena o ID do pagamento
            rent_expiry_date: rentExpiryDate,
        });

        console.log(`[MP_BACKEND_LOG] Pedido ID ${mpResponse.id} registrado no DB com status: ${orderStatus}`);

        // --- 5. RETORNA A RESPOSTA DO MERCADO PAGO PARA O FRONTEND ---
        res.json(mpResponse);

    } catch (error) {
        // Loga o erro completo para debug no console do servidor
        console.error('[MP_BACKEND_LOG] ❌ FATAL ERROR durante a criação do pagamento:', error);
        
        // Tenta extrair a mensagem de erro da API do MP
        const mpErrorDetails = error.cause || [];
        const mpErrorMessage = error.message || mpErrorDetails.map(c => c.description).join('; ') || 'Erro ao processar pagamento no Mercado Pago.';
        
        // Retorna o status 400 ou 500 dependendo da falha
        res.status(400).json({ 
            message: mpErrorMessage,
            status_detail: error.status_detail // Detalhe do erro MP (útil para o frontend)
        });
    }
};

// --- ROTAS ---
router.post('/create-payment', protect, createPayment);

module.exports = router;
