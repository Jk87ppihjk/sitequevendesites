// paymentController.js
const express = require('express');
const router = express.Router();
const { mercadopagoClient } = require('./mp');
const { protect } = require('./authMiddleware');

// CORREÇÃO CRÍTICA: Acessa o objeto de modelos inicializados via global no topo
// Desta forma, segue o padrão dos outros controllers e garante que o objeto 'models' 
// esteja disponível no escopo do módulo.
const models = global.solematesModels; 


/**
 * @route POST /api/payment/create-payment
 * @desc Processa o pagamento via Checkout Transparente (Card Token ou Pix)
 * @access Private (Auth)
 */
const createPayment = async (req, res) => {
    
    // --- CHECK DE INICIALIZAÇÃO E MODELOS (Para Debug) ---
    if (!models || !models.Site || !models.Order) {
        console.error('[MP_BACKEND_LOG] ❌ CRITICAL: Modelos do Banco de Dados (Site/Order) estão undefined. Verifique server.js e models.js.');
        return res.status(500).json({ message: 'Erro interno do servidor: Falha na inicialização dos modelos (Site/Order).' });
    }
    // -------------------------------------


    // Dados enviados pelo frontend (após o Card Brick tokenizar ou selecionar Pix)
    const { siteId, purchaseType, price, customer, paymentData, paymentMethod } = req.body;
    const userId = req.user ? req.user.id : null; 

    console.log(`[MP_BACKEND_LOG] Requisição de Pagamento recebida. Método: ${paymentMethod}, UserID: ${userId}`);
    console.log('[MP_BACKEND_LOG] Dados do Cliente:', customer);
    console.log('[MP_BACKEND_LOG] Dados do Pedido:', { siteId, purchaseType, price });


    if (!siteId || !price || !customer || !paymentMethod) {
        console.error('[MP_BACKEND_LOG] Erro 400: Dados do pedido incompletos.');
        return res.status(400).json({ message: 'Dados do pedido incompletos.' });
    }
    
    // O erro 401 deve ser tratado pelo middleware 'protect' antes.
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

        // --- 1. PREPARAÇÃO DOS DADOS DO PAGADOR ---
        const amount = parseFloat(price);
        const rawDoc = customer.cpfCnpj.replace(/\D/g, '');
        const identificationType = rawDoc.length === 11 ? 'CPF' : 'CNPJ';

        const nameParts = customer.fullName.trim().split(' ');
        const firstName = nameParts[0] || 'Cliente';
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
            notification_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/orders/webhook`,
            metadata: {
                user_id: userId,
                site_id: siteId,
                purchase_type: purchaseType
            }
        };

        if (paymentMethod === 'card') {
            if (!paymentData || !paymentData.token || !paymentData.installments) {
                console.error('[MP_BACKEND_LOG] Erro 400: Dados do cartão incompletos no paymentData.');
                return res.status(400).json({ message: 'Dados do cartão incompletos.' });
            }

            paymentRequestBody = {
                ...paymentRequestBody,
                payment_method_id: 'credit_card',
                token: paymentData.token,
                installments: paymentData.installments,
                issuer_id: paymentData.issuer_id,
            };

        } else if (paymentMethod === 'pix') {
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
        // Se a correção deu certo, esta linha será executada
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

        // Cria o registro do pedido
        // Se este ponto for alcançado, o Pix ou Cartão foi processado pelo Mercado Pago
        await models.Order.create({
            user_id: userId,
            site_id: siteId,
            status: orderStatus,
            transaction_amount: amount,
            purchase_type: purchaseType,
            mp_preference_id: mpResponse.id,
            rent_expiry_date: rentExpiryDate,
        });

        console.log(`[MP_BACKEND_LOG] Pedido ID ${mpResponse.id} registrado no DB com status: ${orderStatus}`);

        // --- 5. RETORNA A RESPOSTA DO MERCADO PAGO PARA O FRONTEND ---
        res.json(mpResponse);

    } catch (error) {
        console.error('[MP_BACKEND_LOG] ❌ FATAL ERROR durante a criação do pagamento:', error);
        
        const mpErrorDetails = error.cause || [];
        const mpErrorMessage = error.message || mpErrorDetails.map(c => c.description).join('; ') || 'Erro ao processar pagamento no Mercado Pago.';
        
        res.status(400).json({ 
            message: mpErrorMessage,
            status_detail: error.status_detail 
        });
    }
};

// --- ROTAS ---
router.post('/create-payment', protect, createPayment);

module.exports = router;
