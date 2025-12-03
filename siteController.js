// siteController.js
const express = require('express');
const router = express.Router();
// const models = require('./models'); // LINHA ORIGINAL REMOVIDA
// CORREÇÃO: Acessa o objeto de modelos inicializados via global
const models = global.solematesModels; 
// CORREÇÃO 1: Importar 'protect' também
const { protect, admin } = require('./authMiddleware');
const { cloudinary } = require('./cloudinary');
const multer = require('multer');

// Configuração do Multer para upload em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * @route POST /api/sites
 * @desc Cria um novo site (disponível para venda/aluguel)
 * @access Private/Admin
 */
const createSite = async (req, res) => {
    // 'image' é o nome do campo de arquivo no formulário
    const imageFile = req.file; 
    const { name, description, priceSale, priceRent, siteLink, additionalLinks } = req.body;

    // Validação básica
    if (!imageFile || !name || !description || !siteLink) {
        return res.status(400).json({ message: 'Campos obrigatórios faltando (Imagem, Nome, Descrição, Link do Site).' });
    }

    try {
        // 1. Upload da imagem para o Cloudinary
        const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${imageFile.buffer.toString('base64')}`, {
            folder: 'solemates_sites',
            allowed_formats: ['jpg', 'png', 'jpeg'],
        });

        const mainImageUrl = result.secure_url;

        // 2. Processa links adicionais
        let processedLinks = [];
        if (additionalLinks) {
            try {
                processedLinks = JSON.parse(additionalLinks);
            } catch (e) {
                processedLinks = additionalLinks.split(',').map(link => link.trim());
            }
        }

        // 3. Cria o registro do Site no banco de dados
        const site = await models.Site.create({
            name,
            description,
            price_sale: priceSale || 0.00,
            price_rent: priceRent || 0.00,
            main_image_url: mainImageUrl,
            site_link: siteLink,
            additional_links: processedLinks,
        });

        res.status(201).json(site);

    } catch (error) {
        console.error('Erro ao criar site e fazer upload:', error);
        res.status(500).json({ message: 'Erro interno ao criar o site.' });
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
            where: { is_available: true },
            // CORREÇÃO CRÍTICA: O atributo do modelo Sequelize é 'createdAt' (camelCase).
            // Com 'underscored: true' no models.js, o Sequelize fará o mapeamento correto para 'created_at' no SQL.
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
                // Os atributos devem usar snake_case se o modelo Comment tiver 'underscored: true'
                attributes: ['id', 'rating', 'comment_text', 'created_at'],
                include: [{
                    model: models.User,
                    attributes: ['full_name'],
                }],
            }],
        });

        if (site) {
            const totalRating = site.Comments.reduce((sum, comment) => sum + comment.rating, 0);
            const averageRating = site.Comments.length > 0 ? (totalRating / site.Comments.length).toFixed(1) : 0;
            
            res.json({
                ...site.toJSON(),
                average_rating: parseFloat(averageRating),
                review_count: site.Comments.length,
            });
        } else {
            res.status(404).json({ message: 'Site não encontrado.' });
        }
    } catch (error) {
        console.error('Erro ao buscar detalhes do site:', error);
        res.status(500).json({ message: 'Erro interno ao buscar detalhes do site.' });
    }
};

// --- ROTAS ---

router.get('/', getSites);
router.get('/:id', getSiteDetails);

// CORREÇÃO 2: Adicionar 'protect' antes de 'admin'
// O middleware 'protect' injeta req.user, que o 'admin' usa para checar a role.
router.post('/', protect, admin, upload.single('image'), createSite);

module.exports = router;
