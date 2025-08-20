// backend/createAgents.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Agent = require('./models/Agent');
const dotenv = require('dotenv');

dotenv.config();

// Données des agents de test à créer
const agents = [
    {
        matricule: 'ADMIN001',
        motDePasse: 'admin123',
        role: 'admin',
        affiliation: 'Moov Money'
    },
    {
        matricule: 'SUP001',
        motDePasse: 'superviseur123',
        role: 'superviseur',
        affiliation: 'Moov Money'
    },
    {
        matricule: 'AGT001',
        motDePasse: 'agent123',
        role: 'agent',
        affiliation: 'Moov Money'
    },
    {
        matricule: 'AGT002',
        motDePasse: 'agent456',
        role: 'agent',
        affiliation: 'Moov Money'
    }
];

const createAgents = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connexion à la base de données réussie.');

        // Supprimer tous les agents existants pour repartir de zéro
        await Agent.deleteMany({});
        console.log('Anciens agents supprimés.');

        // Créer les nouveaux agents
        const createdAgents = await Promise.all(
            agents.map(async (agent) => {
                const salt = await bcrypt.genSalt(10);
                const motDePasseHache = await bcrypt.hash(agent.motDePasse, salt);
                return new Agent({
                    ...agent,
                    motDePasse: motDePasseHache
                }).save();
            })
        );

        console.log('Agents de test créés avec succès :');
        createdAgents.forEach(agent => {
            console.log(`- Matricule: ${agent.matricule}, Rôle: ${agent.role}`);
        });

        process.exit();

    } catch (error) {
        console.error('Erreur lors de la création des agents :', error);
        process.exit(1);
    }
};

createAgents();