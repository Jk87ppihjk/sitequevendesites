// fileController.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, admin } = require('./authMiddleware');

// Define a pasta onde o ZIP será salvo
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'frontend-zips');

// Garante que a pasta existe antes de tentar salvar
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuração de armazenamento que será definida dinamicamente
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Usa o siteId (enviado no req.body) para nomear o arquivo
        const siteId = req.body.siteId;
        if (!siteId) {
            // Se o siteId não estiver no body (erro 400), o Multer ainda precisa de um nome,
            // mas o uploadFrontendZip irá rejeitar
            return cb(new Error('Site ID faltando na requisição.'), false);
        }
        cb(null, `${siteId}_frontend.zip`);
    }
});

// Middleware de upload (limite de 100MB)
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.zip') {
            return cb(new Error('Apenas arquivos ZIP são permitidos.'), false);
        }
        cb(null, true);
    }
}).single('frontendZip'); 

/**
 * @route POST /api/files/upload-frontend
 * @desc Admin uploads a new frontend ZIP file (associado a um siteId)
 * @access Private/Admin
 */
const uploadFrontendZip = (req, res) => {
    // Verifica se o siteId foi enviado antes de processar
    if (!req.body.siteId) {
         return res.status(400).json({ message: 'Site ID é obrigatório para o upload do ZIP.' });
    }

    // Executa o middleware Multer
    upload(req, res, async (err) => {
        if (err) {
            console.error('Erro de upload:', err.message);
            return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ 
                message: `Erro de upload: ${err.message}` 
            });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo ZIP foi enviado.' });
        }
        
        const siteId = req.body.siteId;

        res.status(201).json({ 
            message: `Frontend ZIP salvo para o Site ID ${siteId} com sucesso!`,
            filename: req.file.filename,
        });
    });
};

/**
 * @route GET /api/files/download-frontend
 * @desc User downloads the latest frontend ZIP file (associado a um siteId)
 * @access Private (Autenticado)
 */
const downloadFrontendZip = async (req, res) => {
    const siteId = req.query.siteId; // Espera siteId nos query params
    
    if (!siteId) {
        return res.status(400).json({ message: 'Site ID é obrigatório para o download.' });
    }

    const filePath = path.join(UPLOADS_DIR, `${siteId}_frontend.zip`);

    // Verifica se o arquivo existe antes de enviar
    if (fs.existsSync(filePath)) {
        res.download(filePath, `solemates_frontend_site_${siteId}.zip`, (err) => {
            if (err) {
                console.error('Erro ao enviar o arquivo para download:', err);
                if (!res.headersSent) {
                    res.status(500).json({ message: 'Falha ao processar o download.' });
                }
            }
        });
    } else {
        res.status(404).json({ message: `Nenhum arquivo de frontend disponível para o Site ID ${siteId}.` });
    }
};

// --- Definição das Rotas de Arquivos ---
router.post('/upload-frontend', protect, admin, uploadFrontendZip);
router.get('/download-frontend', protect, downloadFrontendZip);

module.exports = router;
