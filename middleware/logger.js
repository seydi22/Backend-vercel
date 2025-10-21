const Log = require('../models/Log');
const jwt = require('jsonwebtoken');
const onFinished = require('on-finished');

const getActionDescription = (method, url, status) => {
    const statusText = status >= 400 ? 'Échec' : 'Succès';

    if (url.startsWith('/api/agents/login')) return `Connexion agent - ${statusText}`;
    if (url.startsWith('/api/agents/register')) return `Enregistrement nouvel agent - ${statusText}`;
    if (url.startsWith('/api/agents/change-password')) return `Changement de mot de passe - ${statusText}`;
    if (method === 'POST' && url.startsWith('/api/merchants')) return `Création nouveau marchand - ${statusText}`;
    if (method === 'PUT' && url.startsWith('/api/merchants')) return `Mise à jour marchand - ${statusText}`;
    if (method === 'DELETE' && url.startsWith('/api/merchants')) return `Suppression marchand - ${statusText}`;
    if (url.startsWith('/api/export/performance')) return `Exportation des performances - ${statusText}`;
    if (url.startsWith('/api/agents/export')) return `Exportation des opérateurs - ${statusText}`;

    // Fallback for other routes
    return `${method} ${url} - ${statusText}`;
};


const logMiddleware = (req, res, next) => {
  const start = Date.now();

  onFinished(res, async () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'];
    const status = res.statusCode;

    let matricule = 'Système'; // Default to 'Système' for actions without a user
    const token = headers['x-auth-token'];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.user && decoded.user.matricule) {
          matricule = decoded.user.matricule;
        }
      } catch (ex) {
        // Invalid token, matricule remains 'Système'
      }
    }

    // Exclude logging of log-fetching requests
    if (originalUrl.startsWith('/api/logs')) {
      return;
    }

    const action = getActionDescription(method, originalUrl, status);

    try {
      const log = new Log({
        matricule,
        action,
        ipAddress: ip,
        userAgent,
      });
      await log.save();
    } catch (error) {
      console.error('Failed to save log:', error);
    }
  });

  next();
};

module.exports = logMiddleware;
