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
    
    region: { type: String, required: true },
    ville: { type: String, required: true },
    commune: { type: String, required: true },
    longitude: { type: Number },
    latitude: { type: Number },

    nomGerant: { type: String, required: true },
    prenomGerant: { type: String, required: true },
    adresse: { type: String, required: true },
    contact: { type: String, required: true, unique: true },
    nif: { type: String,  sparse: true },
    rc: { type: String,  sparse: true },
    
    pieceIdentite: {
        type: { type: String, enum: ['cni', 'carte de sejour', 'passeport'] },
        cniRectoUrl: { type: String },
        cniVersoUrl: { type: String },
        passeportUrl: { type: String }
    },
    photoEnseigneUrl: { type: String, required: true },

    statut: { 
        type: String, 
        enum: ['pending', 'validated_pre', 'validated_final', 'rejected'], 
        default: 'pending' 
    },
    rejectionReason: { type: String, default: null },

    agentRecruteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    
    validatedBySupervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    validatedBySupervisorAt: { type: Date },
    
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    lastModifiedAt: { type: Date },

    createdAt: { type: Date, default: Date.now },
    validatedAt: { type: Date },
    
    shortCode: { type: String, unique: true, sparse: true },

    operators: [operatorSchema] 
});

module.exports = mongoose.model('Merchant', merchantSchema);
