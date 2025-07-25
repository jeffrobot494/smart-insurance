// Load environment variables from .env file
require('./utils/load-env');

const path = require('path');
const fs = require('fs');
const { manager: logger } = require('./utils/logger');
const { readWorkflow } = require('./utils/workflowReader');
const WorkflowManager = require('./workflow/WorkflowManager');
const SaveTaskResults = require('./workflow/SaveTaskResults');
const CLIInputParser = require('./utils/CLIInputParser');
const OutputFileManager = require('./utils/OutputFileManager');
const ResultsParser = require('./utils/ResultsParser');
const ResultsExtractor = require('./utils/ResultsExtractor');
const DataExtractionService = require('./data-extraction/DataExtractionService');
const DatabaseManager = require('./data-extraction/DatabaseManager');

class Manager {
  constructor() {
    this.taskManager = null;
    this.outputManager = new OutputFileManager();
    this.parser = new ResultsParser();
    this.extractor = new ResultsExtractor();
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
   * Initialize workflows and return IDs immediately for polling
   */
  async initializeWorkflows(workflowFilename, userInputs) {
    try {
      await this.initializeTaskManager();
      
      const inputArray = Array.isArray(userInputs.input) ? userInputs.input : [userInputs.input];
      const workflowData = readWorkflow(workflowFilename);
      
      // Pre-generate workflow execution IDs with firm names
      const workflowExecutionIds = await this.databaseManager.createBatchWorkflowExecutions(
        workflowData.workflow.name, 
        inputArray
      );
      
      logger.info(`🆔 Pre-generated ${workflowExecutionIds.length} workflow execution IDs for immediate polling`);
      
      return {
        workflowExecutionIds,
        firmNames: inputArray,
        workflowData
      };
    } catch (error) {
      logger.error('💥 Workflow initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * First workflow - PE research
   */
  async run(workflowFilename = null, userInputs = {}, preGeneratedIds = null) {
    try {
      await this.initializeTaskManager();

      const cliParser = new CLIInputParser();
      const filename = workflowFilename || cliParser.getWorkflowFilename();
      
      logger.info(`🚀 Starting workflow execution for: ${filename}`);
      
      // Log user inputs if provided
      if (Object.keys(userInputs).length > 0) {
        logger.info('📥 User inputs provided:', userInputs);
      }
      
      const workflowData = readWorkflow(filename);
      
      // Set workflow name in environment for SaveTaskResults
      process.env.WORKFLOW_NAME = workflowData.workflow.name.replace(/\s+/g, '_').toLowerCase();

      // Execute the workflow with user inputs and optional pre-generated IDs
      const results = await this.taskManager.executeWorkflow(workflowData, userInputs, preGeneratedIds);
      
      logger.info('✅ First workflow completed');
      
      // Automatically trigger data extraction for each workflow execution
      logger.info('🔍 Starting automatic data extraction for portfolio companies');
      const extractionResults = [];
      
      for (const result of results) {
        if (result.workflowExecutionId) {
          try {
            logger.info(`📊 Extracting data for workflow execution ID: ${result.workflowExecutionId}`);
            const extractionResult = await this.extractPortfolioCompanyData(result.workflowExecutionId);
            extractionResults.push({
              workflowExecutionId: result.workflowExecutionId,
              extraction: extractionResult
            });
          } catch (error) {
            logger.error(`❌ Data extraction failed for workflow ID ${result.workflowExecutionId}:`, error.message);
            extractionResults.push({
              workflowExecutionId: result.workflowExecutionId,
              extraction: { success: false, error: error.message }
            });
          }
        }
      }
      
      logger.info('✅ Combined workflow (research + data extraction) completed');
      return {
        portfolioResearch: results,
        dataExtraction: extractionResults
      };

    } catch (error) {
      logger.error('💥 Workflow execution failed:', error.message);
      throw error;
    }
  }

  /**
   * Second workflow - Legal entity extraction
   */
  /*
  async run2() {
    try {
      await this.initializeTaskManager();

      logger.info('\n🔗 Starting second workflow: Legal entity extraction');
      
      // 1. Parse companies from most recent output file
      const outputDir = path.join(__dirname, 'json', 'output');
      const mostRecentFile = this.outputManager.getMostRecentOutputFile(outputDir, 'pe_firm_research');
      logger.info("[DEBUG] - Most recent file:", mostRecentFile);

      const firstWorkflowResults = JSON.parse(fs.readFileSync(mostRecentFile, 'utf8'));
      const firmAndCompanyNames = this.parser.parseCompaniesFromResults(firstWorkflowResults);

      // Validate parsed companies
      if (!this.parser.validateCompanies(firmAndCompanyNames)) {
        logger.warn('⚠️ Company parsing validation failed, but continuing with workflow');
      }
      
      // 2. Load and execute legal entities workflow
      const getLegalEntitiesWorkflow = readWorkflow('get_legal_entities.json');
      
      // Set workflow name in environment for SaveTaskResults
      process.env.WORKFLOW_NAME = getLegalEntitiesWorkflow.workflow.name.replace(/\s+/g, '_').toLowerCase();
      
      logger.info(`🏢 Executing legal entities workflow for ${firmAndCompanyNames.length} companies`);
      
      // Pass company names as individual items in the input array
      // WorkflowManager will process each company name separately
      const legal_names = await this.taskManager.executeWorkflow(getLegalEntitiesWorkflow, { input: firmAndCompanyNames });
      
      // 3. Log results
      logger.info('\n📋 Legal entity extraction completed:');
      logger.info('Legal names:', legal_names);
      
      return {
        firmAndCompanyNames,
        legalEntities: legal_names 
      };
      
    } catch (error) {
      logger.error('💥 Workflow execution failed:', error.message);
      throw error;
    }
  }
*/
  /**
   * Extract Form 5500 data for portfolio companies from a specific workflow execution
   * @param {number} workflowExecutionId - The workflow execution ID to get companies from
   */
  async extractPortfolioCompanyData(workflowExecutionId) {
    try {
      logger.info(`🔍 Extracting Form 5500 data for portfolio companies from workflow execution: ${workflowExecutionId}`);
      
      // Get portfolio companies from database using workflowExecutionId
      const portfolioCompanies = await this.databaseManager.getPortfolioCompaniesByWorkflowId(workflowExecutionId);
      
      if (portfolioCompanies.length === 0) {
        logger.info('⚠️ No portfolio companies found for this workflow execution');
        const errorResult = { 
          success: false, 
          message: 'No portfolio companies found',
          timestamp: new Date().toISOString()
        };
        await this.databaseManager.updateWorkflowResults(workflowExecutionId, errorResult);
        return errorResult;
      }
      
      logger.info(`📊 Found ${portfolioCompanies.length} portfolio companies:`, portfolioCompanies);
      
      // Extract Form 5500 data for those companies
      const results = await this.dataExtractionService.extractData(portfolioCompanies, workflowExecutionId, 0);
      
      // Save results to database
      await this.databaseManager.updateWorkflowResults(workflowExecutionId, results);
      
      logger.info('✅ Data extraction completed and results saved to database');
      return results;
      
    } catch (error) {
      logger.error('❌ Failed to extract portfolio company data:', error.message);
      
      // Save error result to database
      const errorResult = { 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      try {
        await this.databaseManager.updateWorkflowResults(workflowExecutionId, errorResult);
      } catch (dbError) {
        logger.error('❌ Failed to save error result to database:', dbError.message);
      }
      
      throw error;
    }
  }

  /**
   * Get all saved workflow results
   * @returns {Array} Array of saved workflow results
   */
  async getAllSavedResults() {
    try {
      logger.info('📋 [MANAGER] Getting all saved workflow results');
      
      // Initialize database if needed
      if (!this.databaseManager.initialized) {
        await this.databaseManager.initialize();
      }
      
      const results = await this.databaseManager.getAllWorkflowResults();
      logger.info(`📋 [MANAGER] Found ${results.length} saved workflow results`);
      
      return results;
    } catch (error) {
      logger.error('❌ Failed to get all saved results:', error.message);
      throw error;
    }
  }
}

// Create a singleton instance
const manager = new Manager();

// Export functions that use the singleton
const run = (workflowFilename = null, userInputs = {}, preGeneratedIds = null) => manager.run(workflowFilename, userInputs, preGeneratedIds);
const run2 = () => manager.run2();
const runBoth = (workflowFilename = null, userInputs = {}) => manager.runBoth(workflowFilename, userInputs);
const extractPortfolioCompanyData = (workflowExecutionId) => manager.extractPortfolioCompanyData(workflowExecutionId);
const initializeWorkflows = (workflowFilename, userInputs) => manager.initializeWorkflows(workflowFilename, userInputs);
const getAllSavedResults = () => manager.getAllSavedResults();

module.exports = { run, run2, runBoth, extractPortfolioCompanyData, initializeWorkflows, getAllSavedResults, Manager };

// If called directly from command line, run with no user inputs
if (require.main === module) {
  run().catch(logger.error);
}