// Load environment variables from .env file
require('./utils/load-env');

const path = require('path');
const { readWorkflow } = require('./utils/workflowReader');
const WorkflowManager = require('./workflow/WorkflowManager');
const SaveTaskResults = require('./workflow/SaveTaskResults');
const CLIInputParser = require('./utils/CLIInputParser');
// Remove circular dependency - will get ToolManager dynamically

async function run(workflowFilename = null, userInputs = {}) {
  try {
    const filename = workflowFilename || cliParser.getWorkflowFilename();
    console.log(`🚀 Starting workflow execution for: ${filename}`);
    // Log user inputs if provided
    if (Object.keys(userInputs).length > 0) {
      console.log('📥 User inputs provided:', userInputs);
    }
    const workflowData = readWorkflow(filename);
    // Set workflow name in environment for SaveTaskResults
    process.env.WORKFLOW_NAME = workflowData.workflow.name.replace(/\s+/g, '_').toLowerCase();
    // Get global ToolManager dynamically to avoid circular dependency
    const { getToolManager } = require('./server');
    const toolManager = getToolManager();
    if (!toolManager) {
      throw new Error('ToolManager not available. Ensure server is running.');
    }
    const taskManager = new WorkflowManager(toolManager);

    // Execute the workflow with user inputs
    const results = await taskManager.executeWorkflow(workflowData, userInputs);
    //return results;

    //Second workflow --SKIPPING THIS WORKFLOW FOR NOW, MAY COME BACK TO IT.
    //Take the results from the first workflow, which is a list of companies, and use them as the input for a second workflow
    //the output/input includes the name of the firm. We'll need to perform an operation on it so that it includes the name of the firm with each company, like so:
    //[PE firm: American Discovery Capital, portfolio company: American Pain Consortium]
    //A list that includes the firm name and the company name is what will be sent to the second workflow.
    //the second workflow is verify_companies.json
    //This workflow verifies the company is current/active

    //Third workflow -- Get the legal entity names for these companies
    //Take the results from the first workflow output, which is a list of companies, and use them as input for the third workflow
    //the third workflow is get_legal_entities.json
    //1. Parse the companies from the first workflow output stored in "./output" into a "companyNames" array/list. 
    //1a. We always want to take the most recent output file.
    //2. Execute a new workflow: const legal_names = await taskManager.executeWorkflow(getLegalEntitiesWorkflow, companyNames)
    //3. Console.log("Legal names: ", legal_names);
    
  } catch (error) {
    console.error('💥 Workflow execution failed:', error.message);
    throw error;
  }
}

// Export the run function for use in web app
module.exports = { run };

// If called directly from command line, run with no user inputs
if (require.main === module) {
  run().catch(console.error);
}