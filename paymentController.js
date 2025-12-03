const express = require('express');
const router = express.Router();
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
    // Adiciona destructuring para o corpo do checkout detalhado. O campo 'price' é crucial.
    const { siteId, purchaseType, price, siteName, customer } = req.body;
    const userId = req.user.id;

    console.log(`[CreatePreference] Iniciando criação para UserID: ${userId}, SiteID: ${siteId}, Tipo: ${purchaseType}`);

    if (!siteId || !['sale', 'rent'].includes(purchaseType)) {
        console.error('[CreatePreference] Erro: Dados inválidos recebidos.');
        return res.status(400).json({ message: 'Site ID e tipo de compra (sale/rent) são obrigatórios.' });
    }

    const transactionPrice = parseFloat(price);

    // ⭐️ CORREÇÃO PRINCIPAL: Validação explícita de NaN e valor positivo.
    if (isNaN(transactionPrice) || transactionPrice <= 0) {
        console.error(`[CreatePreference] Erro: Preço inválido ou ausente (${price}). TransacionPrice: ${transactionPrice}`);
        // Retorna a mensagem de erro que o Mercado Pago geraria, mas antes de bater na API.
        return res.status(400).json({ message: 'A propriedade de preço (price) é obrigatória e deve ser um valor positivo válido.' });
    }

    try {
        const site = await models.Site.findByPk(siteId);

        if (!site) {
            console.error('[CreatePreference] Erro: Site não encontrado no DB.');
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        const title = purchaseType === 'sale' ? `Compra do Site: ${siteName}` : `Aluguel (30 dias) do Site: ${siteName}`;

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
                        unit_price: transactionPrice, // PREÇO CORRETO ENVIADO PARA O MP
                        quantity: 1,
                        currency_id: 'BRL',
                    }
                ],
                payer: { 
                    name: customer.fullName,
                    email: customer.email,
                    // Deixando phone e address com dados do cliente para preenchimento automático no Brick
                    phone: { area_code: "11", number: "999999999" }, // Valores mock para evitar erro de validação do MP se estiverem vazios
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
                // Retorna 'approved' para o Mercado Pago, para que ele redirecione o usuário de volta 
                // após o pagamento (em vez do webhook) - Útil para cartões.
                auto_return: 'approved', 
                external_reference: order.id.toString(), // VITAL: Isso liga o MP ao nosso DB
                notification_url: notificationUrl,
            }
        };
        
        // 4. Cria a preferência
        const mpResponse = await preferenceModule.create(preferenceData);
        
        console.log(`[CreatePreference] Preferência criada no MP. ID: ${mpResponse.id}`);

        // 5. Atualiza o pedido com o ID da preferência
        order.mp_preference_id = mpResponse.id;
        await order.save();

        // 6. Retorna o ID da preferência para o frontend (para o Brick)
        res.json({
            preferenceId: mpResponse.id,
            // Mantendo initPoint, apesar de não ser usado pelo Brick, pode ser útil
            initPoint: mpResponse.init_point 
        });

    } catch (error) {
        console.error('[CreatePreference] ERRO FATAL:', error);
        // Tenta extrair a mensagem de erro mais detalhada do Mercado Pago
        const mpErrorMsg = error.cause && Array.isArray(error.cause) 
            ? error.cause.map(e => e.description || e.code).join(', ') 
            : 'Detalhes do erro indisponíveis.';

        res.status(500).json({ 
            message: `Erro interno ao criar preferência. ${mpErrorMsg}`,
            // Se for erro de validação (como 'Amount is required'), o MP coloca no cause.
            details: mpErrorMsg
        });
    }
};

/**
 * @route POST /api/payment/webhook
 * @desc Recebe notificações do Mercado Pago sobre o status do pagamento
 * @access Public (usado pelo MP)
 */
const handleWebhook = async (req, res) => {
    const { topic, id } = req.query; 

    // O MP pode enviar o ID no query, no body ou em data.id
    const paymentId = id || req.body?.data?.id || req.body?.id;
    
    // Filtra apenas tópicos de pagamento e garante que tenhamos um ID
    if ((topic === 'payment' || req.body?.type === 'payment') && paymentId) {
        try {
            console.log(`[Webhook] Buscando detalhes do pagamento ID: ${paymentId} no Mercado Pago...`);

            const paymentModule = new Payment(mercadopagoClient);
            
            // 1. Busca os detalhes do pagamento no MP
            const payment = await paymentModule.get({ id: paymentId }); 
            
            console.log(`[Webhook] Resposta MP -> Status: ${payment.status}, External Ref (Order ID): ${payment.external_reference}`);

            // 2. Obtém a Referência Externa (ID do nosso Pedido)
            const orderId = payment.external_reference;
            
            if (!orderId) {
                console.error('[Webhook] ERRO: Pagamento sem external_reference. Não é possível vincular ao pedido.');
                return res.status(200).send('OK'); 
            }

            const order = await models.Order.findByPk(orderId);

            if (!order) {
                console.error(`[Webhook] ERRO: Pedido local ID ${orderId} não encontrado no banco de dados.`);
                return res.status(404).json({ message: 'Pedido não encontrado.' });
            }

            console.log(`[Webhook] Pedido encontrado. Status atual no DB: ${order.status}`);

            // 3. Atualiza o status do pedido
            let newStatus = order.status; 

            if (payment.status === 'approved' && order.status !== 'completed' && order.status !== 'rented') {
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
                newStatus = 'pending';
                console.log(`[Webhook] Pagamento ainda pendente/em processo.`);
            }

            // Só salva se houver mudança de status ou necessidade de salvar a data de aluguel
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
            res.status(500).send('Erro interno do servidor');
        }
    } else {
        console.log('[Webhook] Recebido tópico desconhecido ou sem ID. Ignorando.');
        res.status(200).send('OK'); 
    }
};


// --- Definição das Rotas de Pagamento ---
router.post('/create-preference', protect, createPreference);
router.post('/webhook', handleWebhook);
router.get('/webhook', (req, res) => {
    res.send('Webhook endpoint está ativo. Mercado Pago usa POST.');
});

module.exports = router;
