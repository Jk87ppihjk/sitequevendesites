// ==========================
// BACKEND (Node.js / Express)
// ==========================

const express = require('express');
const router = express.Router();
const { mercadopagoClient } = require('./mp');
const { protect } = require('./authMiddleware');
const { Preference, Payment } = require('mercadopago');
const models = global.solematesModels;

// ==============================
// CREATE PREFERENCE (CORRIGIDO)
// ==============================
const createPreference = async (req, res) => {
    console.log("\n========= [createPreference] ==========");
    console.log("[createPreference] Recebido do front:", req.body);

    const { siteId, purchaseType, price, siteName, customer } = req.body;
    const userId = req.user.id;

    // Garantir número
    const transactionPrice = Number(price);

    if (!transactionPrice || isNaN(transactionPrice) || transactionPrice < 1) {
        return res.status(400).json({
            message: "O valor mínimo permitido pelo Mercado Pago é R$ 1,00."
        });
    }

    // CPF/CNPJ
    const rawDoc = customer.cpfCnpj.replace(/\D/g, '');
    const isCnpj = rawDoc.length > 11;

    try {
        // Verifica site
        const site = await models.Site.findByPk(siteId);
        if (!site) return res.status(404).json({ message: "Site não encontrado." });

        // Cria pedido local
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: transactionPrice,
            status: "pending"
        });

        console.log("[createPreference] Pedido criado: OrderID =", order.id);

        const preferenceModule = new Preference(mercadopagoClient);
        const notificationUrl = `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`;

        // Construção da preferência
        const preferenceData = {
            body: {
                items: [
                    {
                        title:
                            purchaseType === "sale"
                                ? `Compra do Site: ${siteName}`
                                : `Aluguel (30 dias) do Site: ${siteName}`,
                        unit_price: Number(transactionPrice),
                        quantity: 1,
                        currency_id: "BRL"
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
                        street_number: customer.address.streetNumber
                    }
                },

                back_urls: {
                    success: `${process.env.FRONTEND_URL}/compra-concluida?orderId=${order.id}`,
                    failure: `${process.env.FRONTEND_URL}/pagamento-falhou`,
                    pending: `${process.env.FRONTEND_URL}/pagamento-pendente`
                },

                auto_return: "approved",
                external_reference: order.id.toString(),
                notification_url: notificationUrl
            }
        };

        console.log("[createPreference] preferenceData criado corretamente.");

        // Envia para Mercado Pago
        const mpResponse = await preferenceModule.create(preferenceData);
        console.log("[createPreference] Resposta MP recebida.");
        console.log("[createPreference] mpResponse.id:", mpResponse.id);
        console.log("[createPreference] mpResponse.init_point:", mpResponse.init_point);

        order.mp_preference_id = mpResponse.id;
        await order.save();

        console.log("[createPreference] Preferência salva no pedido ✔️");

        return res.json({
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point
        });

    } catch (error) {
        console.error("ERRO NO CREATE-PREFERENCE:", error);
        return res.status(500).json({ message: "Erro interno ao criar preferência." });
    }
};

// ==========================
// WEBHOOK MERCADO PAGO
// ==========================
const handleWebhook = async (req, res) => {
    const { topic, id } = req.query;
    const paymentId = id || req.body?.data?.id || req.body?.id;

    if ((topic === "payment" || req.body?.type === "payment") && paymentId) {
        try {
            const paymentModule = new Payment(mercadopagoClient);
            const payment = await paymentModule.get({ id: paymentId });

            const orderId = payment.external_reference;
            if (!orderId) return res.status(200).send("OK");

            const order = await models.Order.findByPk(orderId);
            if (!order) return res.status(404).json({ message: "Pedido não encontrado." });

            let newStatus = order.status;

            if (payment.status === "approved") {
                newStatus = order.purchase_type === "rent" ? "rented" : "completed";

                if (order.purchase_type === "rent") {
                    order.rent_expiry_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                }

            } else if (payment.status === "pending") {
                newStatus = "pending";
            } else if (payment.status === "rejected") {
                newStatus = "rejected";
            }

            order.status = newStatus;
            await order.save();

            return res.status(200).send("OK");

        } catch (error) {
            console.error("ERRO NO WEBHOOK:", error);
            return res.status(500).send("Erro interno.");
        }
    }

    return res.status(200).send("OK");
};

// ROTAS
router.post("/create-preference", protect, createPreference);
router.post("/webhook", handleWebhook);
router.get("/webhook", (req, res) => res.send("Webhook ativo. Use POST."));

module.exports = router;
