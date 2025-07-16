const fs = require('fs');
const path = require('path');

function readWorkflow(filename = 'workflow.json') {
  try {
    const workflowPath = path.join(__dirname, '..', 'json', filename);
    const fileContent = fs.readFileSync(workflowPath, 'utf8');
    const workflow = JSON.parse(fileContent);
    return workflow;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Workflow file not found at ./json/${filename}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in workflow file: ${error.message}`);
    } else {
      throw new Error(`Error reading workflow file: ${error.message}`);
    }
  }
}

module.exports = { readWorkflow };