// backend/models/MerchantHistory.js

const mongoose = require('mongoose');

const merchantHistorySchema = new mongoose.Schema({
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Merchant',
        required: true
    },
    modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent', // Ou 'User' si vous avez un modèle utilisateur générique
        required: true
    },
    modifiedAt: {
        type: Date,
        default: Date.now
    },
    event: {
        type: String,
        enum: ['creation', 'correction_rejet', 'pre_validation', 'validation_finale', 'rejet'],
        required: true
    },
    // Stocke la raison du rejet qui a été corrigée
    correctedRejectionReason: {
        type: String
    },
    // Vous pourriez aussi stocker un snapshot des champs modifiés si nécessaire
    // changes: [{ field: String, oldValue: String, newValue: String }]
});

module.exports = mongoose.model('MerchantHistory', merchantHistorySchema);
