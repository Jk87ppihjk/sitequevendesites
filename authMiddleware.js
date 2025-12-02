// authMiddleware.js
const jwt = require('jsonwebtoken');
const models = require('./models');

/**
 * Middleware para proteger rotas. Verifica a validade do JWT e anexa o usuário à requisição.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Obtém o token do cabeçalho
            token = req.headers.authorization.split(' ')[1];

            // Verifica o token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Anexa o usuário à requisição (excluindo a senha)
            req.user = await models.User.findByPk(decoded.id, {
                attributes: { exclude: ['password'] }
            });

            if (!req.user) {
                return res.status(401).json({ message: 'Usuário não encontrado.' });
            }

            next();
        } catch (error) {
            console.error('Erro de autenticação:', error);
            res.status(401).json({ message: 'Não autorizado, token falhou.' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Não autorizado, nenhum token fornecido.' });
    }
};

/**
 * Middleware para restringir o acesso apenas a administradores.
 * Deve ser usado APÓS o middleware 'protect'.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Não autorizado, requer permissão de administrador.' });
    }
};

module.exports = {
    protect,
    admin
};
