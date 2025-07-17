const fs = require('fs');
const path = require('path');

class OutputFileManager {
  /**
   * Find the most recent output file in the specified directory
   * @param {string} outputDir - Directory to search for output files
   * @returns {string} - Full path to the most recent output file
   */
  getMostRecentOutputFile(outputDir) {
    try {
      // Ensure the directory exists
      if (!fs.existsSync(outputDir)) {
        throw new Error(`Output directory does not exist: ${outputDir}`);
      }

      // Read all files in the directory
      const files = fs.readdirSync(outputDir);
      
      // Filter for JSON files with timestamp pattern (workflow_results_timestamp.json)
      const outputFiles = files.filter(file => 
        file.endsWith('.json') && file.includes('_results_')
      );

      if (outputFiles.length === 0) {
        throw new Error(`No output files found in: ${outputDir}`);
      }

      // Sort files by timestamp (most recent first)
      // Files have format: workflowname_results_2025-07-15T22-30-33.json
      const sortedFiles = outputFiles.sort((a, b) => {
        // Extract timestamp from filename
        const timestampA = this.extractTimestamp(a);
        const timestampB = this.extractTimestamp(b);
        return new Date(timestampB) - new Date(timestampA); // Descending order (newest first)
      });

      const mostRecentFile = sortedFiles[0];
      const fullPath = path.join(outputDir, mostRecentFile);
      
      console.log(`📁 Found most recent output file: ${mostRecentFile}`);
      return fullPath;

    } catch (error) {
      console.error(`❌ Error finding most recent output file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract timestamp from output filename
   * @param {string} filename - Output filename with timestamp
   * @returns {string} - ISO timestamp string
   */
  extractTimestamp(filename) {
    // Extract timestamp from filename like: pe_research_results_2025-07-15T22-30-33.json
    const match = filename.match(/_results_(.+)\.json$/);
    if (match) {
      // Convert back to ISO format (replace hyphens with colons in time part)
      const timestamp = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
      return timestamp;
    }
    return '';
  }

  /**
   * Get all output files sorted by timestamp (newest first)
   * @param {string} outputDir - Directory to search
   * @returns {Array} - Array of file paths sorted by timestamp
   */
  getAllOutputFiles(outputDir) {
    try {
      const files = fs.readdirSync(outputDir);
      const outputFiles = files.filter(file => 
        file.endsWith('.json') && file.includes('_results_')
      );

      return outputFiles
        .sort((a, b) => {
          const timestampA = this.extractTimestamp(a);
          const timestampB = this.extractTimestamp(b);
          return new Date(timestampB) - new Date(timestampA);
        })
        .map(file => path.join(outputDir, file));

    } catch (error) {
      console.error(`❌ Error getting output files: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OutputFileManager;