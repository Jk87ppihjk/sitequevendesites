// paymentController.js
const express = require('express');
const router = express.Router();
// const models = require('./models'); // LINHA ORIGINAL REMOVIDA
const { mercadopagoClient } = require('./mp'); 
const { protect } = require('./authMiddleware');
// Importa as classes necessárias do Mercado Pago SDK V2
const { Preference, Payment } = require('mercadopago'); 

// CORREÇÃO: Acessa o objeto de modelos inicializados via global
const models = global.solematesModels;

/**
 * @route POST /api/payment/create-preference
 * @desc Cria uma preferência de pagamento no MP para um Site
 * @access Private
 */
const createPreference = async (req, res) => {
    // Adiciona destructuring para o corpo do checkout detalhado
    const { siteId, purchaseType, price, siteName, paymentMethod, customer } = req.body;
    const userId = req.user.id;

    console.log(`[CreatePreference] Iniciando criação para UserID: ${userId}, SiteID: ${siteId}, Tipo: ${purchaseType}`);

    if (!siteId || !['sale', 'rent'].includes(purchaseType)) {
        console.error('[CreatePreference] Erro: Dados inválidos recebidos.');
        return res.status(400).json({ message: 'Site ID e tipo de compra (sale/rent) são obrigatórios.' });
    }

    try {
        const site = await models.Site.findByPk(siteId);

        if (!site) {
            console.error('[CreatePreference] Erro: Site não encontrado no DB.');
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        // Usa o preço enviado pelo frontend
        const transactionPrice = parseFloat(price);
        const title = purchaseType === 'sale' ? `Compra do Site: ${siteName}` : `Aluguel (30 dias) do Site: ${siteName}`;

        if (transactionPrice <= 0) {
             console.error(`[CreatePreference] Erro: Preço inválido (${transactionPrice}).`);
             return res.status(400).json({ message: 'Preço inválido para o tipo de compra selecionado.' });
        }

        // 1. Cria o registro do Pedido como 'pending'
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: transactionPrice,
            status: 'pending',
        });
        
        console.log(`[CreatePreference] Pedido local criado. ID: ${order.id}`);

        // 2. Cria uma instância do Módulo Preference
        const preferenceModule = new Preference(mercadopagoClient);

        // Verifica a URL de notificação
        const notificationUrl = `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`;
        console.log(`[CreatePreference] URL de Notificação definida como: ${notificationUrl}`);

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
                payer: { 
                    name: customer.fullName,
                    email: customer.email,
                    phone: { area_code: "", number: "" },
                    address: {
                        zip_code: customer.address.zipCode,
                        street_name: customer.address.streetName,
                        street_number: customer.address.streetNumber,
                    }
                },
                back_urls: {
                    success: `${process.env.FRONTEND_URL}/compra-concluida?orderId=${order.id}`,
                    failure: `${process.env.FRONTEND_URL}/pagamento-falhou`,
                    pending: `${process.env.FRONTEND_URL}/pagamento-pendente`,
                },
                payment_methods: {
                    excluded_payment_types: paymentMethod === 'pix' ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }] : 
                                            paymentMethod === 'boleto' ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "atm" }] : []
                },
                notification_url: notificationUrl,
                auto_return: 'approved',
                external_reference: order.id.toString(), // VITAL: Isso liga o MP ao nosso DB
            }
        };

        // 4. Cria a preferência
        const mpResponse = await preferenceModule.create(preferenceData);
        
        console.log(`[CreatePreference] Preferência criada no MP. ID: ${mpResponse.id}`);

        // 5. Atualiza o pedido com o ID da preferência
        order.mp_preference_id = mpResponse.id;
        await order.save();

        res.json({
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point
        });

    } catch (error) {
        console.error('[CreatePreference] ERRO FATAL:', error);
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

    // LOG ESTRATÉGICO 1: Verificar se a requisição chega
    console.log(`[Webhook] Recebido! Topic: ${topic}, ID: ${id}, Body ID: ${req.body?.id}`);

    // Nota: O MP às vezes manda o ID no query params, às vezes no body (data.id).
    // O código original usava query, vamos garantir que pegamos de algum lugar.
    const paymentId = id || req.body?.data?.id || req.body?.id;

    // Ajuste para suportar tanto 'payment' quanto 'merchant_order' se necessário, 
    // mas focando em payment:
    if ((topic === 'payment' || req.body?.type === 'payment') && paymentId) {
        try {
            console.log(`[Webhook] Buscando detalhes do pagamento ID: ${paymentId} no Mercado Pago...`);

            // Cria uma instância do Módulo Payment
            const paymentModule = new Payment(mercadopagoClient);
            
            // 1. Busca os detalhes do pagamento no MP
            const payment = await paymentModule.get({ id: paymentId }); 
            
            // LOG ESTRATÉGICO 2: Ver o status real que vem do MP
            console.log(`[Webhook] Resposta MP -> Status: ${payment.status}, External Ref (Order ID): ${payment.external_reference}`);

            // 2. Obtém a Referência Externa (ID do nosso Pedido)
            const orderId = payment.external_reference;
            
            if (!orderId) {
                console.error('[Webhook] ERRO: Pagamento sem external_reference. Não é possível vincular ao pedido.');
                return res.status(200).send('OK'); // Retorna OK para o MP parar de tentar
            }

            const order = await models.Order.findByPk(orderId);

            if (!order) {
                console.error(`[Webhook] ERRO: Pedido local ID ${orderId} não encontrado no banco de dados.`);
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            }

            // LOG ESTRATÉGICO 3: Status atual antes da atualização
            console.log(`[Webhook] Pedido encontrado. Status atual no DB: ${order.status}`);

            // 3. Atualiza o status do pedido
            let newStatus = order.status; // Mantém o atual se não mudar

            if (payment.status === 'approved') {
                newStatus = 'completed'; 
                // Lógica especial para aluguel
                if (order.purchase_type === 'rent') {
                    order.rent_expiry_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 
                    newStatus = 'rented';
                }
                console.log(`[Webhook] Pagamento APROVADO. Novo status será: ${newStatus}`);
            } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
                newStatus = 'rejected';
                console.log(`[Webhook] Pagamento REJEITADO/CANCELADO.`);
            } else if (payment.status === 'pending' || payment.status === 'in_process') {
                 // Opcional: manter como pending
                 console.log(`[Webhook] Pagamento ainda pendente/em processo.`);
            }

            // Só salva se o status mudou para evitar writes desnecessários, 
            // ou se for aluguel (para salvar a data)
            if (order.status !== newStatus || (newStatus === 'rented' && !order.rent_expiry_date)) {
                order.status = newStatus;
                await order.save();
                console.log(`[Webhook] SUCESSO: Pedido ID ${orderId} atualizado no banco para: ${newStatus}`);
            } else {
                console.log(`[Webhook] Nenhuma alteração de status necessária.`);
            }
            
            res.status(200).send('OK'); 

        } catch (error) {
            console.error('[Webhook] ERRO CRÍTICO ao processar:', error);
            // Log detalhado do erro se disponível
            if (error.cause) console.error('[Webhook] Causa do erro:', JSON.stringify(error.cause, null, 2));
            
            res.status(500).send('Erro interno do servidor');
        }
    } else {
        console.log('[Webhook] Recebido tópico desconhecido ou sem ID. Ignorando.');
        res.status(200).send('OK'); 
    }
};


// --- Definição das Rotas de Pagamento ---
router.post('/create-preference', protect, createPreference);

// Webhook deve aceitar POST (padrão MP)
router.post('/webhook', handleWebhook);

// Alguns testes/ambientes podem tentar GET, mas o oficial é POST. 
// Deixamos GET apenas para teste manual no navegador se precisar.
router.get('/webhook', (req, res) => {
    res.send('Webhook endpoint está ativo. Mercado Pago usa POST.');
});

module.exports = router;
