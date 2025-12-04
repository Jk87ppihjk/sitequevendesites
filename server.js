// server.js (VERSÃO FINAL ESTRUTURALMENTE CORRIGIDA)
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcrypt');

// Configuração de Variáveis de Ambiente
dotenv.config();

// Módulos Internos
const { connectDB, sequelize } = require('./database'); 
const { initModels } = require('./models'); 

const app = express();

// --- Middlewares (Mantidos no escopo global para o app) ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));

// --- Conexão e Sincronização com o Banco de Dados ---
const initializeApp = async () => {
    try {
        await connectDB();
        
        // 1. Inicializar os modelos
        const initializedModels = initModels(sequelize);

        // 2. Definir os modelos no escopo global (ANTES de importar as rotas)
        global.solematesModels = initializedModels; 

        // 3. Sincronizar o banco de dados (AQUI OS MODELOS ESTÃO PRONTOS)
        console.log('🔄 Sincronizando banco de dados (ALTER mode)...');
        await sequelize.sync({ alter: true }); 
        console.log('✅ Banco de dados sincronizado com sucesso.');

        // --- LÓGICA DE CRIAÇÃO DO ADMIN (SEEDER) ---
        const models = global.solematesModels;
        const adminEmail = 'admin@solemate.com';
        
        const adminExists = await models.User.findOne({ where: { email: adminEmail } });

        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10); // Senha: admin123
            await models.User.create({
                full_name: 'Administrador Principal',
                email: adminEmail,
                password: hashedPassword,
                role: 'admin'
            });
            console.log('👑 Usuário Admin criado automaticamente: admin@solemate.com / admin123');
        }
        // ---------------------------------------------
        
        // --- IMPORTAÇÃO E USO DAS ROTAS (CORREÇÃO ESTRUTURAL) ---
        // As rotas SÓ SÃO importadas APÓS a inicialização completa dos modelos.
        // Isto resolve a falha de 'require' síncrono.
        const authRoutes = require('./authController');
        const siteRoutes = require('./siteController');
        const orderRoutes = require('./orderController');
        const paymentRoutes = require('./paymentController');
        const customizationRoutes = require('./customizationController');
        const fileRoutes = require('./fileController');

        app.use('/api/auth', authRoutes);
        app.use('/api/sites', siteRoutes);
        app.use('/api/orders', orderRoutes);
        app.use('/api/payment', paymentRoutes);
        app.use('/api/customization', customizationRoutes);
        app.use('/api/files', fileRoutes); 
        // ---------------------------------------------------------

        // --- Inicialização do Servidor ---
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('❌ Falha na inicialização do servidor:', error);
    }
}

// Inicia a aplicação
initializeApp();

app.get('/', (req, res) => {
    res.send('API SoleMates Rodando! Conectada com MySQL e Cloudinary.');
});

app.use((req, res, next) => {
    res.status(404).json({ message: `Rota não encontrada: ${req.originalUrl}` });
});
