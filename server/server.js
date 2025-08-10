//server.js
const express = require('express');
const path = require('path');
require('./utils/load-env'); // Load environment variables
const { server: logger } = require('./utils/logger');
const MCPServerManager = require('./mcp/MCPServerManager');
const ToolManager = require('./workflow/ToolManager');
const DatabaseManager = require('./data-extraction/DatabaseManager');
const pollingService = require('./services/PollingService');

const app = express();
const PORT = process.env.PORT || 3000;

// Global MCP instances
let globalMCPManager = null;
let globalToolManager = null;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const healthcheckRoutes = require('./routes/healthcheck');
app.use('/api/health', healthcheckRoutes);

const workflowRoutes = require('./routes/workflow');
app.use('/api/workflow', workflowRoutes);

const testingRoutes = require('./routes/testing');
app.use('/api/testing', testingRoutes);

const pollingRoutes = require('./routes/polling');
app.use('/api/polling', pollingRoutes);

app.use(express.static('../public'));

// Default route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Smart Insurance Workflow Engine API', 
    version: '1.0.0',
    status: 'running' 
  });
});

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