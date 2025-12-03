// paymentRoutes.js
// ==========================
// BACKEND (Node.js / Express) - CREATE PREFERENCE + WEBHOOK
// ==========================

const express = require('express');
const router = express.Router();
const { mercadopagoClient } = require('./mp'); // sua instância / client configurado
const { protect } = require('./authMiddleware');
const { Preference, Payment } = require('mercadopago'); 
const models = global.solematesModels; // ajuste se necessário

// Helper: extrai preferenceId de forma robusta (suporta variações da SDK)
function extractPreferenceId(mpResponse) {
    if (!mpResponse) return null;
    if (mpResponse.body && mpResponse.body.id) return mpResponse.body.id;
    if (mpResponse.response && mpResponse.response.id) return mpResponse.response.id;
    if (mpResponse.id) return mpResponse.id;
    return null;
}

function extractInitPoint(mpResponse) {
    if (!mpResponse) return null;
    if (mpResponse.body && mpResponse.body.init_point) return mpResponse.body.init_point;
    if (mpResponse.response && mpResponse.response.init_point) return mpResponse.response.init_point;
    if (mpResponse.init_point) return mpResponse.init_point;
    return null;
}

// -----------------------------
// CREATE PREFERENCE
// -----------------------------
const createPreference = async (req, res) => {
    try {
        const { siteId, purchaseType, price, siteName, customer } = req.body;
        const userId = req.user && req.user.id;

        console.log('[createPreference] recebido do front:', { siteId, purchaseType, price, siteName });

        if (!userId) return res.status(401).json({ message: 'Usuário não autenticado.' });
        if (!siteId || !purchaseType) return res.status(400).json({ message: 'siteId e purchaseType são obrigatórios.' });

        // Conversão e validação do preço
        const transactionPrice = Number(price);
        if (isNaN(transactionPrice)) {
            return res.status(400).json({ message: 'Preço inválido.' });
        }
        if (transactionPrice < 1) {
            return res.status(400).json({ message: 'O valor mínimo permitido pelo Mercado Pago é R$ 1,00.' });
        }

        // Validação do objeto customer mínimo
        if (!customer || !customer.fullName || !customer.email) {
            return res.status(400).json({ message: 'Dados do cliente incompletos (fullName / email são obrigatórios).' });
        }

        // Normaliza CPF / CNPJ
        const rawDocSource = (customer.cpfCnpj || customer.cpf || '').toString();
        const rawDoc = rawDocSource.replace(/\D/g, '');
        const isCnpj = rawDoc.length > 11;

        // Busca site no DB
        const site = await models.Site.findByPk(siteId);
        if (!site) return res.status(404).json({ message: 'Site não encontrado.' });

        // Cria pedido local como pending
        const order = await models.Order.create({
            user_id: userId,
            site_id: siteId,
            purchase_type: purchaseType,
            transaction_amount: Number(transactionPrice.toFixed(2)),
            status: 'pending',
        });

        // Monta preferenceData conforme Mercado Pago SDK v2
        const preferenceModule = new Preference(mercadopagoClient);
        const notificationUrl = `${process.env.BACKEND_URL}/api/payment/webhook?source=mercadopago`;

        // Garante que address fields exist to evitar validação do MP que rejeita
        const safeAddress = {
            zip_code: (customer.address && customer.address.zipCode) || '00000000',
            street_name: (customer.address && customer.address.streetName) || 'N/A',
            street_number: (customer.address && customer.address.streetNumber) || '0'
        };

        const preferenceData = {
            body: {
                items: [
                    {
                        title: purchaseType === 'sale'
                            ? `Compra do Site: ${siteName || site.name}`
                            : `Aluguel (30 dias) do Site: ${siteName || site.name}`,
                        unit_price: Number(transactionPrice.toFixed(2)),
                        quantity: 1,
                        currency_id: 'BRL'
                    }
                ],

                // Inclui payer com entity_type e identificação correta
                payer: {
                    name: customer.fullName,
                    email: customer.email,
                    entity_type: isCnpj ? "association" : "individual",
                    identification: {
                        type: isCnpj ? "CNPJ" : "CPF",
                        number: rawDoc || (isCnpj ? "00000000000000" : "00000000000")
                    },
                    phone: {
                        area_code: (customer.phone && customer.phone.area_code) || "11",
                        number: (customer.phone && customer.phone.number) || "999999999"
                    },
                    address: safeAddress
                },

                // Evita que a preferência venha sem meios de pagamento habilitados
                payment_methods: {
                    excluded_payment_types: [], // não exclui nada por padrão
                    installments: 12
                },

                back_urls: {
                    success: `${process.env.FRONTEND_URL}/compra-concluida?orderId=${order.id}`,
                    failure: `${process.env.FRONTEND_URL}/pagamento-falhou`,
                    pending: `${process.env.FRONTEND_URL}/pagamento-pendente`,
                },

                auto_return: 'approved',
                external_reference: order.id.toString(),
                notification_url: notificationUrl,
            }
        };

        console.log('[createPreference] preferenceData (preview):', {
            items: preferenceData.body.items,
            payer: { name: preferenceData.body.payer.name, email: preferenceData.body.payer.email, entity_type: preferenceData.body.payer.entity_type },
            external_reference: preferenceData.body.external_reference
        });

        // Cria preferência no MP
        const mpResponse = await preferenceModule.create(preferenceData);
        console.log('[createPreference] mpResponse raw:', typeof mpResponse === 'object' ? Object.keys(mpResponse) : mpResponse);

        const preferenceId = extractPreferenceId(mpResponse);
        const initPoint = extractInitPoint(mpResponse);

        if (!preferenceId) {
            console.error('[createPreference] preferenceId não retornado pelo Mercado Pago:', mpResponse);
            return res.status(502).json({ message: 'Falha ao criar preferência no Mercado Pago.' });
        }

        // Salva ID da preferência no pedido local (usa fallback robusto)
        order.mp_preference_id = preferenceId;
        await order.save();

        // Retorna preferenceId corretamente para o frontend (o Brick espera isso)
        return res.json({
            preferenceId: preferenceId,
            initPoint: initPoint || null
        });

    } catch (error) {
        console.error('[createPreference] ERRO:', error && (error.message || error));
        // Se MP trouxe detalhes, retorne para facilitar debug
        const mpCause = error && (error.cause || error.message || null);
        return res.status(500).json({ message: 'Erro interno ao criar preferência.', details: mpCause });
    }
};

// -----------------------------
// WEBHOOK
// -----------------------------
const handleWebhook = async (req, res) => {
    const { topic, id } = req.query;
    const paymentId = id || req.body?.data?.id || req.body?.id;

    // Aceita várias formas de notificação
    if (!paymentId) {
        console.log('[webhook] recebido sem paymentId - ignorando');
        return res.status(200).send('OK');
    }

    try {
        const paymentModule = new Payment(mercadopagoClient);
        const payment = await paymentModule.get({ id: paymentId });

        // Em alguns retornos, a estrutura está em body
        const paymentData = payment.body || payment.response || payment;

        console.log('[webhook] paymentData:', { id: paymentData.id, status: paymentData.status, external_reference: paymentData.external_reference });

        const orderId = paymentData.external_reference;
        if (!orderId) {
            console.error('[webhook] payment sem external_reference - ignorando');
            return res.status(200).send('OK');
        }

        const order = await models.Order.findByPk(orderId);
        if (!order) {
            console.error(`[webhook] Pedido local ${orderId} não encontrado.`);
            return res.status(404).json({ message: 'Pedido não encontrado.' });
        }

        let newStatus = order.status;

        if (paymentData.status === 'approved') {
            newStatus = order.purchase_type === 'rent' ? 'rented' : 'completed';
            if (order.purchase_type === 'rent') {
                order.rent_expiry_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }
        } else if (paymentData.status === 'pending' || paymentData.status === 'in_process') {
            newStatus = 'pending';
        } else if (paymentData.status === 'rejected' || paymentData.status === 'cancelled') {
            newStatus = 'rejected';
        }

        if (order.status !== newStatus) {
            order.status = newStatus;
            await order.save();
            console.log(`[webhook] Pedido ${orderId} atualizado para ${newStatus}`);
        } else {
            console.log(`[webhook] Pedido ${orderId} já estava em ${newStatus}`);
        }

        return res.status(200).send('OK');

    } catch (error) {
        console.error('[webhook] ERRO:', error && (error.message || error));
        return res.status(500).send('Erro interno.');
    }
};

// Rotas
router.post('/create-preference', protect, createPreference);
router.post('/webhook', handleWebhook);
router.get('/webhook', (req, res) => res.send('Webhook ativo. Use POST.'));

module.exports = router;
