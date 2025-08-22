// routes/pipeline.js - New RESTful pipeline routes
const express = require('express');
const router = express.Router();
const { manager: logger } = require('../utils/logger');
const { Manager } = require('../Manager');

const manager = new Manager();

// CREATE new pipeline
router.post('/', async (req, res) => {
  try {
    const { firm_name } = req.body;
    
    if (!firm_name) {
      return res.status(400).json({ 
        error: 'firm_name is required' 
      });
    }

    const pipeline = await manager.createPipeline(firm_name);
    
    logger.info(`📋 Created new pipeline ${pipeline.pipeline_id} for firm: ${firm_name}`);
    
    res.status(201).json({
      success: true,
      pipeline: pipeline
    });
    
  } catch (error) {
    logger.error('Pipeline creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET single pipeline
router.get('/:id', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    const pipeline = await manager.databaseManager.getPipeline(pipelineId);
    
    if (!pipeline) {
      return res.status(404).json({
        error: 'Pipeline not found'
      });
    }

    res.json({
      success: true,
      pipeline: pipeline
    });
    
  } catch (error) {
    logger.error('Get pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET all pipelines
router.get('/', async (req, res) => {
  try {
    const { status, firm_name } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (firm_name) filters.firm_name = firm_name;
    
    const pipelines = await manager.getAllPipelines(filters);
    
    res.json({
      success: true,
      pipelines: pipelines,
      count: pipelines.length
    });
    
  } catch (error) {
    logger.error('Get all pipelines error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run research step
router.post('/:id/research', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    // Send immediate response
    res.status(202).json({
      success: true,
      message: 'Research started',
      pipeline_id: pipelineId
    });

    // Run research asynchronously
    try {
      const updatedPipeline = await manager.runResearch(pipelineId);
      logger.info(`Research completed for pipeline ${pipelineId}. Found ${updatedPipeline.companies.length} companies`);
    } catch (error) {
      logger.error(`Research failed for pipeline ${pipelineId}:`, error.message);
    }

  } catch (error) {
    logger.error('Research startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run legal resolution step
router.post('/:id/legal-resolution', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    res.status(202).json({
      success: true,
      message: 'Legal entity resolution started',
      pipeline_id: pipelineId
    });

    try {
      const updatedPipeline = await manager.runLegalResolution(pipelineId);
      logger.info(`Legal resolution completed for pipeline ${pipelineId}`);
    } catch (error) {
      logger.error(`Legal resolution failed for pipeline ${pipelineId}:`, error.message);
    }

  } catch (error) {
    logger.error('Legal resolution startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run data extraction step
router.post('/:id/data-extraction', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    res.status(202).json({
      success: true,
      message: 'Data extraction started',
      pipeline_id: pipelineId
    });

    try {
      const updatedPipeline = await manager.runDataExtraction(pipelineId);
      logger.info(`Data extraction completed for pipeline ${pipelineId}`);
    } catch (error) {
      logger.error(`Data extraction failed for pipeline ${pipelineId}:`, error.message);
    }

  } catch (error) {
    logger.error('Data extraction startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run complete pipeline (convenience route)
router.post('/run-complete', async (req, res) => {
  try {
    const { firm_name } = req.body;
    
    if (!firm_name) {
      return res.status(400).json({ 
        error: 'firm_name is required' 
      });
    }

    res.status(202).json({
      success: true,
      message: 'Complete pipeline started',
      firm_name: firm_name
    });

    try {
      const pipeline = await manager.runCompletePipeline(firm_name);
      logger.info(`Complete pipeline finished successfully for ${firm_name}`);
    } catch (error) {
      logger.error(`Complete pipeline failed for ${firm_name}:`, error.message);
    }

  } catch (error) {
    logger.error('Complete pipeline startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST retry a failed step
router.post('/:id/retry/:step', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    const step = req.params.step;
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    if (!['research', 'legal_resolution', 'data_extraction'].includes(step)) {
      return res.status(400).json({
        error: 'Step must be research, legal_resolution, or data_extraction'
      });
    }

    res.status(202).json({
      success: true,
      message: `Retrying ${step} step`,
      pipeline_id: pipelineId
    });
    
    try {
      const updatedPipeline = await manager.retryStep(pipelineId, step);
      logger.info(`${step} retry completed successfully for pipeline ${pipelineId}`);
    } catch (error) {
      logger.error(`${step} retry failed for pipeline ${pipelineId}:`, error.message);
    }

  } catch (error) {
    logger.error('Retry step error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST update pipeline (for testing database updates directly)
router.post('/:id/update', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    const { updates } = req.body;
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        error: 'updates object is required in request body'
      });
    }

    // Convert companies array to JSON string for JSONB storage
    if (updates.companies && Array.isArray(updates.companies)) {
      updates.companies = JSON.stringify(updates.companies);
    }

    await manager.databaseManager.updatePipeline(pipelineId, updates);
    
    res.json({
      success: true,
      message: 'Pipeline updated successfully',
      pipeline_id: pipelineId
    });
    
  } catch (error) {
    logger.error('Update pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE pipeline
router.delete('/:id', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    await manager.databaseManager.deletePipeline(pipelineId);
    
    res.json({
      success: true,
      message: 'Pipeline deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;