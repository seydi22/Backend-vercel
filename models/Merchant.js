// backend/models/Merchant.js

const mongoose = require('mongoose');

const operatorSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    nni: { type: String, required: true, unique: true },
    telephone: { type: String, required: true, unique: true },
   
    shortCode: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const merchantSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    secteur: { type: String, required: true },
    typeCommerce: { type: String, required: true },
    
    // Nouveaux champs de localisation
    region: { type: String, required: true },
    ville: { type: String, required: true },
    commune: { type: String, required: true },
    longitude: { type: Number },
    latitude: { type: Number },

    // Nouveaux champs pour les informations du gérant
    nomGerant: { type: String, required: true },
    prenomGerant: { type: String, required: true },
    adresse: { type: String, required: true },
    contact: { type: String, required: true, unique: true },
    nif: { type: String,  sparse: true },
    rc: { type: String,  sparse: true },
    
    // Structure de la pièce d'identité plus flexible
    pieceIdentite: {
        type: { type: String, enum: ['cni', 'carte de sejour', 'passeport'] },
        cniRectoUrl: { type: String },
        cniVersoUrl: { type: String },
        passeportUrl: { type: String }
    },
    photoEnseigneUrl: { type: String, required: true },

    statut: { type: String, enum: ['en attente', 'validé_par_superviseur', 'validé', 'rejeté'], default: 'en attente' },
    agentRecruteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    createdAt: { type: Date, default: Date.now },
    validatedAt: { type: Date },
    rejectionReason: { type: String },
    shortCode: { type: String, unique: true, sparse: true },

    // NOUVEAUX CHAMPS POUR LE SUIVI SUPERVISEUR
    validatedBySupervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    validatedBySupervisorAt: { type: Date },

    // Tableau pour stocker les opérateurs liés à ce marchand
    operators: [operatorSchema] 
});

module.exports = mongoose.model('Merchant', merchantSchema);