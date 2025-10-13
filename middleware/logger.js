const Log = require("../models/Log");

/**
 * Enregistre une action utilisateur dans la base de données.
 * @param {Object} req - L'objet de requête Express.
 * @param {string} action - La description de l'action effectuée.
 */
const logAction = async (req, action) => {
  try {
    // S'assurer que req.user existe avant de tenter d'accéder à ses propriétés
    if (!req.user || !req.user.matricule) {
      console.error("Logger Error: req.user.matricule is missing. Action will be logged without matricule.");
      // Optionnel : vous pouvez décider de ne pas logger du tout si le matricule est essentiel
      // return;
    }

    const log = new Log({
      matricule: req.user ? req.user.matricule : 'N/A',
      action,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await log.save();
  } catch (error) {
    console.error("Failed to save log:", error);
  }
};

module.exports = { logAction };
