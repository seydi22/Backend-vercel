const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // <-- Ajoutez cette ligne
const dotenv = require('dotenv');
const agentRoutes = require('./routes/agentRoutes'); 
const merchantRoutes = require('./routes/merchantRoutes'); // Importe les routes de marchand
const path = require('path'); // Ajoutez le module 'path' pour servir les fichiers statiques
const cloudinary = require('cloudinary').v2;
const { errorHandler } = require('./middleware/errorMiddleware'); // <-- Ajoutez cette ligne


dotenv.config(); // Charge les variables d'environnement du fichier .env


const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
// Middleware pour parser les requêtes JSON
app.use(express.json());
// Servir les fichiers statiques du dossier 'uploads'
// C'est nécessaire pour que le front-end puisse afficher les images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Utilisation des routes
app.use('/api/agents', agentRoutes);
app.use('/api/merchants', merchantRoutes); // Utilise les routes de marchand


app.get('/', (req, res) => {
    res.send('API Moov Money est en cours d\'exécution.');
});
// --- LE MIDDLEWARE D'ERREUR EST AJOUTÉ ICI ---
app.use(errorHandler);
// Export de l'application pour les tests
module.exports = app;

// Démarrage du serveur si le fichier est exécuté directement
if (require.main === module) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => {
            app.listen(PORT, () => console.log(`Serveur en cours d'exécution sur le port ${PORT}`));
            console.log('Connexion à MongoDB réussie !');
        })
        .catch((err) => {
            console.error('Erreur de connexion à MongoDB', err);
        });

}