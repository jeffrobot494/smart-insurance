// Load environment variables from .env file
require('./load-env');

const path = require('path');
const { readWorkflow } = require('./workflowReader');
const WorkflowTaskManager = require('./workflowTaskManager');
const SaveTaskResults = require('./SaveTaskResults');

async function run() {
  try {
    // Get workflow filename from command line argument
    const workflowFilename = process.argv[2];
    
    if (!workflowFilename) {
      console.error('❌ Please specify a workflow filename');
      console.log('Usage: node Manager.js <workflow-filename>');
      console.log('Example: node Manager.js workflow.json');
      process.exit(1);
    }
    
    console.log(`🚀 Starting workflow execution for: ${workflowFilename}`);
    
    const workflowData = readWorkflow(workflowFilename);
    
    // Set workflow name in environment for SaveTaskResults
    process.env.WORKFLOW_NAME = workflowData.workflow.name.replace(/\s+/g, '_').toLowerCase();
    
    const taskManager = new WorkflowTaskManager(workflowData);
    
    // Execute the workflow
    const results = await taskManager.executeWorkflow();
    
  } catch (error) {
    console.error('💥 Workflow execution failed:', error.message);
  }
}

run().catch(console.error);