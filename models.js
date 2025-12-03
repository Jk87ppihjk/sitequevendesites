// models.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

let User;
let Site;
let Comment;
let Order; 
let SystemConfig; 

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
            allowNull: true, 
            defaultValue: 0.00
        },
        price_rent: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true, 
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
        additional_links: {
            type: DataTypes.JSON, 
            allowNull: true,
            defaultValue: [],
            get() {
                const rawValue = this.getDataValue('additional_links');
                try {
                    return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
                } catch (e) {
                    return rawValue;
                }
            },
            set(value) {
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
    
    // --- 5. SystemConfig Model ---
    SystemConfig = sequelize.define('SystemConfig', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true, 
            primaryKey: true,
        },
        site_id: { 
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true, 
        },
        // Variáveis de Ambiente
        mp_access_token: { type: DataTypes.STRING, allowNull: true }, // Set to true since client might not have it initially
        frontend_url: { type: DataTypes.STRING, allowNull: true },

        // NOVOS CAMPOS DB
        db_host: { type: DataTypes.STRING, allowNull: true },
        db_name: { type: DataTypes.STRING, allowNull: true },
        db_user: { type: DataTypes.STRING, allowNull: true },
        db_password: { type: DataTypes.STRING, allowNull: true },
        
        // NOVOS CAMPOS CLOUDINARY
        cloudinary_cloud_name: { type: DataTypes.STRING, allowNull: true },
        cloudinary_api_key: { type: DataTypes.STRING, allowNull: true },
        cloudinary_api_secret: { type: DataTypes.STRING, allowNull: true },

        // OUTROS
        brevo_api_key: { type: DataTypes.STRING, allowNull: true },

        // Estilo Visual
        visual_style: { type: DataTypes.TEXT, allowNull: true }, 

    }, {
        tableName: 'system_configs',
        timestamps: true,
        underscored: true,
    });


    // --- Associações ---
    User.hasMany(Comment, { foreignKey: 'user_id' });
    Comment.belongsTo(User, { foreignKey: 'user_id' });

    Site.hasMany(Comment, { foreignKey: 'site_id' });
    Comment.belongsTo(Site, { foreignKey: 'site_id' });

    User.hasMany(Order, { foreignKey: 'user_id' });
    Order.belongsTo(User, { foreignKey: 'user_id' });

    Site.hasMany(Order, { foreignKey: 'site_id' });
    Order.belongsTo(Site, { foreignKey: 'site_id' });

    Site.hasOne(SystemConfig, { foreignKey: 'site_id' });
    SystemConfig.belongsTo(Site, { foreignKey: 'site_id' }); 

    return {
        User,
        Site,
        Comment,
        Order,
        SystemConfig 
    };
}

module.exports = {
    initModels,
    get User() { return User; },
    get Site() { return Site; },
    get Comment() { return Comment; },
    get Order() { return Order; },
    get SystemConfig() { return SystemConfig; }, 
};
