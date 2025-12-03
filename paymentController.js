// paymentController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { mercadopagoClient } = require('./mp'); 
const { protect } = require('./authMiddleware');
// Importa as classes necessárias do Mercado Pago SDK V2
const { Preference, Payment } = require('mercadopago'); 

/**
 * @route POST /api/payment/create-preference
 * @desc Cria uma preferência de pagamento no MP para um Site
 * @access Private
 */
const createPreference = async (req, res) => {
    // Adiciona destructuring para o corpo do checkout detalhado
    const { siteId, purchaseType, price, siteName, paymentMethod, customer } = req.body;
    const userId = req.user.id;

    if (!siteId || !['sale', 'rent'].includes(purchaseType)) {
        return res.status(400).json({ message: 'Site ID e tipo de compra (sale/rent) são obrigatórios.' });
    }

    try {
        const site = await models.Site.findByPk(siteId);

        if (!site) {
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        // Usa o preço enviado pelo frontend (que já foi validado lá)
        const transactionPrice = parseFloat(price);
        const title = purchaseType === 'sale' ? `Compra do Site: ${siteName}` : `Aluguel (30 dias) do Site: ${siteName}`;

        if (transactionPrice <= 0) {
             return res.status(400).json({ message: 'Preço inválido para o tipo de compra selecionado.' });
        }

        // 1. Cria o registro do Pedido como 'pending' (pendente)
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: transactionPrice,
            status: 'pending',
        });
        
        // 2. Cria uma instância do Módulo Preference
        const preferenceModule = new Preference(mercadopagoClient);

        // 3. Monta os dados de preferência
        const preferenceData = {
            body: {
                items: [
                    {
                        title: title,
                        unit_price: transactionPrice,
                        quantity: 1,
                        currency_id: 'BRL',
                    }
                ],
                // Adiciona dados do cliente para checkout transparente/avançado
                payer: { 
                    name: customer.fullName,
                    email: customer.email,
                    phone: { area_code: "", number: "" }, // Telefones são opcionais
                    address: {
                        zip_code: customer.address.zipCode,
                        street_name: customer.address.streetName,
                        street_number: customer.address.streetNumber,
                    }
                },
                back_urls: {
                    success: `${process.env.FRONTEND_URL}/compra-concluida?orderId=${order.id}`, // Passa o ID do pedido
                    failure: `${process.env.FRONTEND_URL}/pagamento-falhou`,
                    pending: `${process.env.FRONTEND_URL}/pagamento-pendente`,
                },
                payment_methods: {
                    // Controla o método de pagamento conforme o frontend (se for cartão, não precisa excluir nada)
                    excluded_payment_types: paymentMethod === 'pix' ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }] : 
                                            paymentMethod === 'boleto' ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "atm" }] : []
                },
                notification_url: `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`,
                auto_return: 'approved',
                external_reference: order.id.toString(),
            }
        };

        // 4. Cria a preferência usando a instância do módulo
        const mpResponse = await preferenceModule.create(preferenceData);
        
        // 5. Atualiza o pedido com o ID da preferência do MP
        order.mp_preference_id = mpResponse.id;
        await order.save();


        // Retorna o link de inicialização para o frontend
        res.json({
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point
        });


    } catch (error) {
        console.error('Erro ao criar preferência de pagamento:', error);
        // Exibe o erro específico do MP se estiver disponível
        const mpErrorMsg = error.cause ? error.cause.map(e => e.description).join(', ') : '';
        res.status(500).json({ message: `Erro interno ao criar preferência: ${mpErrorMsg}` });
    }
};

/**
 * @route POST /api/payment/webhook
 * @desc Recebe notificações do Mercado Pago sobre o status do pagamento
 * @access Public (usado pelo MP)
 */
const handleWebhook = async (req, res) => {
    const { topic, id } = req.query; 

    if (topic === 'payment' && id) {
        try {
            // Cria uma instância do Módulo Payment
            const paymentModule = new Payment(mercadopagoClient);
            
            // 1. Busca os detalhes do pagamento no MP
            const payment = await paymentModule.get({ id }); 
            const paymentData = payment; 

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
                newStatus = 'completed'; // Mudado para 'completed' para compatibilidade com o frontend
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
            
            res.status(200).send('OK'); 

        } catch (error) {
            console.error('Erro ao processar webhook do Mercado Pago:', error);
            res.status(500).send('Erro interno do servidor');
        }
    } else {
        res.status(200).send('OK'); 
    }
};


// --- Definição das Rotas de Pagamento ---
router.post('/create-preference', protect, createPreference);
router.post('/webhook', handleWebhook);
router.get('/webhook', handleWebhook); 

module.exports = router;
