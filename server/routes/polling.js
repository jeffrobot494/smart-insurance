const express = require('express');
const router = express.Router();

// GET /api/polling/:workflowId
router.get('/:workflowId', async (req, res) => {
  console.log('📊 [POLLING] Check workflow status:', req.params.workflowId);
  res.json({ message: 'Polling status endpoint' });
});

module.exports = router;