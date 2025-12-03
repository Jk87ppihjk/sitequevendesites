// paymentController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
// Altera a importação para o novo nome
const { mercadopagoClient } = require('./mp'); 
const { protect } = require('./authMiddleware');

/**
 * @route POST /api/payment/create-preference
 * @desc Cria uma preferência de pagamento no MP para um Site
 * @access Private
 */
const createPreference = async (req, res) => {
    const { siteId, purchaseType } = req.body;
    const userId = req.user.id;

    if (!siteId || !['sale', 'rent'].includes(purchaseType)) {
        return res.status(400).json({ message: 'Site ID e tipo de compra (sale/rent) são obrigatórios.' });
    }

    try {
        const site = await models.Site.findByPk(siteId);

        if (!site) {
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        let price;
        let title;
        if (purchaseType === 'sale') {
            price = site.price_sale;
            title = `Compra do Site: ${site.name}`;
        } else {
            price = site.price_rent;
            title = `Aluguel (30 dias) do Site: ${site.name}`;
        }

        if (price <= 0) {
             return res.status(400).json({ message: 'Preço inválido para o tipo de compra selecionado.' });
        }

        // 1. Cria o registro do Pedido como 'pending' (pendente)
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: price,
            status: 'pending',
        });

        // 2. Cria a preferência de pagamento no Mercado Pago
        const preferenceData = {
            body: { // Adicionado 'body' para o novo SDK
                items: [
                    {
                        title: title,
                        unit_price: price,
                        quantity: 1,
                        currency_id: 'BRL',
                    }
                ],
                back_urls: {
                    success: `${process.env.FRONTEND_URL}/compra-concluida`,
                    failure: `${process.env.FRONTEND_URL}/pagamento-falhou`,
                    pending: `${process.env.FRONTEND_URL}/pagamento-pendente`,
                },
                notification_url: `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`,
                auto_return: 'approved',
                external_reference: order.id.toString(),
            }
        };

        // Usa mercadopagoClient.preferences.create
        const mpResponse = await mercadopagoClient.preferences.create(preferenceData);
        
        // 3. Atualiza o pedido com o ID da preferência do MP
        order.mp_preference_id = mpResponse.id; // No novo SDK, o ID está diretamente no objeto
        await order.save();


        // Retorna o ID da preferência ou o link para o frontend
        res.json({
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point
        });


    } catch (error) {
        console.error('Erro ao criar preferência de pagamento:', error);
        res.status(500).json({ message: 'Erro interno ao criar preferência de pagamento.' });
    }
};

/**
 * @route POST /api/payment/webhook
 * @desc Recebe notificações do Mercado Pago sobre o status do pagamento
 * @access Public (usado pelo MP)
 */
const handleWebhook = async (req, res) => {
    // O Mercado Pago envia o tópico e o ID
    const { topic, id } = req.query; 

    // O Mercado Pago pode enviar diferentes tipos de notificação.
    if (topic === 'payment' && id) {
        try {
            // 1. Busca os detalhes do pagamento no MP
            // O novo SDK usa o módulo 'payments' e o método 'get'
            const payment = await mercadopagoClient.payments.get({ id }); 
            const paymentData = payment; // O objeto de pagamento está diretamente no retorno

            // 2. Obtém a Referência Externa (ID do nosso Pedido)
            const orderId = paymentData.external_reference;
            const order = await models.Order.findByPk(orderId);

            if (!order) {
                console.error(`Webhook: Pedido local ID ${orderId} não encontrado.`);
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            }

            // 3. Atualiza o status do pedido
            let newStatus = 'pending';
            if (paymentData.status === 'approved') {
                newStatus = 'approved';
                // Lógica especial para aluguel (adiciona data de expiração)
                if (order.purchase_type === 'rent') {
                    order.rent_expiry_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
                    newStatus = 'rented';
                }
            } else if (paymentData.status === 'rejected') {
                newStatus = 'rejected';
            }

            order.status = newStatus;
            await order.save();

            console.log(`Webhook: Pedido ID ${orderId} atualizado para status: ${newStatus}`);
            
            // É crucial retornar 200 OK para o Mercado Pago
            res.status(200).send('OK'); 

        } catch (error) {
            console.error('Erro ao processar webhook do Mercado Pago:', error);
            res.status(500).send('Erro interno do servidor');
        }
    } else {
        // Ignorar notificações que não sejam de pagamento
        res.status(200).send('OK'); 
    }
};


// --- Definição das Rotas de Pagamento ---
router.post('/create-preference', protect, createPreference);
router.post('/webhook', handleWebhook);
router.get('/webhook', handleWebhook); 

module.exports = router;
