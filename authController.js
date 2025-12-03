// authController.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { protect } = require('./authMiddleware');

// CORREÇÃO: Acessa o objeto de modelos inicializados via global
const models = global.solematesModels;

/**
 * Gera um token JWT para o usuário, incluindo ID, email e nome completo (fullName).
 */
const generateToken = (user) => {
    return jwt.sign({ 
        id: user.id,
        email: user.email,
        fullName: user.full_name, // O campo no DB é full_name
    }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

/**
 * @route POST /api/auth/register
 * @desc Registra um novo usuário
 * @access Public
 */
const registerUser = async (req, res) => {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
    }

    try {
        const userExists = await models.User.findOne({ where: { email } });

        if (userExists) {
            return res.status(400).json({ message: 'Usuário já existe.' });
        }

        const user = await models.User.create({
            full_name: full_name,
            email,
            password,
            role: 'user',
        });

        if (user) {
            res.status(201).json({
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                token: generateToken(user),
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

    // ➡️ LOG 1: Recebimento da requisição
    console.log(`[LOGIN ATTEMPT] Iniciando tentativa de login para: ${email}`); 

    try {
        const user = await models.User.findOne({ where: { email } });

        // 🔎 LOG 2: Verificação do usuário no DB
        if (!user) {
            console.warn(`[LOGIN FAILURE] Usuário não encontrado no DB para email: ${email}`);
            res.status(401).json({ message: 'Email ou senha inválidos.' });
            return;
        } 
        
        // 🔑 LOG 3: Dados de comparação (NÃO EXPOR SENHAS COMPLETAS)
        console.log(`[LOGIN DEBUG] Usuário encontrado (ID: ${user.id}, Role: ${user.role}).`);
        console.log(`[LOGIN DEBUG] Senha recebida (parcial): ${password.substring(0, 3)}...`);
        console.log(`[LOGIN DEBUG] Hash salvo no DB (parcial): ${user.password.substring(0, 10)}...`);


        // Verifica a senha
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        // 🚫 LOG 4: Resultado da comparação
        console.log(`[LOGIN DEBUG] Resultado do bcrypt.compare: ${passwordMatch}`);

        if (passwordMatch) {
            // 🎉 LOG 5: Sucesso!
            console.log(`[LOGIN SUCCESS] Login realizado para o usuário ID: ${user.id}`);
            res.json({
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                token: generateToken(user),
            });
        } else {
            // ❌ LOG 6: Falha na senha
            console.error(`[LOGIN FAILURE] Comparação de senha falhou para email: ${email}`);
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
