// customizationController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect } = require('./authMiddleware');

/**
 * SALVAR CONFIGURAÇÃO (Cliente)
 */
const saveConfig = async (req, res) => {
    // 1. Recebe os dados do frontend (camelCase)
    const { 
        siteId, 
        mpAccessToken, frontendUrl, 
        dbHost, dbName, dbUser, dbPassword, 
        cloudinaryName, cloudinaryApiKey, cloudinaryApiSecret, 
        brevoApiKey, 
        visualStyle 
    } = req.body;

    if (!siteId) return res.status(400).json({ message: 'Site ID obrigatório.' });

    try {
        const userId = req.user.id; // ID do usuário logado

        // 2. Mapeia para o banco de dados (snake_case)
        const configData = {
            site_id: siteId,
            user_id: userId, // IMPORTANTE: Salva quem é o dono!
            mp_access_token: mpAccessToken,
            frontend_url: frontendUrl,
            db_host: dbHost,
            db_name: dbName,
            db_user: dbUser,
            db_password: dbPassword,
            cloudinary_cloud_name: cloudinaryName,
            cloudinary_api_key: cloudinaryApiKey,
            cloudinary_api_secret: cloudinaryApiSecret,
            brevo_api_key: brevoApiKey,
            visual_style: visualStyle,
        };

        // 3. Procura se JÁ EXISTE uma config deste SITE para este USUÁRIO
        const [config, created] = await models.SystemConfig.findOrCreate({
            where: { site_id: siteId, user_id: userId },
            defaults: configData
        });

        if (!created) {
            await config.update(configData);
        }

        res.json({ message: 'Configuração salva com sucesso!', config });

    } catch (error) {
        console.error('Erro ao salvar config:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

/**
 * BUSCAR CONFIGURAÇÃO (Admin ou Cliente)
 */
const getConfig = async (req, res) => {
    const { siteId, userId } = req.query; // Admin pode passar userId na query
    
    // Se for admin e passou userId, usa o userId passado. Se for cliente, usa o próprio ID.
    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && userId) {
        targetUserId = userId;
    }

    if (!siteId) return res.status(400).json({ message: 'Site ID obrigatório.' });

    try {
        const config = await models.SystemConfig.findOne({
            where: { site_id: siteId, user_id: targetUserId }
        });

        if (!config) {
            return res.status(404).json({ message: 'Configuração não encontrada.' });
        }

        res.json(config);

    } catch (error) {
        console.error('Erro busca config:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

router.post('/', protect, saveConfig); 
router.get('/', protect, getConfig); 

module.exports = router;
