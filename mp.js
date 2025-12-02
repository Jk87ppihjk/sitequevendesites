// mp.js
const mercadopago = require('mercadopago');
const dotenv = require('dotenv');

dotenv.config();

// Configuração do Mercado Pago
mercadopago.configure({
    access_token: process.env.MP_ACCESS_TOKEN
});

// A preferência de pagamento será criada no paymentController

module.exports = {
    mercadopago
};
