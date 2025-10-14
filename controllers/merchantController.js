const Merchant = require('../models/Merchant');
const ApiError = require('../utils/ApiError');

/**
 * @desc    Update a rejected merchant and resubmit for validation
 * @route   PUT /api/merchants/:id
 * @access  Private (Agent)
 */
exports.updateRejectedMerchant = async (req, res, next) => {
    try {
        const { id } = req.params;
        const merchant = await Merchant.findById(id);

        // 1. Vérifier si le marchand existe
        if (!merchant) {
            return next(new ApiError('Marchand non trouvé', 404));
        }

        // 2. Autoriser la modification uniquement si le statut est "rejected"
        if (merchant.statut !== 'rejected') {
            return next(new ApiError('Seuls les marchands avec le statut "rejected" peuvent être modifiés', 403));
        }

        // 3. Mettre à jour les champs du marchand depuis le body
        // Cela met à jour uniquement les champs présents dans req.body
        Object.assign(merchant, req.body);

        // 4. Mettre à jour les champs de suivi et repasser le statut à "pending"
        merchant.lastModifiedBy = req.user.id; // Assure que l'ID de l'utilisateur est dans req.user
        merchant.lastModifiedAt = Date.now();
        merchant.statut = 'pending';
        merchant.rejectionReason = null; // Effacer l'ancienne raison du rejet

        await merchant.save();

        // 5. Retourner une réponse claire
        res.status(200).json({
            success: true,
            message: 'Marchand mis à jour et re-soumis pour validation.'
        });

    } catch (error) {
        // S'il y a une erreur (ex: validation Mongoose), la passer au middleware d'erreur
        next(error);
    }
};
