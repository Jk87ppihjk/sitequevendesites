// database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false, // Desativa logs excessivos de SQL
        port: process.env.DB_PORT || 3306,
        // CONFIGURAÇÃO CRÍTICA PARA EVITAR ETIMEDOUT:
        pool: {
            max: 5,        // Máximo de conexões simultâneas
            min: 0,        // Mínimo
            acquire: 30000,// Tempo máximo tentando conectar (30s)
            idle: 10000    // Tempo que a conexão pode ficar inativa antes de fechar (10s)
        },
        dialectOptions: {
            connectTimeout: 60000 // Aumenta timeout de conexão inicial
        }
    }
);

module.exports = { sequelize };
