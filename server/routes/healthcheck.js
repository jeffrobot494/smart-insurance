const express = require('express');
const router = express.Router();

// GET /api/health
router.get('/', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    node_version: process.version,
    memory_usage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };

  res.status(200).json(healthStatus);
});

// GET /api/health/detailed
router.get('/detailed', (req, res) => {
  const detailedHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    node_version: process.version,
    memory_usage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.platform,
    architecture: process.arch,
    cpu_usage: process.cpuUsage()
  };

  res.status(200).json(detailedHealth);
});

module.exports = router;