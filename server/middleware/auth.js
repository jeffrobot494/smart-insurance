const path = require('path');
const { server: logger } = require('../utils/logger');

function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        logger.debug('User authenticated via session');
        return next();
    }
    
    logger.debug('User not authenticated, redirecting to login');
    
    // For API routes, return JSON error
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // For regular routes, serve login page
    const loginPath = path.join(__dirname, '../../public/login.html');
    res.sendFile(loginPath);
}

function redirectIfAuthenticated(req, res, next) {
    if (req.session && req.session.authenticated) {
        logger.debug('User already authenticated, redirecting to main app');
        return res.redirect('/');
    }
    next();
}

module.exports = {
    requireAuth,
    redirectIfAuthenticated
};