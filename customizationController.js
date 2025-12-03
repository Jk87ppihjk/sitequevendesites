// customizationController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect, admin } = require('./authMiddleware');
const multer = require('multer');
const cloudinary = require('./cloudinary'); 
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// --- SALVAR CONFIG ---
const saveConfig = async (req, res) => {
    const { 
        siteId, mpAccessToken, frontendUrl, 
        dbHost, dbName, dbUser, dbPassword, 
        cloudinaryName, cloudinaryApiKey, cloudinaryApiSecret, 
        brevoApiKey, visualStyle 
    } = req.body;

    if (!siteId) return res.status(400).json({ message: 'Site ID obrigatório.' });

    try {
        const userId = req.user.id; 
        const configData = {
            site_id: siteId,
            user_id: userId,
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

        const [config, created] = await models.SystemConfig.findOrCreate({
            where: { site_id: siteId, user_id: userId },
            defaults: configData
        });

        if (!created) {
            await config.update(configData);
        }
        res.json({ message: 'Configuração salva!', config });

    } catch (error) {
        console.error('Erro salvar config:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

// --- BUSCAR CONFIG ---
const getConfig = async (req, res) => {
    const { siteId, userId } = req.query; 
    
    let targetUserId = req.user.id;
    if (req.user.role === 'admin' && userId) {
        targetUserId = userId;
    }

    if (!siteId) return res.status(400).json({ message: 'Site ID obrigatório.' });

    try {
        const config = await models.SystemConfig.findOne({
            where: { site_id: siteId, user_id: targetUserId }
        });

        if (!config) return res.status(404).json({ message: 'Configuração não encontrada.' });
        res.json(config);

    } catch (error) {
        console.error('Erro buscar config:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

// --- UPLOAD DO ZIP ---
const uploadZip = async (req, res) => {
    const { siteId, userId } = req.body;
    const file = req.file;

    if (!file || !siteId || !userId) {
        return res.status(400).json({ message: 'Dados incompletos (Arquivo, SiteID, UserID).' });
    }

    try {
        const result = await cloudinary.uploader.upload(file.path, {
            resource_type: 'raw', 
            folder: 'frontends_clientes',
            public_id: `frontend_site_${siteId}_user_${userId}_${Date.now()}`,
            use_filename: true,
            unique_filename: false
        });

        fs.unlinkSync(file.path); 

        const [config] = await models.SystemConfig.findOrCreate({
            where: { site_id: siteId, user_id: userId },
            defaults: { site_id: siteId, user_id: userId }
        });

        await config.update({ frontend_zip_url: result.secure_url });

        res.json({ message: 'Upload realizado!', url: result.secure_url });

    } catch (error) {
        console.error('Erro upload ZIP:', error);
        if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(500).json({ message: 'Erro ao fazer upload.' });
    }
};

router.post('/', protect, saveConfig); 
router.get('/', protect, getConfig); 
router.post('/upload-zip', protect, admin, upload.single('frontendZip'), uploadZip);

module.exports = router;
