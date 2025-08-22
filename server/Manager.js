// Load environment variables from .env file
require('./utils/load-env');

const path = require('path');
const { manager: logger } = require('./utils/logger');
const { readWorkflow } = require('./utils/workflowReader');
const WorkflowManager = require('./workflow/WorkflowManager');
const WorkflowResultsParser = require('./utils/WorkflowResultsParser');
const DataExtractionService = require('./data-extraction/DataExtractionService');
const DatabaseManager = require('./data-extraction/DatabaseManager');

class Manager {
  constructor() {
    this.taskManager = null;
    this.dataExtractionService = new DataExtractionService();
    this.databaseManager = DatabaseManager.getInstance();
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
    
    if (pipeline.status !== 'pending') {
      throw new Error(`Research can only be run on pending pipelines. Current status: ${pipeline.status}`);
    }

    logger.info(`🔍 Starting research for firm: ${pipeline.firm_name}`);
    
    try {
      // Update status to indicate research is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: 'research_running' 
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
        status: 'research_complete',
        research_completed_at: new Date()
      });

      logger.info(`✅ Research completed. Found ${companyObjects.length} companies`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Research failed for pipeline ${pipelineId}:`, error.message);
      
      // Update pipeline with error status
      await this.databaseManager.updatePipeline(pipelineId, {
        status: 'research_failed'
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
    
    if (pipeline.status !== 'research_complete') {
      throw new Error(`Legal resolution requires research to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`🏢 Starting legal entity resolution for ${pipeline.companies.length} companies`);
    
    try {
      // Update status to indicate legal resolution is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: 'legal_resolution_running' 
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
        status: 'legal_resolution_complete',
        legal_resolution_completed_at: new Date()
      });

      logger.info(`✅ Legal entity resolution completed`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Legal resolution failed for pipeline ${pipelineId}:`, error.message);
      logger.error('Full error details:', error);
      
      await this.databaseManager.updatePipeline(pipelineId, {
        status: 'legal_resolution_failed'
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
    
    if (pipeline.status !== 'legal_resolution_complete') {
      throw new Error(`Data extraction requires legal resolution to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`📊 Starting Form 5500 data extraction for ${pipeline.companies.length} companies`);
    
    try {
      // Update status to indicate data extraction is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: 'data_extraction_running' 
      });

      // Extract Form 5500 data using simplified DataExtractionService
      const form5500Data = await this.dataExtractionService.extractData(pipelineId);

      // The service returns companies with Form 5500 data already mapped
      const companiesWithForm5500 = form5500Data.companies || pipeline.companies;

      // Update pipeline with final results
      await this.databaseManager.updatePipeline(pipelineId, {
        companies: JSON.stringify(companiesWithForm5500), // Convert to JSON string for JSONB storage
        status: 'data_extraction_complete',
        data_extraction_completed_at: new Date()
      });

      logger.info(`✅ Data extraction completed`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Data extraction failed for pipeline ${pipelineId}:`, error.message);
      
      await this.databaseManager.updatePipeline(pipelineId, {
        status: 'data_extraction_failed'
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
const getAllPipelines = (filters) => manager.getAllPipelines(filters);

module.exports = { 
  createPipeline, 
  runResearch, 
  runLegalResolution, 
  runDataExtraction, 
  runCompletePipeline, 
  retryStep, 
  getAllPipelines, 
  Manager 
};

// If called directly from command line, run complete pipeline
if (require.main === module) {
  const firmName = process.argv[2] || 'Test Firm';
  runCompletePipeline(firmName).catch(logger.error);
}