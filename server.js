const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const agentRoutes = require('./routes/agentRoutes');
const merchantRoutes = require('./routes/merchantRoutes');
const logRoutes = require('./routes/logRoutes');
const path = require('path');
const cloudinary = require('cloudinary').v2;

console.log('>>> Vercel Debug: server.js loaded. Version 20250922_1530_VercelDebug <<<');

const { errorHandler } = require('./middleware/errorMiddleware');

dotenv.config();

// Vérifier si MONGO_URI est défini
if (!process.env.MONGO_URI) {
    console.error('Erreur: La variable d\'environnement MONGO_URI n\'est pas définie.');
    process.exit(1);
}

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Utilisation des routes
app.use('/api/agents', agentRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/logs', logRoutes);

app.get('/', (req, res) => {
    res.send('API Moov Money est en cours d\'exécution.');
});

// Middleware d'erreur
app.use(errorHandler);

// Connectez-vous à la base de données une seule fois
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connexion à MongoDB réussie !');
    })
    .catch((err) => {
        console.error('Erreur de connexion à MongoDB', err);
    });

// Export de l'application pour Vercel
module.exports = app;

// Démarrage du serveur si le fichier est exécuté directement (pour le développement local)
if (require.main === module) {
    app.listen(PORT, () => console.log(`Serveur en cours d\'exécution sur le port ${PORT}`));
}
