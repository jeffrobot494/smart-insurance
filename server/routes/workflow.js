const express = require('express');
const router = express.Router();
const { run, run2, extractPortfolioCompanyData } = require('../Manager');

// POST /api/workflow
router.post('/', async (req, res) => {
  try {
    const { workflowname, input } = req.body;

    // Validate required fields
    if (!workflowname) {
      return res.status(400).json({ 
        error: 'workflowname is required' 
      });
    }

    if (!input) {
      return res.status(400).json({ 
        error: 'input is required' 
      });
    }

    // Always convert to array
    const inputArray = Array.isArray(input) ? input : [input];

    // Add .json extension if not present
    const workflowFile = workflowname.endsWith('.json') ? workflowname : `${workflowname}.json`;

    // Send immediate response
    res.status(202).json({
      success: true,
      message: 'Workflow execution started',
      workflowname,
      inputCount: inputArray.length,
      status: 'started'
    });

    // Execute workflow asynchronously (fire and forget)
    run(workflowFile, { input: inputArray })
    /*
      .then(results => {
        console.log(`Workflow ${workflowname} completed successfully`);
        // Results are automatically saved by SaveTaskResults.js
      })
      .catch(error => {
        console.error(`Workflow ${workflowname} failed:`, error.message);
      });
*/
  } catch (error) {
    console.error('Workflow startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/workflow/2
router.get('/2/', async (req, res) => {
  try {

    // Send immediate response
    res.status(202).json({
      success: true,
      message: 'Workflow execution 2 started',
      status: 'started'
    });

    // Execute workflow asynchronously (fire and forget)
    run2();

  } catch (error) {
    console.error('Workflow startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/workflow/extract5500/:workflowExecutionId
// Extract 5500 data and save to database
router.get('/extract5500/:workflowExecutionId', async (req, res) => {
  try {
    const { workflowExecutionId } = req.params;
    
    // Validate workflowExecutionId
    if (!workflowExecutionId || isNaN(workflowExecutionId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid workflowExecutionId is required'
      });
    }

    res.status(202).json({
      success: true,
      message: 'Portfolio company data extraction started',
      workflowExecutionId: parseInt(workflowExecutionId)
    });

    // Execute data extraction asynchronously (fire and forget)
    extractPortfolioCompanyData(parseInt(workflowExecutionId));

  } catch (error) {
    console.error('Portfolio company data extraction startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/workflow/:workflowId/results
router.get('/:workflowId/results', async (req, res) => {
  console.log('📋 [RESULTS] Get workflow results:', req.params.workflowId);
  res.json({ message: 'Workflow results endpoint' });
});

module.exports = router;