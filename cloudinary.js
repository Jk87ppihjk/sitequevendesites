// cloudinary.js
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

// Configuração do Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // Garante que URLs sejam HTTPS
});

// Middleware de upload usando Multer e Cloudinary (via multer-storage-cloudinary, mas vamos simular)
// Como estamos fazendo um backend 'plano', vamos usar a função `uploader.upload` diretamente
// no controller para simplificar, mas a configuração fica aqui.

module.exports = {
    cloudinary,
    // A função de upload será usada diretamente no controller
};
