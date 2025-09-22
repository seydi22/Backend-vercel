const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // <-- Ajoutez cette ligne
const dotenv = require('dotenv');
const agentRoutes = require('./routes/agentRoutes'); 
const merchantRoutes = require('./routes/merchantRoutes'); // Importe les routes de marchand
const path = require('path'); // Ajoutez le module 'path' pour servir les fichiers statiques
const cloudinary = require('cloudinary').v2;
const { errorHandler } = require('./middleware/errorMiddleware');


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

// Database connection function
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        console.log('=> Using existing database connection');
        return Promise.resolve(cachedDb);
    }

    console.log('=> Connecting to database...');
    try {
        const db = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        });
        cachedDb = db;
        console.log('=> New database connection established.');

        mongoose.connection.on('error', err => {
            console.error('Mongoose connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('Mongoose disconnected from database.');
        });

        return cachedDb;
    } catch (error) {
        console.error('Failed to connect to database:', error.message);
        throw error; // Re-throw the error to be caught by the main block
    }
}

// Middleware to ensure DB connection for every request in serverless environment
app.use(async (req, res, next) => {
    if (process.env.VERCEL_ENV) { // Only apply this for Vercel deployments
        try {
            await connectToDatabase();
        } catch (error) {
            console.error('Database connection failed in Vercel middleware:', error.message);
            return res.status(500).send('Database connection error. Please check server logs.');
        }
    }
    next();
});

// Export de l'application pour les tests et Vercel
module.exports = app;

// Démarrage du serveur si le fichier est exécuté directement (pour le développement local)
if (require.main === module) {
    connectToDatabase()
        .then(() => {
            app.listen(PORT, () => console.log(`Serveur en cours d\'exécution sur le port ${PORT}`));
            console.log('Connexion à MongoDB réussie !');
        })
        .catch((err) => {
            console.error('Erreur de connexion à MongoDB', err);
        });

}
