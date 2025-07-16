const fs = require('fs');
const path = require('path');

class SaveTaskResults {
  constructor() {
    // Load JSON file path from environment variable
    const outputDir = process.env.WORKFLOW_OUTPUT_DIR || path.join(__dirname, '..', 'json', 'output');
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

  saveBatchResults(batchResults) {
    try {
      // Extract final results from all items
      const finalResults = [];
      for (const item of batchResults) {
        const taskIds = Object.keys(item.tasks).map(id => parseInt(id));
        const finalTaskId = Math.max(...taskIds);
        const finalTask = item.tasks[finalTaskId];
        finalResults.push(finalTask?.result || null);
      }
      
      const batchData = {
        batchInfo: {
          totalItems: batchResults.length,
          startedAt: new Date().toISOString(),
          workflowName: process.env.WORKFLOW_NAME,
          results: finalResults  // Array of final results
        },
        items: batchResults
      };
      
      // Write batch results to file
      fs.writeFileSync(this.jsonFilePath, JSON.stringify(batchData, null, 2));
      
      console.log(`💾 Batch results for ${batchResults.length} items saved to: ${path.basename(this.jsonFilePath)}`);
      
    } catch (error) {
      console.error(`❌ Failed to save batch results:`, error.message);
      throw error;
    }
  }
}

module.exports = SaveTaskResults;