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
const VerificationResultsConverter = require('./utils/VerificationResultsConverter');
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
      //logger.info("Results:", results);
      logger.info('✅ First workflow completed');
      
      // Save first workflow results in original format
      const resultsSaver = new SaveTaskResults();
      await resultsSaver.saveBatchResults(results);
      logger.info('💾 First workflow results saved to database');
      
      await this.legalEntityWorkflow(results);

      // Second workflow - Legal entity name resolution
    } catch (error) {
      logger.error('💥 Workflow execution failed:', error.message);
      throw error;
    }
  }

  async legalEntityWorkflow(all_workflow_results = {})
  {
    const resultsSaver = new SaveTaskResults();
    await this.initializeTaskManager();
    logger.info('🔍 Starting legal entity name resolution workflow');
    const refinedWorkflowExecutionIds = [];

    for (const workflow_result of all_workflow_results) {
      if (workflow_result.workflowExecutionId) {
        try {
          // Get portfolio company names from database using original workflow execution ID
          const portfolioCompanies = await this.databaseManager.getPortfolioCompaniesByWorkflowId(workflow_result.workflowExecutionId);
          
          if (portfolioCompanies.length > 0) {
            logger.info(`🏢 Found ${portfolioCompanies.length} portfolio companies for workflow ${workflow_result.workflowExecutionId}: ${portfolioCompanies.join(', ')}`);
            
            // Load the legal entity resolution workflow
            const entityWorkflowData = readWorkflow('portfolio_company_verification.json');
            
            // Get firm name from original result for input formatting
            // For PE research workflow, input is just the firm name directly
            const firmName = workflow_result.input || 'Unknown Firm';
            
            // Prepare inputs for entity resolution workflow (format: "Firm: X, Company: Y")
            const formattedInputs = portfolioCompanies.map(company => `Firm: ${firmName}, Company: ${company}`);
            const entityUserInputs = {
              input: formattedInputs
            };
            
            // Pre-generate workflow execution IDs with firm name for verification workflow
            // All executions are for portfolio companies of the same firm
            const firmNamesArray = new Array(formattedInputs.length).fill(firmName);
            const verificationInitResult = await this.initializeWorkflows('portfolio_company_verification.json', { input: firmNamesArray });
            
            // Execute the legal entity resolution workflow with pre-generated IDs
            const entityResults = await this.taskManager.executeWorkflow(entityWorkflowData, entityUserInputs, verificationInitResult.workflowExecutionIds);
            
            // Convert verification results to portfolio format before saving
            const convertedResults = VerificationResultsConverter.consolidateByFirm(entityResults);
            
            // Save converted results to database in portfolio format
            await resultsSaver.saveBatchResults(convertedResults);
            logger.info('💾 Refined workflow results saved to database');
            
            // Extract the new workflow execution IDs from the converted results
            for (const convertedResult of convertedResults) {
              if (convertedResult.workflowExecutionId) {
                refinedWorkflowExecutionIds.push(convertedResult.workflowExecutionId);
              }
            }
            
            logger.info(`✅ Legal entity resolution completed for workflow ${workflow_result.workflowExecutionId}`);
          } else {
            logger.info(`⚠️ No portfolio companies found for workflow ${workflow_result.workflowExecutionId}, skipping refinement`);
          }
        } catch (error) {
          logger.error(`❌ Failed to refine names for workflow ${workflow_result.workflowExecutionId}:`, error.message);
        }
      }
    }

    logger.info(`🔍 Name refinement completed. Generated ${refinedWorkflowExecutionIds.length} refined workflow execution IDs`);

    // Automatically trigger data extraction for each refined workflow execution
    logger.info('🔍 Starting automatic data extraction for refined portfolio companies');
    const extractionResults = [];
    
    for (const refinedWorkflowExecutionId of refinedWorkflowExecutionIds) {
      try {
        logger.info(`📊 Extracting data for refined workflow execution ID: ${refinedWorkflowExecutionId}`);
        const extractionResult = await this.extractPortfolioCompanyData(refinedWorkflowExecutionId);
        extractionResults.push({
          workflowExecutionId: refinedWorkflowExecutionId,
          extraction: extractionResult
        });
      } catch (error) {
        logger.error(`❌ Data extraction failed for refined workflow ID ${refinedWorkflowExecutionId}:`, error.message);
        extractionResults.push({
          workflowExecutionId: refinedWorkflowExecutionId,
          extraction: { success: false, error: error.message }
        });
      }
    }
    
    logger.info('✅ Combined workflow (research + data extraction) completed');
    /* DATA IS SAVED TO DATABASE, RETURN NOT USED
    return {
      portfolioResearch: results,
      dataExtraction: extractionResults
    };
    */
  }

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