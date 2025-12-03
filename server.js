// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcrypt'); // 👈 Adicionado para criptografia da senha do admin

// Configuração de Variáveis de Ambiente
dotenv.config();

// Módulos Internos
const { connectDB, sequelize } = require('./database'); 
const { initModels } = require('./models'); 

// 1. Inicializar os modelos
const initializedModels = initModels(sequelize);

// 2. Definir os modelos no escopo global (Corrige o erro de importação de modelos)
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
        
        // CORREÇÃO CRÍTICA: Removendo o { force: true } que apagava o banco
        // a cada inicialização. Usamos { alter: true } para aplicar migrações
        // de schema sem perder dados.
        console.log('🔄 Sincronizando banco de dados (ALTER mode)...');
        await sequelize.sync({ alter: true }); 
        console.log('✅ Banco de dados sincronizado com sucesso.');

        // --- LÓGICA DE CRIAÇÃO DO ADMIN (SEEDER) ---
        const models = global.solematesModels;
        const adminEmail = 'admin@solemate.com';
        
        // Esta linha garante que o admin só será criado se não existir
        const adminExists = await models.User.findOne({ where: { email: adminEmail } });

        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10); // Senha: admin123
            await models.User.create({
                full_name: 'Administrador Principal',
                email: adminEmail,
                password: hashedPassword,
                role: 'admin' // 👈 Define a role como admin
            });
            console.log('👑 Usuário Admin criado automaticamente: admin@solemate.com / admin123');
        }
        // ---------------------------------------------

        // --- Inicialização do Servidor ---
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('❌ Falha na inicialização do servidor:', error);
        // Em um ambiente de produção, é melhor deixar o processo rodar para não causar loop de restart
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
app.use('/api/customization', customizationController);
app.use('/api/files', fileRoutes); 

app.get('/', (req, res) => {
    res.send('API SoleMates Rodando! Conectada com MySQL e Cloudinary.');
});

app.use((req, res, next) => {
    res.status(404).json({ message: `Rota não encontrada: ${req.originalUrl}` });
});
