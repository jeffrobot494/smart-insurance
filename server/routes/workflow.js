const express = require('express');
const router = express.Router();
const { run, run2, run3 } = require('../Manager');

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

// POST /api/workflow/2
router.post('/2/', async (req, res) => {
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

router.get('/3/', async (req, res) => {
  try{
    res.status(202).json({
      success:true,
      message: 'Data extraction started'
    })
    run3();
  } catch (error) {
    console.error('Data Extraction startup error:', error);
    res.status(500).json({
      successs:false,
      error: error.message
    })
  }
});


module.exports = router;