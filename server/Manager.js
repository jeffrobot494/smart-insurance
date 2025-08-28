// Load environment variables from .env file
require('./utils/load-env');

const path = require('path');
const { manager: logger } = require('./utils/logger');
const { readWorkflow } = require('./utils/workflowReader');
const WorkflowManager = require('./workflow/WorkflowManager');
const WorkflowResultsParser = require('./utils/WorkflowResultsParser');
const DataExtractionService = require('./data-extraction/DataExtractionService');
const DatabaseManager = require('./data-extraction/DatabaseManager');
const WorkflowErrorHandler = require('./ErrorHandling/WorkflowErrorHandler');
const WorkflowCancellationManager = require('./ErrorHandling/WorkflowCancellationManager');

// Pipeline Status Constants
const PIPELINE_STATUSES = {
  PENDING: 'pending',
  RESEARCH_RUNNING: 'research_running',
  RESEARCH_COMPLETE: 'research_complete',
  RESEARCH_FAILED: 'research_failed',
  LEGAL_RESOLUTION_RUNNING: 'legal_resolution_running',
  LEGAL_RESOLUTION_COMPLETE: 'legal_resolution_complete',
  LEGAL_RESOLUTION_FAILED: 'legal_resolution_failed',
  DATA_EXTRACTION_RUNNING: 'data_extraction_running',
  DATA_EXTRACTION_COMPLETE: 'data_extraction_complete',
  DATA_EXTRACTION_FAILED: 'data_extraction_failed'
};

class Manager {
  constructor() {
    this.taskManager = null;
    this.dataExtractionService = new DataExtractionService();
    this.databaseManager = DatabaseManager.getInstance();
    
    // Add WorkflowErrorHandler initialization
    this.errorHandler = new WorkflowErrorHandler(this.databaseManager, logger);
    this.cancellationManager = WorkflowCancellationManager.getInstance();
  }

  /**
   * Initialize the shared TaskManager instance
   */
  async initializeTaskManager() {
    if (!this.taskManager) {
      // Get global ToolManager dynamically to avoid circular dependency
      const { getToolManager } = require('./server');
      const toolManager = getToolManager();
      if (!toolManager) {
        throw new Error('ToolManager not available. Ensure server is running.');
      }
      this.taskManager = new WorkflowManager(toolManager);
      logger.info('🔧 TaskManager initialized');
    }
  }

  /**
   * Create a new pipeline for a firm
   * @param {string} firmName - Name of the PE firm
   * @returns {Object} New pipeline object
   */
  async createPipeline(firmName) {
    if (!firmName || firmName.trim().length === 0) {
      throw new Error('firmName is required and cannot be empty');
    }
    
    const pipelineId = await this.databaseManager.createPipeline(firmName.trim());
    return await this.databaseManager.getPipeline(pipelineId);
  }

  /**
   * Step 1: Run research workflow to find portfolio companies
   * @param {number} pipelineId 
   * @returns {Object} Updated pipeline object
   */
  async runResearch(pipelineId) {
    await this.initializeTaskManager();
    
    // Get current pipeline state
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== PIPELINE_STATUSES.PENDING) {
      throw new Error(`Research can only be run on pending pipelines. Current status: ${pipeline.status}`);
    }

    logger.info(`🔍 Starting research for firm: ${pipeline.firm_name}`);
    
    try {
      // Update status to indicate research is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: PIPELINE_STATUSES.RESEARCH_RUNNING 
      });

      // Load and execute research workflow
      const workflowData = readWorkflow('pe_firm_research.json');
      const results = await this.taskManager.executeWorkflow(workflowData, { 
        input: pipeline.firm_name 
      }, pipelineId);

      // Parse company objects from results using WorkflowResultsParser
      const companyObjects = WorkflowResultsParser.parseResults(results);
      
      if (companyObjects.length === 0) {
        throw new Error('No portfolio companies found during research');
      }

      // Update pipeline with research results
      await this.databaseManager.updatePipeline(pipelineId, {
        companies: JSON.stringify(companyObjects), // Convert to JSON string for JSONB storage
        status: PIPELINE_STATUSES.RESEARCH_COMPLETE,
        research_completed_at: new Date()
      });

      logger.info(`✅ Research completed. Found ${companyObjects.length} companies`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      // Check if it's an API error that should trigger error recording and cancellation
      if (error.isWorkflowError) {
        await this.errorHandler.handleWorkflowFailure(
          pipelineId, 
          PIPELINE_STATUSES.RESEARCH_RUNNING, 
          error, 
          error.apiName
        );
        return; // Don't throw - error handler has set status and triggered cancellation
      }
      
      // Handle programming/logic errors the same way as before
      logger.error(`❌ Research failed for pipeline ${pipelineId}:`, error.message);
      await this.databaseManager.updatePipeline(pipelineId, {
        status: PIPELINE_STATUSES.RESEARCH_FAILED
      });
      throw error;
    }
  }

  /**
   * Step 2: Run legal entity resolution workflow
   * @param {number} pipelineId 
   * @returns {Object} Updated pipeline object
   */
  async runLegalResolution(pipelineId) {
    await this.initializeTaskManager();
    
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== PIPELINE_STATUSES.RESEARCH_COMPLETE) {
      throw new Error(`Legal resolution requires research to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`🏢 Starting legal entity resolution for ${pipeline.companies.length} companies`);
    
    try {
      // Update status to indicate legal resolution is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: PIPELINE_STATUSES.LEGAL_RESOLUTION_RUNNING 
      });

      // Run legal entity resolution for each company individually
      const enrichedCompanies = [];
      
      for (const company of pipeline.companies) {
        const legalResolutionInput = `Firm: ${pipeline.firm_name}, Company: ${company.name}`;
        
        // Load and execute legal entity resolution workflow for single company
        const workflowData = readWorkflow('portfolio_company_verification.json');
        const result = await this.taskManager.executeWorkflow(workflowData, { 
          input: legalResolutionInput
        }, pipelineId);

        // Parse legal entity result using WorkflowResultsParser
        const enrichedCompanyObjects = WorkflowResultsParser.parseResults(result);
        
        if (enrichedCompanyObjects.length > 0) {
          const enrichedCompany = enrichedCompanyObjects[0]; // Should be one company
          enrichedCompanies.push(enrichedCompany);
          
          logger.info(`   ✓ ${enrichedCompany.name} → ${enrichedCompany.legal_entity_name}${enrichedCompany.city ? ` (${enrichedCompany.city}, ${enrichedCompany.state})` : ''}`);
        } else {
          // Fallback: keep original company with legal_entity_name as fallback
          enrichedCompanies.push({
            name: company.name,
            legal_entity_name: company.name,
            city: null,
            state: null,
            exited: false
          });
          
          logger.info(`   ✓ ${company.name} → ${company.name} (fallback)`);
        }
      }

      // Update pipeline with enriched company objects
      await this.databaseManager.updatePipeline(pipelineId, {
        companies: JSON.stringify(enrichedCompanies), // Convert to JSON string for JSONB storage
        status: PIPELINE_STATUSES.LEGAL_RESOLUTION_COMPLETE,
        legal_resolution_completed_at: new Date()
      });

      logger.info(`✅ Legal entity resolution completed`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      // Check if it's an API error that should trigger error recording and cancellation
      if (error.isWorkflowError) {
        await this.errorHandler.handleWorkflowFailure(
          pipelineId, 
          PIPELINE_STATUSES.LEGAL_RESOLUTION_RUNNING, 
          error, 
          error.apiName
        );
        return; // Don't throw - error handler has set status and triggered cancellation
      }
      
      // Handle programming/logic errors the same way as before
      logger.error(`❌ Legal resolution failed for pipeline ${pipelineId}:`, error.message);
      logger.error('Full error details:', error);
      await this.databaseManager.updatePipeline(pipelineId, {
        status: PIPELINE_STATUSES.LEGAL_RESOLUTION_FAILED
      });
      throw error;
    }
  }

  /**
   * Step 3: Run Form 5500 data extraction
   * @param {number} pipelineId 
   * @returns {Object} Updated pipeline object
   */
  async runDataExtraction(pipelineId) {
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== PIPELINE_STATUSES.LEGAL_RESOLUTION_COMPLETE) {
      throw new Error(`Data extraction requires legal resolution to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`📊 Starting Form 5500 data extraction for ${pipeline.companies.length} companies`);
    
    try {
      // Update status to indicate data extraction is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: PIPELINE_STATUSES.DATA_EXTRACTION_RUNNING 
      });

      // Extract Form 5500 data using simplified DataExtractionService
      const form5500Data = await this.dataExtractionService.extractData(pipelineId);

      // The service returns companies with Form 5500 data already mapped
      const companiesWithForm5500 = form5500Data.companies || pipeline.companies;

      // Update pipeline with final results
      await this.databaseManager.updatePipeline(pipelineId, {
        companies: JSON.stringify(companiesWithForm5500), // Convert to JSON string for JSONB storage
        status: PIPELINE_STATUSES.DATA_EXTRACTION_COMPLETE,
        data_extraction_completed_at: new Date()
      });

      logger.info(`✅ Data extraction completed`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Data extraction failed for pipeline ${pipelineId}:`, error.message);
      
      await this.databaseManager.updatePipeline(pipelineId, {
        status: PIPELINE_STATUSES.DATA_EXTRACTION_FAILED
      });
      
      throw error;
    }
  }

  /**
   * Run complete pipeline (all 3 steps) - convenience method
   * @param {string} firmName 
   * @returns {Object} Final pipeline object with enriched companies
   */
  async runCompletePipeline(firmName) {
    // Create pipeline
    const pipeline = await this.createPipeline(firmName);
    
    // Run all steps sequentially
    await this.runResearch(pipeline.pipeline_id);
    await this.runLegalResolution(pipeline.pipeline_id);
    await this.runDataExtraction(pipeline.pipeline_id);
    
    return await this.databaseManager.getPipeline(pipeline.pipeline_id);
  }

  /**
   * Retry a failed pipeline step
   * @param {number} pipelineId 
   * @param {string} step - 'research', 'legal_resolution', or 'data_extraction'
   * @returns {Object} Updated pipeline object
   */
  async retryStep(pipelineId, step) {
    // Reset pipeline state for the specified step
    await this.databaseManager.resetPipeline(pipelineId, step);
    
    // Run the step
    if (step === 'research') {
      return await this.runResearch(pipelineId);
    } else if (step === 'legal_resolution') {
      return await this.runLegalResolution(pipelineId);
    } else if (step === 'data_extraction') {
      return await this.runDataExtraction(pipelineId);
    } else {
      throw new Error(`Invalid step: ${step}. Must be 'research', 'legal_resolution', or 'data_extraction'`);
    }
  }

  /**
   * Get all pipelines with optional filtering
   * @param {Object} filters - Optional status, firm_name filters
   * @returns {Array} Array of pipeline objects
   */
  async getAllPipelines(filters = {}) {
    return await this.databaseManager.getAllPipelines(filters);
  }

  /**
   * Get all pipelines with pagination
   * @param {Object} filters - Optional status, firm_name filters
   * @param {number} limit - Maximum number of pipelines to return
   * @param {number} offset - Number of pipelines to skip
   * @returns {Object} { pipelines: Array, total: number }
   */
  async getAllPipelinesPaginated(filters = {}, limit = 20, offset = 0) {
    return await this.databaseManager.getAllPipelinesPaginated(filters, limit, offset);
  }

  /**
   * Reset a failed pipeline to a previous successful state
   * @param {number} pipelineId 
   * @returns {Object} { success: boolean, message?: string, pipeline?: Object, error?: string }
   */
  async resetPipeline(pipelineId) {
    try {
      // Get current pipeline
      const pipeline = await this.databaseManager.getPipeline(pipelineId);
      if (!pipeline) {
        return { success: false, error: 'Pipeline not found' };
      }
      
      // Determine reset target status
      const resetToStatus = this.errorHandler.defineResetBehavior(pipeline.status);
      
      // Handle data extraction failures - return error as specified
      if (pipeline.status === PIPELINE_STATUSES.DATA_EXTRACTION_FAILED) {
        return { success: false, error: 'Data extraction failures require developer intervention and cannot be reset' };
      }
      
      // Reset pipeline data based on target status
      const updatedData = { ...pipeline };
      
      switch (resetToStatus) {
        case 'pending':
          // Remove all companies and data - start fresh
          updatedData.companies = [];
          break;
          
        case 'research_complete':
          // Remove legal resolution data, keep research companies
          updatedData.companies = updatedData.companies.map(company => ({
            name: company.name,
            confidence_level: company.confidence_level,
            // Remove legal_entity_name, city, state added in legal resolution
          }));
          break;
          
        default:
          return { success: false, error: `Cannot reset from status: ${pipeline.status}` };
      }
      
      // Clear error data and update status
      await this.databaseManager.updatePipeline(pipelineId, {
        status: resetToStatus,
        error: null,  // Clear error JSONB column
        companies: JSON.stringify(updatedData.companies)
      });
      
      // Clear cancellation flag
      this.cancellationManager.clearCancellation(pipelineId);
      
      // Return updated pipeline
      const updatedPipeline = await this.databaseManager.getPipeline(pipelineId);
      return {
        success: true,
        message: `Pipeline reset to ${resetToStatus}`,
        pipeline: updatedPipeline
      };
      
    } catch (error) {
      logger.error('Failed to reset pipeline:', error);
      return { success: false, error: 'Failed to reset pipeline' };
    }
  }
}

// Create a singleton instance
const manager = new Manager();

// Export functions that use the singleton
const createPipeline = (firmName) => manager.createPipeline(firmName);
const runResearch = (pipelineId) => manager.runResearch(pipelineId);
const runLegalResolution = (pipelineId) => manager.runLegalResolution(pipelineId);
const runDataExtraction = (pipelineId) => manager.runDataExtraction(pipelineId);
const runCompletePipeline = (firmName) => manager.runCompletePipeline(firmName);
const retryStep = (pipelineId, step) => manager.retryStep(pipelineId, step);
const resetPipeline = (pipelineId) => manager.resetPipeline(pipelineId);
const getAllPipelines = (filters) => manager.getAllPipelines(filters);

module.exports = { 
  createPipeline, 
  runResearch, 
  runLegalResolution, 
  runDataExtraction, 
  runCompletePipeline, 
  retryStep, 
  resetPipeline,
  getAllPipelines, 
  Manager,
  PIPELINE_STATUSES 
};

// If called directly from command line, run complete pipeline
if (require.main === module) {
  const firmName = process.argv[2] || 'Test Firm';
  runCompletePipeline(firmName).catch(logger.error);
}