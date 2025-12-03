// customizationController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect, admin } = require('./authMiddleware');
const multer = require('multer');
const cloudinary = require('./cloudinary'); // Certifique-se que este arquivo existe e exporta o cloudinary configurado
const fs = require('fs');

// Configuração do Multer para upload temporário
const upload = multer({ dest: 'uploads/' });

/**
 * SALVAR CONFIGURAÇÃO (Cliente)
 */
const saveConfig = async (req, res) => {
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

        // Mapeia para o banco de dados
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

        // Procura ou cria a configuração
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
        res.status(500).json({ message: 'Erro interno ao salvar configurações.' });
    }
};

/**
 * BUSCAR CONFIGURAÇÃO (Admin ou Cliente)
 */
const getConfig = async (req, res) => {
    const { siteId, userId } = req.query; 
    
    // Se for admin e passar userId, vê a config daquele usuário.
    // Se for cliente, vê a própria config.
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
        res.status(500).json({ message: 'Erro interno ao buscar configurações.' });
    }
};

/**
 * UPLOAD DO ZIP FRONTEND (Apenas Admin)
 */
const uploadZip = async (req, res) => {
    const { siteId, userId } = req.body;
    const file = req.file;

    if (!file || !siteId || !userId) {
        return res.status(400).json({ message: 'Arquivo ZIP, Site ID e User ID são obrigatórios.' });
    }

    try {
        console.log(`Iniciando upload do ZIP para Site ${siteId}, Usuário ${userId}`);

        // 1. Upload para o Cloudinary (Resource Type: raw para arquivos ZIP)
        const result = await cloudinary.uploader.upload(file.path, {
            resource_type: 'raw', 
            folder: 'frontends_clientes',
            public_id: `frontend_site_${siteId}_user_${userId}_${Date.now()}`,
            use_filename: true,
            unique_filename: false
        });

        // 2. Remove o arquivo temporário
        fs.unlinkSync(file.path);

        // 3. Salva a URL no banco de dados
        const [config, created] = await models.SystemConfig.findOrCreate({
            where: { site_id: siteId, user_id: userId },
            defaults: { site_id: siteId, user_id: userId }
        });

        await config.update({ frontend_zip_url: result.secure_url });

        res.json({ message: 'Upload realizado com sucesso!', url: result.secure_url });

    } catch (error) {
        console.error('Erro no upload ZIP:', error);
        // Tenta remover o arquivo temporário se der erro
        if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(500).json({ message: 'Erro ao fazer upload do arquivo.' });
    }
};

// --- ROTAS ---
router.post('/', protect, saveConfig); 
router.get('/', protect, getConfig); 
// Rota de Upload (Campo do arquivo deve ser 'frontendZip')
router.post('/upload-zip', protect, admin, upload.single('frontendZip'), uploadZip);

module.exports = router;
