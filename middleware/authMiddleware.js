// backend/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // Récupère le token du header de la requête
    const token = req.header('x-auth-token');

    // Vérifie si un token est présent
    if (!token) {
        return res.status(401).json({ msg: 'Aucun token, autorisation refusée' });
    }

    try {
        // Vérifie et décode le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Ajoute l'utilisateur décodé à l'objet de la requête
        req.user = decoded.user;
        next(); // Passe au middleware suivant ou à la route
    } catch (err) {
        res.status(401).json({ msg: 'Token invalide' });
    }
};