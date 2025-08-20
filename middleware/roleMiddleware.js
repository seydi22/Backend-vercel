// backend/middleware/roleMiddleware.js

const jwt = require('jsonwebtoken');

module.exports = (roles) => {
    return function (req, res, next) {
        // Le middleware authMiddleware doit être appelé avant pour que req.user existe
        if (!req.user || !req.user.role) {
            return res.status(401).json({ msg: 'Accès refusé : rôle non défini.' });
        }

        const userRole = req.user.role;

        // Vérifie si le rôle de l'utilisateur est inclus dans les rôles autorisés
        if (!roles.includes(userRole)) {
            return res.status(403).json({ msg: 'Accès refusé : vous n\'avez pas les permissions nécessaires.' });
        }

        next();
    };
};