// models.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

let User;
let Site;
let Comment;
let Order; // Adicionado modelo de pedido/compra

/**
 * Função para definir todos os modelos e suas associações.
 * @param {import('sequelize').Sequelize} sequelize A instância do Sequelize conectada.
 */
function initModels(sequelize) {
    // --- 1. User Model ---
    User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        full_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        role: {
            type: DataTypes.ENUM('user', 'admin'),
            defaultValue: 'user',
        },
    }, {
        hooks: {
            // Hash da senha antes de salvar no banco de dados
            beforeCreate: async (user) => {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(user.password, salt);
            },
            beforeUpdate: async (user) => {
                if (user.changed('password')) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            },
        }
    });

    // --- 2. Site (Product) Model ---
    Site = sequelize.define('Site', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        price_sale: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true, // Pode ser apenas aluguel
            defaultValue: 0.00
        },
        price_rent: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true, // Pode ser apenas venda
            defaultValue: 0.00
        },
        main_image_url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        site_link: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isUrl: true,
            }
        },
        // Links adicionais serão armazenados como JSON string
        additional_links: {
            type: DataTypes.JSON, // Armazenado como TEXT/JSON no MySQL
            allowNull: true,
            defaultValue: [],
            get() {
                // Se for string, tenta fazer o parse
                const rawValue = this.getDataValue('additional_links');
                try {
                    return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
                } catch (e) {
                    return rawValue;
                }
            },
            set(value) {
                // Garante que seja armazenado como JSON string
                this.setDataValue('additional_links', JSON.stringify(value));
            }
        },
        is_available: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        }
    });

    // --- 3. Comment/Review Model ---
    Comment = sequelize.define('Comment', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        rating: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 5,
            }
        },
        comment_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        // userId e siteId serão adicionados pelas associações
    });

    // --- 4. Order Model (para rastrear compras e aluguéis) ---
    Order = sequelize.define('Order', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        mp_preference_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected', 'rented', 'expired'),
            defaultValue: 'pending',
        },
        transaction_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        purchase_type: {
            type: DataTypes.ENUM('sale', 'rent'),
            allowNull: false,
        },
        rent_expiry_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    });


    // --- Associações ---
    // User 1:N Site (O usuário tem muitos Sites/Produtos comprados ou alugados. O Site é o que está sendo vendido.)
    // A propriedade de "propriedade/aluguel" será rastreada pelo modelo Order

    // User 1:N Comment
    User.hasMany(Comment, { foreignKey: 'user_id' });
    Comment.belongsTo(User, { foreignKey: 'user_id' });

    // Site 1:N Comment
    Site.hasMany(Comment, { foreignKey: 'site_id' });
    Comment.belongsTo(Site, { foreignKey: 'site_id' });

    // User 1:N Order
    User.hasMany(Order, { foreignKey: 'user_id' });
    Order.belongsTo(User, { foreignKey: 'user_id' });

    // Site 1:N Order (Um Site pode estar em muitos pedidos/compras)
    Site.hasMany(Order, { foreignKey: 'site_id' });
    Order.belongsTo(Site, { foreignKey: 'site_id' });

    // Retorna todos os modelos definidos
    return {
        User,
        Site,
        Comment,
        Order
    };
}

module.exports = {
    initModels,
    // Exporta modelos para que possam ser importados diretamente após a inicialização
    get User() { return User; },
    get Site() { return Site; },
    get Comment() { return Comment; },
    get Order() { return Order; },
};
