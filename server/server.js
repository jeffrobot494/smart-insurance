//server.js
const express = require('express');
const path = require('path');
require('./utils/load-env'); // Load environment variables
const MCPServerManager = require('./mcp/MCPServerManager');
const ToolManager = require('./workflow/ToolManager');
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
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize MCP servers and start server
async function startServer() {
  try {
    // Initialize MCP servers once
    console.log('🔄 Initializing MCP servers...');
    globalMCPManager = new MCPServerManager();
    await globalMCPManager.initialize();
    globalToolManager = new ToolManager(globalMCPManager);
    
    console.log('✅ MCP servers ready');
    
    app.listen(PORT, () => {
      console.log(`Smart Insurance Workflow Engine server running on port ${PORT}`);
      console.log(`Health check available at: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize MCP servers:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
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