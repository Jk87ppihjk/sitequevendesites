// mp.js
const { MercadoPagoConfig } = require('mercadopago');
const dotenv = require('dotenv');

dotenv.config();

// Configuração do Mercado Pago
// Cria uma instância da classe MercadoPagoConfig
const mercadopagoClient = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    // Define o valor do show_promise_error para false para desativar a exibição do aviso de erro de promessa.
    show_promise_error: false, 
});

// Nota: Agora você usa mercadopagoClient.preferences.create, etc.

module.exports = {
    mercadopagoClient
};
