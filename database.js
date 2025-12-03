// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Importações do Banco de Dados
const { connectDB, sequelize } = require('./database');
const models = require('./models');

// Importação dos Controladores
const authController = require('./authController');
const siteController = require('./siteController');
const paymentController = require('./paymentController');
const orderController = require('./orderController');
const customizationController = require('./customizationController'); // Seu novo controller

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos Estáticos (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// --- Conexão e Inicialização do Banco ---
connectDB(); // Conecta ao MySQL
models.initModels(sequelize); // Inicia as tabelas

// Sincronização (Use { force: true } UMA VEZ se precisar recriar tabelas com bugs)
// Depois volte para { alter: true }
sequelize.sync({ alter: true }).then(() => {
    console.log('✅ Modelos de banco de dados sincronizados.');
    createDefaultAdmin();
}).catch(err => {
    console.error('Erro ao sincronizar modelos:', err);
});

// Criar Admin Padrão (Segurança)
async function createDefaultAdmin() {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
        const adminExists = await models.User.findOne({ where: { email: adminEmail } });
        if (!adminExists) {
            await models.User.create({
                full_name: 'Administrador',
                email: adminEmail,
                password: process.env.ADMIN_PASSWORD || 'admin123', // Mude no .env!
                role: 'admin'
            });
            console.log('✅ Usuário administrador padrão criado.');
        }
    } catch (error) {
        console.error('Erro ao criar admin padrão:', error);
    }
}

// --- Rotas da API ---
app.use('/api/auth', authController);
app.use('/api/sites', siteController);
app.use('/api/payment', paymentController);
app.use('/api/orders', orderController);
app.use('/api/customization', customizationController); // Nova rota de config/upload

// Rota de Fallback (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
