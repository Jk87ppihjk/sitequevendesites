// mp.js
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import dotenv from 'dotenv';

// Carrega variáveis de ambiente
dotenv.config();

// Validação para evitar erro humano de esquecer a chave
if (!process.env.MP_ACCESS_TOKEN) {
    console.error("ERRO CRÍTICO: MP_ACCESS_TOKEN não definido no arquivo .env");
    process.exit(1);
}

// Configuração do Cliente
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: { timeout: 5000 } // Timeout para evitar travamentos
});

// Inicializa as APIs necessárias
const preference = new Preference(client);
const payment = new Payment(client);

export { preference, payment };
