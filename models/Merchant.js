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

    statut: { type: String, enum: ['en attente', 'validé_par_superviseur', 'validé', 'cree', 'rejeté', 'rejeté_définitivement', 'livré'], default: 'en attente' },
    agentRecruteurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    createdAt: { type: Date, default: Date.now },
    validatedAt: { type: Date },
    rejectionReason: { type: String },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    lastModifiedAt: { type: Date },
    shortCode: { type: String, unique: true, sparse: true },

    // NOUVEAUX CHAMPS POUR LE SUIVI SUPERVISEUR
    validatedBySupervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    validatedBySupervisorAt: { type: Date },

    // NOUVEAUX CHAMPS POUR LA LIVRAISON
    qrCodePhotoUrl: { type: String },
    paymentTestPhotoUrl: { type: String },
    deliveredAt: { type: Date },
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },

    // Tableau pour stocker les opérateurs liés à ce marchand
    operators: [operatorSchema],

    /**
     * Suivi d’intégration CPS (Huawei SYNCAPI).
     * On garde volontairement un format souple: utile pour debug sans casser le workflow.
     */
    cpsIntegration: {
        status: { type: String, enum: ['idle', 'in_progress', 'success', 'failed'], default: 'idle' },
        lastAttemptAt: { type: Date },
        error: { type: String },
        createTopOrg: {
            resultCode: { type: String },
            resultDesc: { type: String },
            conversationId: { type: String },
            requestXml: { type: String },
            rawResponse: { type: String },
            completedAt: { type: Date },
        },
        createOrgOperator: {
            results: [{
                msisdn: { type: String },
                operatorId: { type: String },
                resultCode: { type: String },
                resultDesc: { type: String },
                conversationId: { type: String },
                requestXml: { type: String },
                rawResponse: { type: String },
                completedAt: { type: Date },
            }],
        },
    },
});

module.exports = mongoose.model('Merchant', merchantSchema);