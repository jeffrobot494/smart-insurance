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
    const cliParser = new CLIInputParser();
    
    // Get workflow filename from parameter or command line argument
    const filename = workflowFilename || cliParser.getWorkflowFilename();
    
    // If called from command line, parse additional arguments as user inputs
    if (!workflowFilename && Object.keys(userInputs).length === 0) {
      userInputs = cliParser.parseUserInputs();
    }
    
    if (!filename) {
      cliParser.showUsage();
      process.exit(1);
    }
    
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
    
    const taskManager = new WorkflowManager(workflowData, toolManager);
    
    // Execute the workflow with user inputs
    const results = await taskManager.executeWorkflow(userInputs);
    
    return results;
    
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