const Log = require('../models/Log');
const jwt = require('jsonwebtoken');
const onFinished = require('on-finished');

const logMiddleware = (req, res, next) => {
  const start = Date.now();

  onFinished(res, async () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'];
    const status = res.statusCode;

    let matricule = 'N/A';
    const token = headers['x-auth-token'];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.id) {
          // Assuming the JWT payload has an 'id' field which is the user's ID
          // And that you have a way to get the matricule from the user ID
          // For now, let's assume the matricule is in the token
          matricule = decoded.matricule || 'N/A';
        }
      } catch (ex) {
        // Invalid token, matricule remains 'N/A'
      }
    }

    // Exclude logging of log-fetching requests to avoid infinite loops
    if (originalUrl.startsWith('/api/logs')) {
      return;
    }

    const action = `${method} ${originalUrl} - ${status} [${duration}ms]`;

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