// Load environment variables from .env file
require('./utils/load-env');

const path = require('path');
const fs = require('fs');
const { readWorkflow } = require('./utils/workflowReader');
const WorkflowManager = require('./workflow/WorkflowManager');
const SaveTaskResults = require('./workflow/SaveTaskResults');
const CLIInputParser = require('./utils/CLIInputParser');
const OutputFileManager = require('./utils/OutputFileManager');
const ResultsParser = require('./utils/ResultsParser');
const DataExtractionService = require('./data-extraction/DataExtractionService');

class Manager {
  constructor() {
    this.taskManager = null;
    this.outputManager = new OutputFileManager();
    this.parser = new ResultsParser();
    this.dataExtractionService = new DataExtractionService();
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
      console.log('🔧 TaskManager initialized');
    }
  }

  /**
   * First workflow - PE research
   */
  async run(workflowFilename = null, userInputs = {}) {
    try {
      await this.initializeTaskManager();

      const cliParser = new CLIInputParser();
      const filename = workflowFilename || cliParser.getWorkflowFilename();
      
      console.log(`🚀 Starting workflow execution for: ${filename}`);
      
      // Log user inputs if provided
      if (Object.keys(userInputs).length > 0) {
        console.log('📥 User inputs provided:', userInputs);
      }
      
      const workflowData = readWorkflow(filename);
      
      // Set workflow name in environment for SaveTaskResults
      process.env.WORKFLOW_NAME = workflowData.workflow.name.replace(/\s+/g, '_').toLowerCase();

      // Execute the workflow with user inputs
      const results = await this.taskManager.executeWorkflow(workflowData, userInputs);
      
      console.log('✅ First workflow completed');
      return results;

    } catch (error) {
      console.error('💥 Workflow execution failed:', error.message);
      throw error;
    }
  }

  /**
   * Second workflow - Legal entity extraction
   */
  async run2() {
    try {
      await this.initializeTaskManager();

      console.log('\n🔗 Starting third workflow: Legal entity extraction');
      
      // 1. Parse companies from most recent output file
      const outputDir = path.join(__dirname, 'json', 'output');
      const mostRecentFile = this.outputManager.getMostRecentOutputFile(outputDir);
      const firstWorkflowResults = JSON.parse(fs.readFileSync(mostRecentFile, 'utf8'));
      const companyNames = this.parser.parseCompaniesFromResults(firstWorkflowResults);
      
      // Validate parsed companies
      if (!this.parser.validateCompanies(companyNames)) {
        console.warn('⚠️ Company parsing validation failed, but continuing with workflow');
      }
      
      // 2. Load and execute legal entities workflow
      const getLegalEntitiesWorkflow = readWorkflow('get_legal_entities.json');
      
      // Set workflow name in environment for SaveTaskResults
      process.env.WORKFLOW_NAME = getLegalEntitiesWorkflow.workflow.name.replace(/\s+/g, '_').toLowerCase();
      
      console.log(`🏢 Executing legal entities workflow for ${companyNames.length} companies`);
      
      // Pass company names as individual items in the input array
      // WorkflowManager will process each company name separately
      const legal_names = await this.taskManager.executeWorkflow(getLegalEntitiesWorkflow, { input: companyNames });
      
      // 3. Log results
      console.log('\n📋 Legal entity extraction completed:');
      console.log('Legal names:', legal_names);
      
      return {
        companyNames,
        legalEntities: legal_names 
      };
      
    } catch (error) {
      console.error('💥 Workflow execution failed:', error.message);
      throw error;
    }
  }

  async run3(){
    //parse legal names from workflow 2 output
    const legalNames = "SMARTBUG LLC";
    this.dataExtractionService.extractData(legalNames);
  }

  /**
   * Combined workflow execution (both workflows in sequence)
   */
  async runBoth(workflowFilename = null, userInputs = {}) {
    try {
      console.log('🚀 Starting combined workflow execution');
      
      // Run first workflow
      const firstResults = await this.run(workflowFilename, userInputs);
      
      // Run second workflow (uses output from first)
      const secondResults = await this.run2();
      
      return {
        firstWorkflow: firstResults,
        secondWorkflow: secondResults
      };
      
    } catch (error) {
      console.error('💥 Combined workflow execution failed:', error.message);
      throw error;
    }
  }
}

// Create a singleton instance
const manager = new Manager();

// Export functions that use the singleton
const run = (workflowFilename = null, userInputs = {}) => manager.run(workflowFilename, userInputs);
const run2 = () => manager.run2();
const runBoth = (workflowFilename = null, userInputs = {}) => manager.runBoth(workflowFilename, userInputs);
const run3 = () => manager.run3();

module.exports = { run, run2, runBoth, run3, Manager };

// If called directly from command line, run with no user inputs
if (require.main === module) {
  run().catch(console.error);
}