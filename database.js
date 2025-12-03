// database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuração da conexão
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false, // Define como console.log para ver queries se precisar depurar
        port: process.env.DB_PORT || 3306,
        // Configuração de Pool para evitar queda de conexão (ETIMEDOUT)
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        dialectOptions: {
            connectTimeout: 60000
        }
    }
);

// Função para testar a conexão
const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados MySQL estabelecida com sucesso.');
    } catch (error) {
        console.error('❌ Não foi possível conectar ao banco de dados:', error);
        process.exit(1); // Encerra o processo se falhar
    }
};

module.exports = { sequelize, connectDB };
