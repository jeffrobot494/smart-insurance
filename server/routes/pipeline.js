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

// GET all pipelines with pagination
router.get('/', async (req, res) => {
  try {
    const { status, firm_name, limit = 20, offset = 0 } = req.query;
    
    // Parse pagination parameters
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'limit must be a number between 1 and 100'
      });
    }
    
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'offset must be a non-negative number'
      });
    }
    
    const filters = {};
    if (status) filters.status = status;
    if (firm_name) filters.firm_name = firm_name;
    
    // Get paginated pipelines
    const result = await manager.getAllPipelinesPaginated(filters, limitNum, offsetNum);
    
    res.json({
      success: true,
      pipelines: result.pipelines,
      total: result.total,
      limit: limitNum,
      offset: offsetNum,
      has_more: (offsetNum + limitNum) < result.total
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

// PUT update companies in pipeline
router.put('/:id/companies', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    const { companies } = req.body;
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    if (!companies || !Array.isArray(companies)) {
      return res.status(400).json({
        error: 'companies array is required in request body'
      });
    }

    // Validate company objects
    for (const company of companies) {
      if (!company.name || typeof company.name !== 'string' || company.name.trim().length === 0) {
        return res.status(400).json({
          error: 'Each company must have a valid name'
        });
      }
    }

    // Get current pipeline to verify it exists
    const currentPipeline = await manager.databaseManager.getPipeline(pipelineId);
    if (!currentPipeline) {
      return res.status(404).json({
        error: 'Pipeline not found'
      });
    }

    // Update companies in the pipeline
    await manager.databaseManager.updatePipeline(pipelineId, {
      companies: JSON.stringify(companies) // Convert to JSON string for JSONB storage
    });

    // Return updated pipeline
    const updatedPipeline = await manager.databaseManager.getPipeline(pipelineId);
    
    logger.info(`✅ Updated companies for pipeline ${pipelineId}. Company count: ${companies.length}`);
    
    res.json({
      success: true,
      message: 'Companies updated successfully',
      pipeline: updatedPipeline
    });
    
  } catch (error) {
    logger.error('Update companies error:', error);
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

// POST reset a failed pipeline to a previous successful state
router.post('/:id/reset', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    const result = await manager.resetPipeline(pipelineId);
    
    if (result.success) {
      logger.info(`✅ Pipeline ${pipelineId} reset successfully: ${result.message}`);
      res.json({
        success: true,
        message: result.message,
        pipeline: result.pipeline
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
    
  } catch (error) {
    logger.error('Failed to reset pipeline:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset pipeline' 
    });
  }
});

// GET pipeline error details
router.get('/:id/error', async (req, res) => {
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
        success: false, 
        error: 'Pipeline not found' 
      });
    }
    
    // Handle error parsing - it might already be parsed by the database driver
    let parsedError = null;
    if (pipeline.error) {
      if (typeof pipeline.error === 'string') {
        parsedError = JSON.parse(pipeline.error);
      } else {
        parsedError = pipeline.error; // Already an object
      }
    }
    
    res.json({
      success: true,
      error: parsedError
    });
    
  } catch (error) {
    logger.error('Failed to fetch pipeline error details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch error details' 
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