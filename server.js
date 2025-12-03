// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

// Configuração de Variáveis de Ambiente
dotenv.config();

// Módulos Internos
const { connectDB } = require('./database');
const models = require('./models');

// Controladores de Rotas
const authRoutes = require('./authController');
const siteRoutes = require('./siteController');
const orderRoutes = require('./orderController');
const paymentRoutes = require('./paymentController');
const customizationRoutes = require('./customizationController'); // NOVO: Importa o novo controlador

const app = express();

// --- Conexão com o Banco de Dados ---
connectDB(models);

// --- Middlewares ---
app.use(express.json()); // Body parser para JSON
app.use(express.urlencoded({ extended: true })); // Body parser para formulários

// --- CONFIGURAÇÃO CORS PERMISSIVA (PARA QUALQUER ORIGEM) ---
// Aviso: Em produção, é mais seguro especificar domínios.
app.use(cors({
    origin: '*', // Permite qualquer domínio
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));
// -----------------------------------------------------------

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/customization', customizationRoutes); // NOVO: Adiciona a rota

// --- Rota de Teste ---
app.get('/', (req, res) => {
    res.send('API SoleMates Rodando! Conectada com MySQL e Cloudinary.');
});

// --- Rota 404/Erro ---
app.use((req, res, next) => {
    res.status(404).json({ message: `Rota não encontrada: ${req.originalUrl}` });
});

// --- Inicialização do Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
