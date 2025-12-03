// orderController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect, admin } = require('./authMiddleware'); // Importando middleware de admin
const mercadopago = require('./mp'); // Seu arquivo mp.js configurado

// --- 1. Criar Preferência de Pagamento (Checkout) ---
const createOrder = async (req, res) => {
    const { siteId, purchaseType } = req.body;
    const userId = req.user.id;

    try {
        const site = await models.Site.findByPk(siteId);
        if (!site) return res.status(404).json({ message: 'Site não encontrado' });

        const price = purchaseType === 'sale' ? site.price_sale : site.price_rent;
        const title = purchaseType === 'sale' 
            ? `Compra do Site: ${site.name}` 
            : `Aluguel do Site: ${site.name} (30 dias)`;

        // Cria a preferência no Mercado Pago
        const preference = await mercadopago.preferences.create({
            items: [{
                title: title,
                unit_price: parseFloat(price),
                quantity: 1,
            }],
            payer: {
                email: req.user.email,
                name: req.user.full_name
            },
            back_urls: {
                success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sucesso.html`,
                failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/falha.html`,
                pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pendente.html`,
            },
            auto_return: "approved",
            // Passamos dados extras na metadata para recuperar depois no Webhook
            metadata: {
                user_id: userId,
                site_id: siteId,
                purchase_type: purchaseType
            }
        });

        // Opcional: Criar o pedido no banco como "Pendente" antes do pagamento confirmar
        // Isso ajuda a ter um registro se o cliente desistir no meio
        await models.Order.create({
            user_id: userId,
            site_id: siteId,
            status: 'pending',
            transaction_amount: price,
            purchase_type: purchaseType,
            mp_preference_id: preference.body.id
        });

        res.json({ preferenceId: preference.body.id, initPoint: preference.body.init_point });

    } catch (error) {
        console.error('Erro ao criar preferência:', error);
        res.status(500).json({ message: 'Erro ao processar pagamento' });
    }
};

// --- 2. Webhook (Recebe notificação do Mercado Pago) ---
const webhook = async (req, res) => {
    const topic = req.query.topic || req.query.type;
    const id = req.query.id || req.query['data.id'];

    try {
        if (topic === 'payment') {
            const payment = await mercadopago.payment.get(id);
            const status = payment.body.status;
            const metadata = payment.body.metadata;

            if (status === 'approved') {
                // Busca o pedido pendente ou cria um novo
                const existingOrder = await models.Order.findOne({
                    where: { 
                        user_id: metadata.user_id, 
                        site_id: metadata.site_id, 
                        status: 'pending' 
                    }
                });

                let expiryDate = null;
                if (metadata.purchase_type === 'rent') {
                    const now = new Date();
                    expiryDate = new Date(now.setDate(now.getDate() + 30)); // +30 dias
                }

                // Status final no banco
                const finalStatus = metadata.purchase_type === 'rent' ? 'rented' : 'completed';

                if (existingOrder) {
                    await existingOrder.update({
                        status: finalStatus,
                        rent_expiry_date: expiryDate
                    });
                } else {
                    // Caso o webhook chegue antes ou o pedido não tenha sido criado no passo 1
                    await models.Order.create({
                        user_id: metadata.user_id,
                        site_id: metadata.site_id,
                        status: finalStatus,
                        transaction_amount: payment.body.transaction_amount,
                        purchase_type: metadata.purchase_type,
                        rent_expiry_date: expiryDate
                    });
                }
                console.log(`Pagamento aprovado para Site ID ${metadata.site_id}`);
            }
        }
        res.status(200).send();
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).send();
    }
};

// --- 3. Listar Meus Pedidos (Cliente) ---
const getMyOrders = async (req, res) => {
    try {
        const orders = await models.Order.findAll({
            where: { user_id: req.user.id },
            include: [{ model: models.Site }], // Inclui dados do site
            order: [['created_at', 'DESC']]
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar pedidos' });
    }
};

// --- 4. Listar TODOS os Pedidos (ADMIN - NOVA ROTA) ---
const getAllOrdersAdmin = async (req, res) => {
    try {
        const orders = await models.Order.findAll({
            include: [
                // Traz o e-mail do cliente
                { model: models.User, attributes: ['id', 'email', 'full_name'] },
                // Traz o nome do site
                { model: models.Site, attributes: ['id', 'name'] }
            ],
            order: [['created_at', 'DESC']]
        });
        res.json(orders);
    } catch (error) {
        console.error("Erro ao buscar vendas admin:", error);
        res.status(500).json({ message: 'Erro ao buscar todos os pedidos' });
    }
};

// --- Rotas ---
router.post('/create_preference', protect, createOrder);
router.post('/webhook', webhook);
router.get('/me', protect, getMyOrders);

// ROTA QUE ESTAVA FALTANDO (PROTEGIDA POR ADMIN)
router.get('/all', protect, admin, getAllOrdersAdmin);

module.exports = router;
