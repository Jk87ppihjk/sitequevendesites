// models.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

let User;
let Site;
let Comment;
let Order; 
let SystemConfig; 

function initModels(sequelize) {
    // --- 1. User ---
    User = sequelize.define('User', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        full_name: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
        password: { type: DataTypes.STRING, allowNull: false },
        role: { type: DataTypes.ENUM('user', 'admin'), defaultValue: 'user' },
    }, {
        tableName: 'Users', // FORÇA o uso da tabela Users (Maiúsculo)
        underscored: false, // Usa createdAt/updatedAt
        timestamps: true,
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

    // --- 2. Site ---
    Site = sequelize.define('Site', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        price_sale: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0.00 },
        price_rent: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0.00 },
        main_image_url: { type: DataTypes.STRING, allowNull: false },
        site_link: { type: DataTypes.STRING, allowNull: false },
        additional_links: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
        is_available: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
        tableName: 'Sites', // FORÇA o uso da tabela Sites (Maiúsculo)
        underscored: false, // Usa createdAt/updatedAt
        timestamps: true
    });

    // --- 3. Comment ---
    Comment = sequelize.define('Comment', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        rating: { type: DataTypes.INTEGER, allowNull: false },
        comment_text: { type: DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'Comments', // FORÇA o uso da tabela Comments (Maiúsculo)
        underscored: false, // Usa createdAt/updatedAt
        timestamps: true,
    });

    // --- 4. Order ---
    Order = sequelize.define('Order', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        mp_preference_id: { type: DataTypes.STRING, allowNull: true },
        status: { type: DataTypes.ENUM('pending', 'approved', 'rejected', 'rented', 'expired', 'completed'), defaultValue: 'pending' },
        transaction_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        purchase_type: { type: DataTypes.ENUM('sale', 'rent'), allowNull: false },
        rent_expiry_date: { type: DataTypes.DATE, allowNull: true },
    }, {
        tableName: 'Orders', // FORÇA o uso da tabela Orders (Maiúsculo)
        underscored: false, // Usa createdAt/updatedAt
        timestamps: true,
    });
    
    // --- 5. SystemConfig ---
    SystemConfig = sequelize.define('SystemConfig', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        site_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false }, 
        
        mp_access_token: { type: DataTypes.STRING, allowNull: true }, 
        frontend_url: { type: DataTypes.STRING, allowNull: true },

        db_host: { type: DataTypes.STRING, allowNull: true },
        db_name: { type: DataTypes.STRING, allowNull: true },
        db_user: { type: DataTypes.STRING, allowNull: true },
        db_password: { type: DataTypes.STRING, allowNull: true },
        
        cloudinary_cloud_name: { type: DataTypes.STRING, allowNull: true },
        cloudinary_api_key: { type: DataTypes.STRING, allowNull: true },
        cloudinary_api_secret: { type: DataTypes.STRING, allowNull: true },

        brevo_api_key: { type: DataTypes.STRING, allowNull: true },
        visual_style: { type: DataTypes.TEXT, allowNull: true }, 
        
        frontend_zip_url: { type: DataTypes.STRING, allowNull: true },
    }, {
        tableName: 'system_configs', // Mantém minúsculo pois parece ser uma tabela nova/específica
        timestamps: true,
        underscored: true,
    });

    // Associações (Mantendo os Foreign Keys explícitos para garantir o vínculo)
    User.hasMany(Comment, { foreignKey: 'user_id' });
    Comment.belongsTo(User, { foreignKey: 'user_id' });

    Site.hasMany(Comment, { foreignKey: 'site_id' });
    Comment.belongsTo(Site, { foreignKey: 'site_id' });

    User.hasMany(Order, { foreignKey: 'user_id' });
    Order.belongsTo(User, { foreignKey: 'user_id' });

    Site.hasMany(Order, { foreignKey: 'site_id' });
    Order.belongsTo(Site, { foreignKey: 'site_id' });

    Site.hasMany(SystemConfig, { foreignKey: 'site_id' });
    SystemConfig.belongsTo(Site, { foreignKey: 'site_id' });
    
    User.hasMany(SystemConfig, { foreignKey: 'user_id' });
    SystemConfig.belongsTo(User, { foreignKey: 'user_id' });

    return { User, Site, Comment, Order, SystemConfig };
}

module.exports = { initModels };
