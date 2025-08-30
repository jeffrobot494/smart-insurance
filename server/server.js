//server.js
const express = require('express');
const session = require('express-session');
const path = require('path');
require('./utils/load-env'); // Load environment variables
const { server: logger } = require('./utils/logger');
const MCPServerManager = require('./mcp/MCPServerManager');
const ToolManager = require('./workflow/ToolManager');
const DatabaseManager = require('./data-extraction/DatabaseManager');
const pollingService = require('./services/PollingService');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Global MCP instances
let globalMCPManager = null;
let globalToolManager = null;

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'smart-insurance-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication routes (no auth required)
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Health check route (no auth required)
const healthcheckRoutes = require('./routes/healthcheck');
app.use('/api/health', healthcheckRoutes);

// Protected API routes
const pipelineRoutes = require('./routes/pipeline');
app.use('/api/pipeline', requireAuth, pipelineRoutes);

const testingRoutes = require('./routes/testing');
app.use('/api/testing', requireAuth, testingRoutes);

const pollingRoutes = require('./routes/polling');
app.use('/api/polling', requireAuth, pollingRoutes);

// Serve login assets without authentication
app.get('/login.html', (req, res) => {
  const loginPath = path.join(__dirname, '../public/login.html');
  res.sendFile(loginPath);
});
app.get('/css/login.css', (req, res) => {
  const cssPath = path.join(__dirname, '../public/css/login.css');
  res.sendFile(cssPath);
});
app.get('/js/login.js', (req, res) => {
  const jsPath = path.join(__dirname, '../public/js/login.js');
  res.sendFile(jsPath);
});

// Default route - check auth and serve appropriate page
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    const indexPath = path.join(__dirname, '../public/index.html');
    res.sendFile(indexPath);
  } else {
    const loginPath = path.join(__dirname, '../public/login.html');
    res.sendFile(loginPath);
  }
});

// Apply auth middleware to all other routes
app.use('/', requireAuth);

// Serve protected static files
app.use(express.static('../public'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error handler', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize MCP servers and start server
async function startServer() {
  try {
    // Initialize DatabaseManager first (fail-fast if database unavailable)
    logger.info('Initializing database connection');
    const databaseManager = DatabaseManager.getInstance();
    await databaseManager.initialize();
    
    // Initialize MCP servers once
    logger.info('Initializing MCP servers');
    globalMCPManager = new MCPServerManager();
    await globalMCPManager.initialize();
    globalToolManager = new ToolManager(globalMCPManager);
    
    logger.info('MCP servers ready');
    
    app.listen(PORT, () => {
      logger.info('Server started', { port: PORT });
      logger.info('Health check available', { url: `http://localhost:${PORT}/api/health` });
    });
  } catch (error) {
    logger.error('Failed to initialize MCP servers', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server');
  if (globalMCPManager) {
    await globalMCPManager.cleanup();
  }
  process.exit(0);
});

// Export function to get global ToolManager
function getToolManager() {
  return globalToolManager;
}

// Export function to get global PollingService
function getPollingService() {
  return pollingService;
}

module.exports = { app, getToolManager, getPollingService };

// Start the server
startServer();