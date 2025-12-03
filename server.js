// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

// Configuração de Variáveis de Ambiente
dotenv.config();

// Módulos Internos
// CORREÇÃO: Importar a instância 'sequelize' e a função 'connectDB'
const { connectDB, sequelize } = require('./database'); 
// CORREÇÃO: Importar apenas a função 'initModels'
const { initModels } = require('./models'); 

// 1. Inicializar os modelos ANTES de carregar os controladores de rota
const initializedModels = initModels(sequelize);

// 2. ATENÇÃO: Definir os modelos no escopo global para que os controllers possam acessá-los
global.solematesModels = initializedModels; 


// Controladores de Rotas
const authRoutes = require('./authController');
const siteRoutes = require('./siteController');
const orderRoutes = require('./orderController');
const paymentRoutes = require('./paymentController');
const customizationRoutes = require('./customizationController');
const fileRoutes = require('./fileController');

const app = express();

// --- Conexão e Sincronização com o Banco de Dados ---
const initializeApp = async () => {
    try {
        await connectDB();
        
        // CORREÇÃO CRÍTICA: Sincronizar modelos para criar tabelas no banco de dados
        // Use { force: true } para recriar as tabelas (cuidado: apaga todos os dados!)
        // Use { alter: true } para tentar adicionar colunas, mantendo os dados existentes
        await sequelize.sync({ alter: true }); // Escolha o método de sincronização ideal para você
        console.log('✅ Banco de dados sincronizado (tabelas criadas/atualizadas).');

        // --- Inicialização do Servidor ---
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('❌ Falha na inicialização do servidor:', error);
        process.exit(1);
    }
}

// Inicia a aplicação após a sincronização do DB
initializeApp();


// --- Middlewares ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURAÇÃO CORS PERMISSIVA (PARA QUALQUER ORIGEM) ---
app.use(cors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));
// -----------------------------------------------------------

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/customization', customizationRoutes);
app.use('/api/files', fileRoutes); 

// --- Rota de Teste ---
app.get('/', (req, res) => {
    res.send('API SoleMates Rodando! Conectada com MySQL e Cloudinary.');
});

// --- Rota 404/Erro ---
app.use((req, res, next) => {
    res.status(404).json({ message: `Rota não encontrada: ${req.originalUrl}` });
});
