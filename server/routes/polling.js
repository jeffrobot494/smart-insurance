const express = require('express');
const router = express.Router();
const pollingService = require('../services/PollingService');

// GET /api/polling/:workflowId
router.get('/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    // Validate workflowId
    if (!workflowId) {
      return res.status(400).json({
        success: false,
        error: 'workflowId is required'
      });
    }

    console.log('📊 [POLLING] Check workflow status:', workflowId);
    
    // Get all messages for this workflow and clear the queue
    const messages = pollingService.getAndClearMessages(workflowId);
    
    res.json({
      success: true,
      workflowId: workflowId,
      messageCount: messages.length,
      messages: messages
    });
    
  } catch (error) {
    console.error('❌ Polling endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/polling/:workflowId/peek (for debugging - doesn't clear queue)
router.get('/:workflowId/peek', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    if (!workflowId) {
      return res.status(400).json({
        success: false,
        error: 'workflowId is required'
      });
    }

    const messages = pollingService.peekMessages(workflowId);
    
    res.json({
      success: true,
      workflowId: workflowId,
      messageCount: messages.length,
      messages: messages,
      note: 'Messages not cleared (debug mode)'
    });
    
  } catch (error) {
    console.error('❌ Polling peek endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;