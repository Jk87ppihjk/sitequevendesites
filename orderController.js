// orderController.js
const express = require('express');
const router = express.Router();
const models = require('./models');
const { protect } = require('./authMiddleware');

/**
 * @route GET /api/orders/my
 * @desc Obtém o histórico de sites comprados/alugados pelo usuário logado
 * @access Private
 */
const getMyOrders = async (req, res) => {
    try {
        const orders = await models.Order.findAll({
            where: { user_id: req.user.id },
            include: [{
                model: models.Site,
                attributes: ['name', 'site_link', 'main_image_url'],
            }],
            order: [['created_at', 'DESC']],
        });

        res.json(orders);
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ message: 'Erro interno ao buscar histórico de pedidos.' });
    }
};

/**
 * @route POST /api/orders/:siteId/review
 * @desc Permite que o usuário comente/avalie um site que ele comprou
 * @access Private
 */
const createSiteReview = async (req, res) => {
    const { siteId } = req.params;
    const { rating, commentText } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'A avaliação deve ser um número entre 1 e 5.' });
    }

    try {
        // 1. Verificar se o usuário comprou ou alugou o site e se o pedido foi aprovado
        const hasPurchased = await models.Order.findOne({
            where: {
                user_id: userId,
                site_id: siteId,
                status: ['approved', 'rented'], // Se o status for de compra concluída
            },
        });

        if (!hasPurchased) {
            return res.status(403).json({ message: 'Você só pode avaliar sites que comprou ou alugou.' });
        }

        // 2. Verificar se o usuário já fez um comentário (opcional: permitir apenas 1 por compra/site)
        const alreadyReviewed = await models.Comment.findOne({
            where: { user_id: userId, site_id: siteId },
        });

        if (alreadyReviewed) {
            return res.status(400).json({ message: 'Você já avaliou este site.' });
        }

        // 3. Criar o comentário/avaliação
        const comment = await models.Comment.create({
            rating: parseInt(rating),
            comment_text: commentText,
            user_id: userId,
            site_id: siteId,
        });

        // Opcional: Recalcular a média do site após o novo comentário.

        res.status(201).json({ message: 'Avaliação e comentário enviados com sucesso!', comment });

    } catch (error) {
        console.error('Erro ao criar avaliação:', error);
        res.status(500).json({ message: 'Erro interno ao criar avaliação.' });
    }
};


// --- Definição das Rotas de Pedidos e Comentários ---
router.get('/my', protect, getMyOrders);
router.post('/:siteId/review', protect, createSiteReview);

module.exports = router;
