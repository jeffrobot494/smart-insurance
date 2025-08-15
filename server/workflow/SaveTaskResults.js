const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../data-extraction/DatabaseManager');

class SaveTaskResults {
  constructor() {
    // Store output directory, filename will be generated at save time
    this.outputDir = process.env.WORKFLOW_OUTPUT_DIR || path.join(__dirname, '..', 'json', 'output');
    this.ensureDirectoryExists();
    this.databaseManager = DatabaseManager.getInstance();
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async saveBatchResults(batchResults) {
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
      
      // Save portfolio companies to database if this is a PE research workflow
      await this.savePortfolioCompaniesToDatabase(batchResults, finalResults);
      
    } catch (error) {
      console.error(`❌ Failed to save batch results:`, error.message);
      throw error;
    }
  }

  /**
   * Save portfolio companies to database
   * @param {Array} batchResults - Array of workflow results
   * @param {Array} finalResults - Array of final result strings
   */
  async savePortfolioCompaniesToDatabase(batchResults, finalResults) {
    try {
      // Only process if this looks like PE research workflow results
      for (let i = 0; i < finalResults.length; i++) {
        const result = finalResults[i];
        const workflowExecutionId = batchResults[i]?.workflowExecutionId;
        
        // Check if result looks like PE firm portfolio format: JSON object with firm and companies
        if (result && typeof result === 'string' && workflowExecutionId) {
          try {
            // Try to parse as JSON first
            const portfolioData = JSON.parse(result);
            if (portfolioData.firm && portfolioData.companies && Array.isArray(portfolioData.companies)) {
              const firmName = portfolioData.firm;
              const companies = portfolioData.companies.filter(c => c && c.trim().length > 0);
              
              // Save each portfolio company to database
              await this.databaseManager.savePortfolioCompanies(workflowExecutionId, firmName, companies);
              
              console.log(`💾 Saved ${companies.length} portfolio companies for ${firmName} to database`);
            }
          } catch (parseError) {
            // Fallback to old string format for backward compatibility
            if (result.includes(':')) {
              const parts = result.split(':');
              if (parts.length >= 2) {
                const firmName = parts[0].trim();
                const companiesStr = parts.slice(1).join(':').trim(); // Handle case where company names have colons
                const companies = companiesStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
                
                // Save each portfolio company to database
                await this.databaseManager.savePortfolioCompanies(workflowExecutionId, firmName, companies);
                
                console.log(`💾 Saved ${companies.length} portfolio companies for ${firmName} to database (legacy format)`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to save portfolio companies to database:', error.message);
      // Don't throw - this shouldn't break the workflow
    }
  }
}

module.exports = SaveTaskResults;