// paymentController.js (versão corrigida)
// ==========================
// BACKEND (Node.js / Express)
// ==========================

const express = require('express');
const router = express.Router();
const { mercadopagoClient } = require('./mp'); // seu cliente já configurado
const { protect } = require('./authMiddleware');
const { Preference, Payment } = require('mercadopago');
const models = global.solematesModels;

// helpers
function splitName(fullName = '') {
    const parts = fullName.trim().split(/\s+/);
    return {
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' ') || parts[0] || ''
    };
}

const createPreference = async (req, res) => {
    try {
        console.log("========== [createPreference] ==========");
        console.log("[BODY RECEBIDO]:", req.body);

        const { siteId, purchaseType, price, siteName, customer } = req.body;
        const userId = req.user && req.user.id;

        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

        const transactionPrice = Number(price);
        if (!transactionPrice || isNaN(transactionPrice) || transactionPrice < 1) {
            return res.status(400).json({
                message: "O valor mínimo permitido pelo Mercado Pago é R$ 1,00."
            });
        }

        // Busca site
        const site = await models.Site.findByPk(siteId);
        if (!site) return res.status(404).json({ message: 'Site não encontrado.' });

        // Cria pedido no DB
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: transactionPrice,
            status: 'pending'
        });

        console.log(`[createPreference] Pedido criado -> OrderID = ${order.id}`);

        const preferenceModule = new Preference(mercadopagoClient);
        const notificationUrl = `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`;

        // Proteções para campos opcionais do cliente
        const fullName = (customer && customer.fullName) ? customer.fullName : 'Cliente';
        const email = (customer && customer.email) ? customer.email : `no-reply+${Date.now()}@example.com`;
        const cpfCnpjRaw = (customer && (customer.cpfCnpj || customer.cpf)) ? (customer.cpfCnpj || customer.cpf) : '';
        const rawDoc = ('' + cpfCnpjRaw).replace(/\D/g, '');
        const isCnpj = rawDoc.length > 11;

        const nameParts = splitName(fullName);

        // Garantir telefone mínimo (evita validações do MP)
        // Tente usar dados reais se disponíveis; caso contrário, use mocks válidos.
        const phoneObj = (customer && customer.phone) ? {
            area_code: String(customer.phone.area_code || '').replace(/\D/g, '').slice(0, 2) || '11',
            number: String(customer.phone.number || '').replace(/\D/g, '').slice(0, 9) || '999999999'
        } : { area_code: '11', number: '999999999' };

        // Endereço (proteger de undefined)
        const address = (customer && customer.address) ? customer.address : {};
        const zipCode = address.zipCode || address.zip_code || '';

        // Monta a preferência de forma compatível com Bricks
        const preferenceData = {
            body: {
                items: [
                    {
                        id: String(siteId || '0'),
                        title: purchaseType === 'sale'
                            ? `Compra do Site: ${siteName}`
                            : `Aluguel (30 dias) do Site: ${siteName}`,
                        description: `Transação ${purchaseType} - ${siteName}`,
                        picture_url: site && site.main_image_url ? site.main_image_url : undefined,
                        quantity: 1,
                        unit_price: Number(transactionPrice),
                        currency_id: "BRL"
                    }
                ],

                // Use o formato básico aceito pelo Preference API.
                // Não inventamos sub-objetos exóticos; isso evita rejeição pelo Bricks.
                payment_methods: {
                    excluded_payment_methods: [],
                    excluded_payment_types: [],
                    installments: 1
                },

                payer: {
                    email: email,
                    first_name: nameParts.first_name,
                    last_name: nameParts.last_name,
                    phone: {
                        area_code: phoneObj.area_code,
                        number: phoneObj.number
                    },
                    identification: rawDoc ? {
                        type: isCnpj ? "CNPJ" : "CPF",
                        number: rawDoc
                    } : undefined,
                    address: zipCode ? {
                        zip_code: zipCode,
                        street_name: address.streetName || address.street_name || '',
                        street_number: address.streetNumber || address.street_number || ''
                    } : undefined
                },

                back_urls: {
                    success: `${process.env.FRONTEND_URL}/compra-concluida?orderId=${order.id}`,
                    failure: `${process.env.FRONTEND_URL}/pagamento-falhou`,
                    pending: `${process.env.FRONTEND_URL}/pagamento-pendente`
                },

                // auto_return para cartões
                auto_return: "approved",
                external_reference: order.id.toString(),
                notification_url: notificationUrl
            }
        };

        // Observação: em contas com PIX habilitado o MP irá permitir PIX automaticamente.
        // Se quiser forçar explicitamente PIX, você pode incluir campos adicionais aqui
        // mas a forma acima é a mais compatível para Bricks.

        console.log("[createPreference] preferenceData (preview):", {
            items: preferenceData.body.items,
            payer: {
                email: preferenceData.body.payer.email,
                first_name: preferenceData.body.payer.first_name,
                last_name: preferenceData.body.payer.last_name,
                identification: preferenceData.body.payer.identification
            },
            payment_methods: preferenceData.body.payment_methods,
            external_reference: preferenceData.body.external_reference
        });

        // Cria preferência no MP (SDK)
        const mpResponse = await preferenceModule.create(preferenceData);

        console.log("[createPreference] Preferência criada com sucesso!");
        console.log("MP Preference ID:", mpResponse.id);
        console.log("MP Preference API Response keys:", Object.keys(mpResponse || {}));
        // Se disponível, logue o conteúdo bruto para depuração (use com cautela).
        if (mpResponse.api_response) {
            console.log("[createPreference] mpResponse.api_response resumo:", {
                id: mpResponse.api_response.id,
                total_amount: mpResponse.api_response.total_amount,
                items: mpResponse.api_response.items && mpResponse.api_response.items.map(i => ({ title: i.title, unit_price: i.unit_price })),
                payment_methods: mpResponse.api_response.payment_methods
            });
        }

        // Salva o ID da preferência no pedido
        order.mp_preference_id = mpResponse.id;
        await order.save();

        console.log("[createPreference] Preferência salva no banco ✔️");

        res.json({
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point
        });

    } catch (err) {
        console.error("🔥 ERRO NO createPreference:", err);
        // Para facilitar debug, retornamos também o stack em dev (remova em produção)
        res.status(500).json({
            message: "Erro interno ao criar preferência.",
            error: err.message
        });
    }
};

const handleWebhook = async (req, res) => {
    try {
        const { topic, id } = req.query;
        const paymentId = id || req.body?.data?.id || req.body?.id;

        if (!paymentId) return res.status(200).send('OK');

        const paymentModule = new Payment(mercadopagoClient);
        const payment = await paymentModule.get({ id: paymentId });

        const orderId = payment.external_reference;
        if (!orderId) return res.status(200).send('OK');

        const order = await models.Order.findByPk(orderId);
        if (!order) return res.status(404).json({ message: "Pedido não encontrado." });

        let newStatus = order.status;

        if (payment.status === "approved") {
            newStatus = order.purchase_type === "rent" ? "rented" : "completed";
            if (order.purchase_type === "rent") {
                order.rent_expiry_date = new Date(Date.now() + 30 * 86400000);
            }
        } else if (payment.status === "pending") newStatus = "pending";
        else if (payment.status === "rejected") newStatus = "rejected";

        order.status = newStatus;
        await order.save();

        res.status(200).send("OK");

    } catch (err) {
        console.error("🔥 ERRO NO WEBHOOK:", err);
        res.status(500).send("Erro interno.");
    }
};

// Rotas
router.post('/create-preference', protect, createPreference);
router.post('/webhook', handleWebhook);
router.get('/webhook', (req, res) => res.send("Webhook ativo. Use POST."));

module.exports = router;
