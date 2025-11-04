
const Merchant = require('../models/Merchant');
const Agent = require('../models/Agent');
const asyncHandler = require('express-async-handler');

// @desc    Confirm QR code delivery, upload photos, and update merchant status
// @route   POST /api/merchants/:id/deliver
// @access  Private/Agent
const deliverMerchant = asyncHandler(async (req, res) => {
    const merchant = await Merchant.findById(req.params.id);

    if (!merchant) {
        return res.status(404).json({ msg: 'Marchand non trouvé.' });
    }

    // Check if the logged-in agent is the one who recruited the merchant
    if (merchant.agentRecruteurId.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'Action non autorisée. Vous ne pouvez mettre à jour que vos propres marchands.' });
    }

    // A QR code can only be delivered if the merchant is validated
    if (merchant.statut !== 'validé') {
        return res.status(400).json({ msg: `Le marchand n'est pas au statut 'validé'. Statut actuel: ${merchant.statut}` });
    }

    const qrCodePhotoUrl = req.files['qrCodePhoto'] ? req.files['qrCodePhoto'][0].path : null;
    const paymentTestPhotoUrl = req.files['paymentTestPhoto'] ? req.files['paymentTestPhoto'][0].path : null;

    if (!qrCodePhotoUrl) {
        return res.status(400).json({ msg: 'La photo du QR code est obligatoire.' });
    }

    merchant.statut = 'livré';
    merchant.qrCodePhotoUrl = qrCodePhotoUrl;
    merchant.paymentTestPhotoUrl = paymentTestPhotoUrl;
    merchant.deliveredAt = Date.now();
    merchant.deliveredBy = req.user.id;

    const updatedMerchant = await merchant.save();

    res.json(updatedMerchant);
});

module.exports = {
    deliverMerchant,
};
