// customizationController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect, admin } = require('./authMiddleware');

/**
 * @route POST /api/customization
 * @desc Salva ou Atualiza a configuração do sistema (Variáveis e Estilo)
 * @access Private/Admin
 */
const saveConfig = async (req, res) => {
    // O payload deve incluir todos os campos do modal, incluindo o estilo visual
    const { 
        mpAccessToken, frontendUrl, dbName, 
        dbUser, cloudinaryName, brevoApiKey, 
        visualStyle 
    } = req.body;

    // Validação mínima
    if (!mpAccessToken || !frontendUrl || !visualStyle) {
        return res.status(400).json({ message: 'Campos obrigatórios de configuração faltando.' });
    }

    try {
        // Como só deve haver uma configuração por sistema, usamos findOrCreate ou findOne + update.
        // Vamos usar findOrCreate e depois atualizar o registro existente.
        const [config, created] = await models.SystemConfig.findOrCreate({
            where: { id: 1 }, // Garantindo que sempre tentamos usar o registro de ID 1
            defaults: {
                mp_access_token: mpAccessToken,
                frontend_url: frontendUrl,
                db_name: dbName,
                db_user: dbUser,
                cloudinary_cloud_name: cloudinaryName,
                brevo_api_key: brevoApiKey,
                visual_style: visualStyle,
            }
        });

        if (!created) {
            // Se já existia, atualiza
            await config.update({
                mp_access_token: mpAccessToken,
                frontend_url: frontendUrl,
                db_name: dbName,
                db_user: dbUser,
                cloudinary_cloud_name: cloudinaryName,
                brevo_api_key: brevoApiKey,
                visual_style: visualStyle,
            });
        }

        res.json({ message: 'Configuração salva com sucesso!', config: config });

    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        res.status(500).json({ message: 'Erro interno ao salvar as configurações.' });
    }
};

/**
 * @route GET /api/customization
 * @desc Obtém a configuração atual do sistema
 * @access Private/Admin
 */
const getConfig = async (req, res) => {
    try {
        const config = await models.SystemConfig.findByPk(1, {
            // Exclui a chave secreta do JWT por segurança, caso ela seja adicionada no futuro, 
            // mas por enquanto, envia tudo.
            attributes: { exclude: ['id', 'created_at', 'updated_at'] } 
        });

        if (!config) {
            return res.status(404).json({ message: 'Nenhuma configuração encontrada.' });
        }

        res.json(config);

    } catch (error) {
        console.error('Erro ao buscar configuração:', error);
        res.status(500).json({ message: 'Erro interno ao buscar as configurações.' });
    }
};

// --- Definição das Rotas de Personalização ---
// Rotas protegidas por 'protect' e restritas a 'admin'
router.post('/', protect, admin, saveConfig);
router.get('/', protect, admin, getConfig);

module.exports = router;
