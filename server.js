// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

// Configuração de Variáveis de Ambiente
dotenv.config();

// Módulos Internos
const { connectDB, sequelize } = require('./database'); 
const { initModels } = require('./models'); 

// 1. Inicializar os modelos
const initializedModels = initModels(sequelize);

// 2. Definir os modelos no escopo global
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
        
        // --- CORREÇÃO AQUI ---
        // { force: true } APAGA as tabelas existentes e as recria do zero.
        // Isso resolve o erro de Foreign Key eliminando dados órfãos/inválidos.
        console.log('🔄 Sincronizando banco de dados (FORCE mode)...');
        await sequelize.sync({ force: true }); 
        console.log('✅ Banco de dados recriado e sincronizado com sucesso.');

        // --- Inicialização do Servidor ---
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('❌ Falha na inicialização do servidor:', error);
        // Não encerra o processo bruscamente para permitir ver os logs no Render
        // process.exit(1); 
    }
}

// Inicia a aplicação
initializeApp();

// --- Middlewares ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));

// --- Rotas da API ---
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/customization', customizationRoutes);
app.use('/api/files', fileRoutes); 

app.get('/', (req, res) => {
    res.send('API SoleMates Rodando! Conectada com MySQL e Cloudinary.');
});

app.use((req, res, next) => {
    res.status(404).json({ message: `Rota não encontrada: ${req.originalUrl}` });
});
