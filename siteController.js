// siteController.js
const express = require('express');
const router = express.Router();
// Garante que usa os modelos globais inicializados
const models = global.solematesModels; 
const { protect, admin } = require('./authMiddleware');
const { cloudinary } = require('./cloudinary');
const multer = require('multer');

// Configuração do Multer para upload em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- UTILITY: Processa o campo additionalLinks que pode vir como JSON ou String CSV ---
const processAdditionalLinks = (additionalLinks) => {
    if (!additionalLinks) return [];
    try {
        // Tenta fazer o parse como JSON (caso o frontend envie um array stringify)
        return JSON.parse(additionalLinks);
    } catch (e) {
        // Se falhar, trata como string separada por vírgulas
        return additionalLinks.split(',').map(link => link.trim()).filter(link => link.length > 0);
    }
}

/**
 * @route POST /api/sites
 * @desc Cria um novo site (disponível para venda/aluguel)
 * @access Private/Admin
 */
const createSite = async (req, res) => {
    console.log(`[SITE_LOG] Iniciando criação de novo site. Admin ID: ${req.user.id}`);
    
    const imageFile = req.file; 
    const { name, description, priceSale, priceRent, siteLink, additionalLinks } = req.body;

    if (!imageFile || !name || !description || !siteLink) {
        console.error('[SITE_LOG] ❌ Erro 400: Campos obrigatórios faltando.');
        return res.status(400).json({ message: 'Campos obrigatórios faltando (Imagem, Nome, Descrição, Link do Site).' });
    }

    try {
        // 1. Upload da Imagem Principal
        const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${imageFile.buffer.toString('base64')}`, {
            folder: 'solemates_sites',
            allowed_formats: ['jpg', 'png', 'jpeg'],
        });
        const mainImageUrl = result.secure_url;
        
        // 2. Processamento dos Links
        const processedLinks = processAdditionalLinks(additionalLinks);

        // 3. Criação do Registro no DB
        const site = await models.Site.create({
            name,
            description,
            price_sale: priceSale || 0.00,
            price_rent: priceRent || 0.00,
            main_image_url: mainImageUrl,
            site_link: siteLink,
            additional_links: processedLinks,
        });

        console.log(`[SITE_LOG] ✅ Site criado com sucesso. ID: ${site.id}, Nome: ${site.name}`);
        res.status(201).json(site);

    } catch (error) {
        console.error('[SITE_LOG] ❌ Erro FATAL ao criar site e fazer upload:', error);
        res.status(500).json({ message: 'Erro interno ao criar o site.' });
    }
};


/**
 * @route PUT /api/sites/:id
 * @desc Atualiza um site existente
 * @access Private/Admin
 */
const updateSite = async (req, res) => {
    const siteId = req.params.id;
    const imageFile = req.file; 
    const { name, description, priceSale, priceRent, siteLink, additionalLinks, isAvailable } = req.body;
    
    console.log(`[SITE_LOG] Iniciando atualização do Site ID: ${siteId}. Admin ID: ${req.user.id}`);

    try {
        const site = await models.Site.findByPk(siteId);
        if (!site) {
            console.warn(`[SITE_LOG] ⚠️ Site ID ${siteId} não encontrado para atualização.`);
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        const updateData = {};
        let mainImageUrl = site.main_image_url;

        // 1. Upload da Nova Imagem (se houver)
        if (imageFile) {
            console.log('[SITE_LOG] Nova imagem detectada. Realizando upload...');
            const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${imageFile.buffer.toString('base64')}`, {
                folder: 'solemates_sites',
                allowed_formats: ['jpg', 'png', 'jpeg'],
            });
            mainImageUrl = result.secure_url;
        }

        // 2. Montagem dos Dados de Atualização
        if (name) updateData.name = name;
        if (description) updateData.description = description;
        if (priceSale !== undefined) updateData.price_sale = priceSale;
        if (priceRent !== undefined) updateData.price_rent = priceRent;
        if (siteLink) updateData.site_link = siteLink;
        if (imageFile) updateData.main_image_url = mainImageUrl;
        if (additionalLinks !== undefined) updateData.additional_links = processAdditionalLinks(additionalLinks);
        // Conversão de string "true"/"false" para boolean, se isAvailable for enviado
        if (isAvailable !== undefined) updateData.is_available = isAvailable === 'true' || isAvailable === true;

        // 3. Atualização no DB
        await site.update(updateData);

        console.log(`[SITE_LOG] ✅ Site ID ${siteId} atualizado com sucesso.`);
        res.json(site);
        
    } catch (error) {
        console.error(`[SITE_LOG] ❌ Erro FATAL ao atualizar o Site ID ${siteId}:`, error);
        res.status(500).json({ message: 'Erro interno ao atualizar o site.' });
    }
};

/**
 * @route DELETE /api/sites/:id
 * @desc Deleta um site existente
 * @access Private/Admin
 */
const deleteSite = async (req, res) => {
    const siteId = req.params.id;
    console.log(`[SITE_LOG] Iniciando exclusão do Site ID: ${siteId}. Admin ID: ${req.user.id}`);

    try {
        const site = await models.Site.findByPk(siteId);

        if (!site) {
            console.warn(`[SITE_LOG] ⚠️ Site ID ${siteId} não encontrado para exclusão.`);
            return res.status(404).json({ message: 'Site não encontrado.' });
        }

        await site.destroy();
        
        console.log(`[SITE_LOG] ✅ Site ID ${siteId} excluído com sucesso.`);
        res.json({ message: 'Site excluído com sucesso.' });

    } catch (error) {
        console.error(`[SITE_LOG] ❌ Erro FATAL ao deletar o Site ID ${siteId}:`, error);
        res.status(500).json({ message: 'Erro interno ao deletar o site.' });
    }
};

/**
 * @route GET /api/sites
 * @desc Lista todos os sites disponíveis
 * @access Public
 */
const getSites = async (req, res) => {
    try {
        const sites = await models.Site.findAll({
            // Usa 1 para garantir compatibilidade com TINYINT/BOOLEAN
            where: { is_available: 1 },
            // Ordena pela data de criação (createdAt)
            order: [['createdAt', 'DESC']]
        });
        
        res.json(sites);

    } catch (error) {
        console.error('Erro ao listar sites:', error);
        res.status(500).json({ message: 'Erro interno ao buscar sites.' });
    }
};

/**
 * @route GET /api/sites/:id
 * @desc Obtém detalhes de um site e seus comentários/avaliações
 * @access Public
 */
const getSiteDetails = async (req, res) => {
    try {
        const site = await models.Site.findByPk(req.params.id, {
            include: [{
                model: models.Comment,
                // CORREÇÃO CRÍTICA AQUI: Trocado 'created_at' por 'createdAt'
                attributes: ['id', 'rating', 'comment_text', 'createdAt'], 
                include: [{
                    model: models.User,
                    attributes: ['full_name'],
                }],
            }],
        });

        if (site && site.is_available) { 
            // Calcula a média de avaliações manualmente para garantir precisão
            const comments = site.Comments || [];
            const totalRating = comments.reduce((sum, comment) => sum + comment.rating, 0);
            const averageRating = comments.length > 0 ? (totalRating / comments.length).toFixed(1) : 0;
            
            res.json({
                ...site.toJSON(),
                average_rating: parseFloat(averageRating),
                review_count: comments.length,
            });
        } else {
            res.status(404).json({ message: 'Site não encontrado.' });
        }
    } catch (error) {
        console.error('Erro ao buscar detalhes do site:', error);
        res.status(500).json({ message: 'Erro interno ao buscar detalhes do site.' });
    }
};


// --- Definição das Rotas (Todas as Rotas Agora Tratadas) ---

router.get('/', getSites);
router.get('/:id', getSiteDetails);

// ROTAS DE ADMIN
router.post('/', protect, admin, upload.single('image'), createSite); // Criação
router.put('/:id', protect, admin, upload.single('image'), updateSite); // Atualização (NOVA ROTA)
router.delete('/:id', protect, admin, deleteSite); // Exclusão (NOVA ROTA)


module.exports = router;
