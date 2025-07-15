const fs = require('fs');
const path = require('path');

class SaveTaskResults {
  constructor() {
    // Load JSON file path from environment variable
    const outputDir = process.env.WORKFLOW_OUTPUT_DIR || path.join(__dirname, 'json', 'output');
    const workflowName = process.env.WORKFLOW_NAME || 'workflow';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    this.jsonFilePath = path.join(outputDir, `${workflowName}_results_${timestamp}.json`);
    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    const dir = path.dirname(this.jsonFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  saveTaskResults(taskId, results) {
    try {
      let existingData = {};
      
      // Read existing file if it exists
      if (fs.existsSync(this.jsonFilePath)) {
        const fileContent = fs.readFileSync(this.jsonFilePath, 'utf8');
        existingData = JSON.parse(fileContent);
      }
      
      // Initialize structure if needed
      if (!existingData.tasks) {
        existingData.tasks = {};
      }
      
      // Add/update task results
      existingData.tasks[taskId] = {
        ...results,
        savedAt: new Date().toISOString()
      };
      
      // Write back to file
      fs.writeFileSync(this.jsonFilePath, JSON.stringify(existingData, null, 2));
      
      console.log(`💾 Task ${taskId} results saved to: ${path.basename(this.jsonFilePath)}`);
      
    } catch (error) {
      console.error(`❌ Failed to save task ${taskId} results:`, error.message);
      throw error;
    }
  }
}

module.exports = SaveTaskResults;