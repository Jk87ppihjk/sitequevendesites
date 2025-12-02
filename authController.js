// authController.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const models = require('./models');
const { protect } = require('./authMiddleware');

/**
 * Gera um token JWT para o usuário.
 * @param {number} id ID do usuário
 * @returns {string} Token JWT
 */
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

/**
 * @route POST /api/auth/register
 * @desc Registra um novo usuário
 * @access Public
 */
const registerUser = async (req, res) => {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
    }

    try {
        const userExists = await models.User.findOne({ where: { email } });

        if (userExists) {
            return res.status(400).json({ message: 'Usuário já existe.' });
        }

        const user = await models.User.create({
            full_name: fullName,
            email,
            password,
            role: 'user', // Garante que novos usuários sejam 'user'
        });

        if (user) {
            res.status(201).json({
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                token: generateToken(user.id),
            });
        } else {
            res.status(400).json({ message: 'Dados de usuário inválidos.' });
        }
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ message: 'Erro interno ao registrar usuário.' });
    }
};

/**
 * @route POST /api/auth/login
 * @desc Autentica um usuário (ou admin) e obtém o token
 * @access Public
 */
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await models.User.findOne({ where: { email } });

        // Verifica a senha se o usuário existir
        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                token: generateToken(user.id),
            });
        } else {
            res.status(401).json({ message: 'Email ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ message: 'Erro interno ao fazer login.' });
    }
};

/**
 * @route GET /api/auth/profile
 * @desc Obtém o perfil do usuário logado
 * @access Private (via protect)
 */
const getUserProfile = (req, res) => {
    // O req.user é definido pelo middleware 'protect'
    res.json(req.user);
};


// --- Definição das Rotas de Autenticação ---
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile); // Rota para obter perfil

module.exports = router;
