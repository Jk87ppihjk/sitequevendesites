// ==========================
// PAYMENT CONTROLLER FINAL
// ==========================

const express = require('express');
const router = express.Router();
const { mercadopagoClient } = require('./mp');
const { protect } = require('./authMiddleware');
const { Preference, Payment } = require('mercadopago');
const models = global.solematesModels;


// =======================================
// 🟩 CREATE PREFERENCE — 100% FINAL
// =======================================
const createPreference = async (req, res) => {
    console.log("\n========== [createPreference] ==========");

    const { siteId, purchaseType, price, siteName, customer } = req.body;
    const userId = req.user.id;

    console.log("[createPreference] Recebido do front:", req.body);

    // Garantir que o preço é número REAL
    const transactionPrice = Number(price);

    if (!transactionPrice || isNaN(transactionPrice) || transactionPrice < 1) {
        return res.status(400).json({
            message: "O Mercado Pago exige valor mínimo de R$ 1,00."
        });
    }

    // CPF ou CNPJ
    const rawDoc = customer.cpfCnpj.replace(/\D/g, '');
    const isCnpj = rawDoc.length > 11;

    try {
        // Carregar site
        const site = await models.Site.findByPk(siteId);
        if (!site) return res.status(404).json({ message: 'Site não encontrado.' });

        // Criar pedido interno
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: transactionPrice,
            status: 'pending',
        });

        console.log(`[createPreference] Pedido criado: OrderID = ${order.id}`);

        // Criar preferência Mercado Pago
        const preferenceModule = new Preference(mercadopagoClient);

        const preferenceData = {
            body: {
                items: [
                    {
                        title: purchaseType === 'sale'
                            ? `Compra do Site: ${siteName}`
                            : `Aluguel (30 dias) do Site: ${siteName}`,
                        unit_price: Number(transactionPrice),
                        quantity: 1,
                        currency_id: "BRL",
                    }
                ],
                payer: {
                    name: customer.fullName,
                    email: customer.email,
                    entity_type: isCnpj ? "association" : "individual",
                    identification: {
                        type: isCnpj ? "CNPJ" : "CPF",
                        number: rawDoc
                    },
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
                auto_return: "approved",
                external_reference: order.id.toString(),
                notification_url: `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`,
            }
        };

        console.log("[createPreference] preferenceData criado corretamente.");

        // Criar preferência no Mercado Pago
        const mpResponse = await preferenceModule.create(preferenceData);

        console.log("[createPreference] Resposta MP recebida.");
        console.log("[createPreference] mpResponse.id:", mpResponse.id);
        console.log("[createPreference] mpResponse.init_point:", mpResponse.init_point);

        if (!mpResponse.id) {
            return res.status(500).json({
                message: "Erro ao criar preferência no Mercado Pago.",
                raw: mpResponse
            });
        }

        // Salvar no pedido
        order.mp_preference_id = mpResponse.id;
        await order.save();

        console.log("[createPreference] Preferência salva no pedido ✔️");

        // Retornar para o Frontend
        return res.json({
            preferenceId: mpResponse.id,      // ✔️ Preferência real
            amount: Number(transactionPrice), // ✔️ Obrigatório para o Brick
            initPoint: mpResponse.init_point
        });

    } catch (error) {
        console.error("\n❌ ERRO CREATE PREFERENCE:", error);
        res.status(500).json({ message: "Erro interno ao criar preferência.", error });
    }
};


// =======================================
// 🟦 WEBHOOK — 100% FINAL
// =======================================
const handleWebhook = async (req, res) => {
    console.log("\n========== [WEBHOOK RECEBIDO] ==========");

    const { topic, id } = req.query;
    const paymentId = id || req.body?.data?.id || req.body?.id;

    console.log("[Webhook] Topic:", topic, "PaymentId:", paymentId);

    if ((topic === 'payment' || req.body?.type === 'payment') && paymentId) {
        try {
            const paymentModule = new Payment(mercadopagoClient);

            // Puxa detalhes
            const payment = await paymentModule.get({ id: paymentId });

            console.log("[Webhook] Status do pagamento:", payment.status);
            console.log("[Webhook] external_reference:", payment.external_reference);

            const orderId = payment.external_reference;
            if (!orderId) return res.status(200).send("OK (Sem orderId)");

            const order = await models.Order.findByPk(orderId);
            if (!order) return res.status(404).json({ message: "Pedido não encontrado." });

            // Atualiza status
            if (payment.status === "approved") {
                order.status = order.purchase_type === "rent" ? "rented" : "completed";

                if (order.purchase_type === "rent") {
                    order.rent_expiry_date = new Date(Date.now() + 30 * 86400000);
                }

            } else if (payment.status === "pending") {
                order.status = "pending";

            } else if (payment.status === "rejected") {
                order.status = "rejected";
            }

            await order.save();

            console.log(`[Webhook] Pedido ${order.id} atualizado para: ${order.status}`);

            return res.status(200).send("OK");

        } catch (error) {
            console.error("❌ ERRO WEBHOOK:", error);
            return res.status(500).send("Erro interno");
        }
    }

    return res.status(200).send("OK");
};


// ==========================
// ROTAS
// ==========================
router.post('/create-preference', protect, createPreference);
router.post('/webhook', handleWebhook);
router.get('/webhook', (req, res) => res.send("Webhook ativo. Use POST."));

module.exports = router;
