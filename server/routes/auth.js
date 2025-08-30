const express = require('express');
const { server: logger } = require('../utils/logger');
const { redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

// POST /auth/login
router.post('/login', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        logger.warn('Login attempt without password');
        return res.status(400).json({ error: 'Password is required' });
    }
    
    if (password === process.env.AUTH_PASSWORD) {
        req.session.authenticated = true;
        logger.info('Successful login attempt');
        res.json({ success: true, message: 'Authentication successful' });
    } else {
        logger.warn('Failed login attempt with incorrect password');
        res.status(401).json({ error: 'Invalid password' });
    }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session', { error: err.message });
            return res.status(500).json({ error: 'Could not log out' });
        }
        
        logger.info('User logged out successfully');
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// GET /auth/status
router.get('/status', (req, res) => {
    const isAuthenticated = !!(req.session && req.session.authenticated);
    res.json({ authenticated: isAuthenticated });
});

module.exports = router;