/**
 * Statut terminal : aucune modification ni validation ultérieure (workflow figé).
 */
const REJETE_DEFINITIF = 'rejeté_définitivement';

function isMerchantLocked(merchant) {
    return merchant && merchant.statut === REJETE_DEFINITIF;
}

module.exports = { REJETE_DEFINITIF, isMerchantLocked };
