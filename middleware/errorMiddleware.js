// backend/middleware/errorMiddleware.js

const errorHandler = (err, req, res, next) => {
    console.error(err.stack); // Affiche la trace de l'erreur dans la console du serveur

    // Détermine le statut de la réponse
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);

    // Envoie une réponse JSON avec un message d'erreur lisible
    res.json({
        message: err.message,
        // Affiche la trace de l'erreur seulement si l'environnement est en développement
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = { errorHandler };