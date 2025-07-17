const fs = require('fs');
const path = require('path');

class SaveTaskResults {
  constructor() {
    // Store output directory, filename will be generated at save time
    this.outputDir = process.env.WORKFLOW_OUTPUT_DIR || path.join(__dirname, '..', 'json', 'output');
    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  saveBatchResults(batchResults) {
    try {
      // Generate filename at save time using current workflow name
      const workflowName = process.env.WORKFLOW_NAME || 'workflow';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const jsonFilePath = path.join(this.outputDir, `${workflowName}_results_${timestamp}.json`);
      
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
          workflowName: workflowName,
          results: finalResults  // Array of final results
        },
        items: batchResults
      };
      
      // Write batch results to file
      fs.writeFileSync(jsonFilePath, JSON.stringify(batchData, null, 2));
      
      console.log(`💾 Batch results for ${batchResults.length} items saved to: ${path.basename(jsonFilePath)}`);
      
    } catch (error) {
      console.error(`❌ Failed to save batch results:`, error.message);
      throw error;
    }
  }
}

module.exports = SaveTaskResults;