const fs = require('fs');

/**
 * Utility class for extracting results data from workflow output JSON files
 */
class ResultsExtractor {
  /**
   * Extract results from an output JSON file
   * @param {string} filePath - Path to the JSON output file
   * @returns {Array} Array of results from batchInfo.results
   */
  extractResults(filePath) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Validate structure exists
      if (!data.batchInfo || !data.batchInfo.results) {
        throw new Error('Invalid file structure: missing batchInfo.results');
      }
      
      return this._cleanResults(data.batchInfo.results);
    } catch (error) {
      throw new Error(`Failed to extract results: ${error.message}`);
    }
  }
  
  /**
   * Extract results from parsed JSON data
   * @param {Object} data - Parsed JSON data
   * @returns {Array} Array of results from batchInfo.results
   */
  extractResultsFromData(data) {
    if (!data.batchInfo || !data.batchInfo.results) {
      throw new Error('Invalid data structure: missing batchInfo.results');
    }
    
    return this._cleanResults(data.batchInfo.results);
  }
  
  /**
   * Clean results by removing newline characters and anything after them
   * @param {Array} results - Array of result strings
   * @returns {Array} Cleaned array of result strings
   * @private
   */
  _cleanResults(results) {
    return results.map(result => {
      if (typeof result === 'string') {
        // Find first newline character and remove it and everything after
        const newlineIndex = result.indexOf('\n');
        return newlineIndex !== -1 ? result.substring(0, newlineIndex) : result;
      }
      return result;
    });
  }
}

module.exports = ResultsExtractor;