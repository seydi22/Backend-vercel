const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Schema = mongoose.Schema; // <-- C'est la ligne manquante


const agentSchema = new mongoose.Schema({
    matricule: { type: String, required: true, unique: true },
    motDePasse: { type: String, required: true },
    role: { type: String, enum: ['agent', 'superviseur', 'admin','superviseur_call_center', 'agent_de_saisie'], default: 'agent' },
    affiliation: { type: String, required: true },
    performance: {
        enrôlements: { type: Number, default: 0 },
        validations: { type: Number, default: 0 }
    },
    superviseurId: {
        type: Schema.Types.ObjectId,
        ref: 'Agent',
        // Ce champ est requis uniquement pour les agents "classiques"
        required: function() {
            return this.role === 'agent';
        }
    },
    dateCreation: {
        type: Date,
        default: Date.now
    },
     performance_saisie: {
        created: { type: Number, default: 0 },
        rejected: { type: Number, default: 0 },
    },
    
});
agentSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.motDePasse);
};
const Agent = mongoose.model('Agent', agentSchema);

module.exports = mongoose.model('Agent', agentSchema);