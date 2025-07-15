//server.js
const express = require('express');
const path = require('path');
require('./load-env'); // Load environment variables

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const healthcheckRoutes = require('./routes/healthcheck');
app.use('/api/health', healthcheckRoutes);

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

// Start server
app.listen(PORT, () => {
  console.log(`Smart Insurance Workflow Engine server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/api/health`);
});

module.exports = app;