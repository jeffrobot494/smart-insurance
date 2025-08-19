const { manager: logger } = require('./logger');

/**
 * Utility class for filtering portfolio company results based on business criteria
 */
class PortfolioCompanyFilter {
  
  /**
   * Filter portfolio company results to remove inactive companies and those with <100 employees
   * @param {Array} entityResults - Array of workflow results from legal entity resolution
   * @returns {Array} Filtered results containing only active companies with >=100 employees
   */
  static filterValidCompanies(entityResults) {
    logger.info(`🔍 Starting portfolio company filtering for ${entityResults.length} results`);
    
    // Debug: Log structure of first result
    if (entityResults.length > 0) {
      const firstResult = entityResults[0];
      logger.debug(`📋 First result structure: keys = [${Object.keys(firstResult).join(', ')}]`);
      if (firstResult.tasks) {
        const taskIds = Object.keys(firstResult.tasks);
        logger.debug(`📋 Task IDs found: [${taskIds.join(', ')}]`);
      }
    }
    
    let filteredResults = [...entityResults];
    const initialCount = filteredResults.length;
    
    // Track filtering statistics
    let removedInactive = 0;
    
    // Filter out inactive portfolio companies
    filteredResults = filteredResults.filter(result => {
      const isActive = this.isActivePortfolioCompany(result);
      if (!isActive) {
        removedInactive++;
        const companyName = this.extractCompanyName(result);
        logger.debug(`❌ Filtered out inactive company: ${companyName}`);
      }
      return isActive;
    });
    /*
    // Filter out companies with less than 100 employees
    filteredResults = filteredResults.filter(result => {
      const hasEnoughEmployees = this.hasMinimumEmployeeCount(result);
      if (!hasEnoughEmployees) {
        removedSmallCompanies++;
        const companyName = this.extractCompanyName(result);
        logger.debug(`❌ Filtered out small company (<100 employees): ${companyName}`);
      }
      return hasEnoughEmployees;
    });
    */
    // Log filtering summary
    logger.info(`📊 Portfolio company filtering complete:`);
    logger.info(`   Initial companies: ${initialCount}`);
    logger.info(`   Removed inactive: ${removedInactive}`);
    logger.info(`   Final companies: ${filteredResults.length}`);
    
    return filteredResults;
  }
  
  /**
   * Check if a portfolio company is currently active
   * @param {Object} result - Workflow result object
   * @returns {boolean} True if company is active, false otherwise
   */
  static isActivePortfolioCompany(result) {
    try {
      const output = this.extractOutput(result);
      if (!output || !output.portfolio_verification) {
        logger.debug('⚠️ Missing portfolio_verification data, treating as inactive');
        return false;
      }
      
      const hasExited = output.portfolio_verification.exited;
      return hasExited !== true;
      
    } catch (error) {
      logger.debug(`⚠️ Error checking portfolio status: ${error.message}, treating as inactive`);
      return false;
    }
  }
  
  /**
   * Check if a company has at least 100 employees
   * @param {Object} result - Workflow result object
   * @returns {boolean} True if company has >=100 employees, false otherwise
   */
  static hasMinimumEmployeeCount(result) {
    try {
      const output = this.extractOutput(result);
      if (!output || !output.employee_count_assessment) {
        logger.debug('⚠️ Missing employee_count_assessment data, treating as small company');
        return false;
      }
      
      const likelyUnder100 = output.employee_count_assessment.likely_under_100_employees;
      return likelyUnder100 !== true;
      
    } catch (error) {
      logger.debug(`⚠️ Error checking employee count: ${error.message}, treating as small company`);
      return false;
    }
  }
  
  /**
   * Extract the output object from a workflow result
   * @param {Object} result - Workflow result object
   * @returns {Object|null} Output object or null if not found
   */
  static extractOutput(result) {
    try {
      // Handle different possible result structures
      if (result.output) {
        logger.debug(`📋 Found result.output directly`);
        return result.output;
      }
      
      if (result.tasks) {
        // Find the final task result
        const taskIds = Object.keys(result.tasks).map(id => parseInt(id));
        const finalTaskId = Math.max(...taskIds);
        const finalTask = result.tasks[finalTaskId];
        
        logger.debug(`📋 Using final task ${finalTaskId}, result type: ${typeof finalTask?.result}`);
        
        if (finalTask && finalTask.result) {
          // Try to parse if it's a string
          if (typeof finalTask.result === 'string') {
            try {
              const parsed = JSON.parse(finalTask.result);
              logger.debug(`📋 Parsed JSON successfully, has portfolio_verification: ${!!parsed.portfolio_verification}`);
              return parsed;
            } catch {
              logger.debug(`📋 Failed to parse JSON from string result`);
              return null;
            }
          }
          return finalTask.result;
        }
      }
      
      logger.debug(`📋 No valid output structure found`);
      return null;
    } catch (error) {
      logger.debug(`⚠️ Error extracting output: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Extract company name for logging purposes
   * @param {Object} result - Workflow result object
   * @returns {string} Company name or 'Unknown'
   */
  static extractCompanyName(result) {
    try {
      const output = this.extractOutput(result);
      return output?.company_name || result.input || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }
  
  /**
   * Get filtering statistics from a set of results
   * @param {Array} originalResults - Original unfiltered results
   * @returns {Object} Statistics about filtering criteria
   */
  static getFilteringStats(originalResults) {
    const stats = {
      total: originalResults.length,
      active: 0,
      inactive: 0,
      largeCompanies: 0,
      smallCompanies: 0,
      missingData: 0
    };
    
    originalResults.forEach(result => {
      const isActive = this.isActivePortfolioCompany(result);
      const hasEnoughEmployees = this.hasMinimumEmployeeCount(result);
      const output = this.extractOutput(result);
      
      if (!output) {
        stats.missingData++;
        return;
      }
      
      if (isActive) {
        stats.active++;
      } else {
        stats.inactive++;
      }
      
      if (hasEnoughEmployees) {
        stats.largeCompanies++;
      } else {
        stats.smallCompanies++;
      }
    });
    
    return stats;
  }
}

module.exports = PortfolioCompanyFilter;