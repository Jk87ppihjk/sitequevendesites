// customizationController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect, admin } = require('./authMiddleware');

/**
 * @route POST /api/customization
 * @desc Salva ou Atualiza a configuração do sistema POR SITE
 * @access Private (Agora permite USUÁRIO COMUM para input de variáveis)
 */
const saveConfig = async (req, res) => {
    const { 
        siteId, // Novo campo obrigatório
        mpAccessToken, frontendUrl, dbName, 
        dbUser, cloudinaryName, brevoApiKey, 
        visualStyle 
    } = req.body;

    if (!siteId || !mpAccessToken || !frontendUrl || !visualStyle) {
        return res.status(400).json({ message: 'Campos obrigatórios de configuração faltando (incluindo siteId).' });
    }

    try {
        // Validação adicional: Garantir que o usuário logado é o dono do site
        const order = await models.Order.findOne({
            where: { user_id: req.user.id, site_id: siteId, status: ['completed', 'rented'] }
        });
        
        if (!order && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Você não tem permissão para configurar este site.' });
        }


        // Usa site_id para encontrar ou criar a configuração
        const [config, created] = await models.SystemConfig.findOrCreate({
            where: { site_id: siteId },
            defaults: {
                site_id: siteId,
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

        res.json({ message: `Configuração salva com sucesso para o Site ID ${siteId}!`, config: config });

    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        res.status(500).json({ message: 'Erro interno ao salvar as configurações.' });
    }
};

/**
 * @route GET /api/customization
 * @desc Obtém a configuração atual do sistema POR SITE
 * @access Private (Agora permite USUÁRIO COMUM, mas Admin pode ver tudo)
 */
const getConfig = async (req, res) => {
    const { siteId } = req.query; // Espera siteId nos query params

    if (!siteId) {
        return res.status(400).json({ message: 'Site ID é obrigatório.' });
    }
    
    try {
        // Validação de acesso: Apenas o dono do site ou Admin pode visualizar
        const order = await models.Order.findOne({
            where: { site_id: siteId, user_id: req.user.id, status: ['completed', 'rented'] }
        });
        
        if (!order && req.user.role !== 'admin') {
             // Se não for o dono e não for admin
            return res.status(403).json({ message: 'Você não tem permissão para ver esta configuração.' });
        }


        // Busca a configuração pelo site_id
        const config = await models.SystemConfig.findOne({
            where: { site_id: siteId },
            attributes: { exclude: ['id', 'created_at', 'updated_at'] } 
        });

        if (!config) {
            return res.status(404).json({ message: `Nenhuma configuração encontrada para o Site ID ${siteId}.` });
        }

        res.json(config);

    } catch (error) {
        console.error('Erro ao buscar configuração:', error);
        res.status(500).json({ message: 'Erro interno ao buscar as configurações.' });
    }
};

// --- Definição das Rotas de Personalização ---
// Rota GET/POST agora só requer PROTECT (autenticação), removendo 'admin'
router.post('/', protect, saveConfig); 
router.get('/', protect, getConfig); 

module.exports = router;
