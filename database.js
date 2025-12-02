// database.js
const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// Configuração do Sequelize para conexão com MySQL
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        // Opcional: Configurações adicionais
        logging: false, // Desativa o log de consultas SQL no console
        define: {
            timestamps: true, // Adiciona createdAt e updatedAt a todos os modelos
            underscored: true, // Usa snake_case para colunas (ex: created_at)
        },
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

/**
 * Função para conectar ao banco de dados e sincronizar modelos (criar tabelas se não existirem).
 */
async function connectDB(models) {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados MySQL estabelecida com sucesso.');

        // 1. Inicializa os modelos
        models.initModels(sequelize);

        // 2. Cria as tabelas se elas não existirem (apenas no ambiente de desenvolvimento/primeira execução)
        // { alter: true } é mais seguro para produção, mas pode levar mais tempo.
        // { force: true } destrói e recria todas as tabelas (perigoso!).
        await sequelize.sync({ alter: true }); // Tenta criar as tabelas e aplicar alterações sem perder dados.

        console.log('✅ Modelos de banco de dados sincronizados (tabelas criadas/atualizadas).');

        // Cria o usuário administrador padrão se ele não existir
        await models.User.findOrCreate({
            where: { email: 'admin@solemate.com' },
            defaults: {
                full_name: 'Admin Master',
                email: 'admin@solemate.com',
                password: 'superadminpassword', // Esta senha será hashada no hook beforeCreate
                role: 'admin',
            }
        });
        console.log('✅ Usuário administrador padrão criado/verificado.');

    } catch (error) {
        console.error('❌ Não foi possível conectar ou sincronizar o banco de dados:', error.message);
        // Opcional: sair do processo se a conexão falhar
        // process.exit(1); 
    }
}

module.exports = {
    sequelize,
    connectDB
};
