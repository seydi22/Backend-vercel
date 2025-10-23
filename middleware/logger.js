const Log = require('../models/Log');
const jwt = require('jsonwebtoken');
const onFinished = require('on-finished');

const getActionDescription = (method, url, status) => {
    const statusText = status >= 400 ? 'Échec' : 'Succès';

    // User login
    if (method === 'POST' && url.startsWith('/api/agents/login')) return `Connexion - ${statusText}`;

    // Agent management
    if (url.startsWith('/api/agents/register')) return `Création Agent - ${statusText}`;
    if (method === 'POST' && url === '/api/agents') return `Création Agent - ${statusText}`;
    if (url.startsWith('/api/agents/change-password')) return `Changement de mot de passe - ${statusText}`;

    // Merchant management
    if (method === 'POST' && url.startsWith('/api/merchants')) return `Création Marchand - ${statusText}`;
    if (method === 'PUT' && url.startsWith('/api/merchants')) return `Mise à jour Marchand - ${statusText}`;
    if (method === 'DELETE' && url.startsWith('/api/merchants')) return `Suppression Marchand - ${statusText}`;

    // Exports
    if (url.startsWith('/api/export/performance')) return `Export Performances - ${statusText}`;
    if (url.startsWith('/api/agents/export')) return `Export Opérateurs - ${statusText}`;

    return null; // Return null for actions we don't want to log
};


const logMiddleware = (req, res, next) => {
  const start = Date.now();

  onFinished(res, async () => {
    const { method, originalUrl, ip, headers } = req;
    const status = res.statusCode;

    const action = getActionDescription(method, originalUrl, status);

    // Only log if the action is described
    if (!action) {
      return;
    }

    const userAgent = headers['user-agent'];
    let matricule = 'Système';
    const token = headers['x-auth-token'];

    if (req.user && req.user.matricule) {
        matricule = req.user.matricule;
    } else if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.user && decoded.user.matricule) {
          matricule = decoded.user.matricule;
        }
      } catch (ex) {
        // Invalid token
      }
    }

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