// server/utils/WorkflowResultsParser.js
const { manager: logger } = require('./logger');

class WorkflowResultsParser {

  /**
   * Helper function to format city/state names (capitalize first letter, lowercase rest)
   * @param {string} text - Text to format
   * @returns {string} Properly formatted text
   */
  static formatLocationText(text) {
    if (!text || typeof text !== 'string') return text;
    return text.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  /**
   * Parse workflow results using the standardized result objects
   * @param {Array|Object} results - Results from WorkflowManager.executeWorkflow()
   * @returns {Array} Array of company objects
   */
  static parseResults(results) {
    // Handle both single result and array of results
    const resultsArray = Array.isArray(results) ? results : [results];
    
    if (!resultsArray || resultsArray.length === 0) {
      throw new Error('Invalid results: expected non-empty array or object');
    }

    // Use workflow_name from the result object instead of guessing
    const firstResult = resultsArray[0];
    const workflowName = firstResult.workflow_name;
    
    if (!workflowName) {
      throw new Error('Invalid result format: missing workflow_name field');
    }

    switch (workflowName) {
      case 'PE firm research':
        return this.parseResearchResults(resultsArray);
      case 'Portfolio Company Verification and Form 5500 Matching':
        return this.parseLegalResolutionResults(resultsArray);
      default:
        throw new Error(`Unsupported workflow: ${workflowName}`);
    }
  }

  /**
   * Parse PE firm research workflow results
   * @param {Array} results - Standardized workflow results
   * @returns {Array} Array of company objects with name field
   */
  static parseResearchResults(results) {
    const companyObjects = [];
    
    for (const result of results) {
      try {
        // Use the output field directly - no more task navigation!
        const output = result.output;
        if (!output) {
          logger.warn('Research result missing output field:', result);
          continue;
        }
        
        // Parse JSON output from workflow - extract JSON from mixed text/JSON output
        const jsonMatch = output.match(/\{.*\}/s);
        if (!jsonMatch) {
          logger.warn('No JSON found in research output:', output);
          continue;
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Extract companies array from standardized format
        const companyNames = parsed.companies || [];
        if (companyNames.length === 0) {
          logger.warn('No companies found in research output:', parsed);
          continue;
        }
        
        // Convert company names to company objects
        for (const name of companyNames) {
          if (name && typeof name === 'string' && name.trim().length > 0) {
            companyObjects.push({ name: name.trim() });
          }
        }
      } catch (error) {
        logger.error('Failed to parse research result:', error.message);
        logger.debug('Problematic result:', result);
      }
    }
    
    // Remove duplicates based on company name
    const uniqueCompanies = companyObjects.filter((company, index, arr) => 
      arr.findIndex(c => c.name === company.name) === index
    );
    
    return uniqueCompanies;
  }

  /**
   * Parse legal entity resolution workflow results  
   * @param {Array} results - Standardized workflow results
   * @returns {Array} Array of enriched company objects {name, legal_entity_name, city, state, exited}
   */
  static parseLegalResolutionResults(results) {
    const companyObjects = [];
    
    for (const result of results) {
      try {
        // Use the output field directly - no more complex task navigation!
        const output = result.output;
        if (!output) {
          logger.warn('Legal resolution result missing output field:', result);
          continue;
        }
        
        // Parse JSON output from workflow - extract JSON from mixed text/JSON output
        const jsonMatch = output.match(/\{.*\}/s);
        if (!jsonMatch) {
          logger.warn('No JSON found in legal resolution output:', output);
          continue;
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Extract company information and create enriched company object
        const companyObject = this.extractCompanyObject(parsed, result.input);
        if (companyObject) {
          companyObjects.push(companyObject);
        }
      } catch (error) {
        logger.error('Failed to parse legal resolution result:', error.message);
        logger.debug('Problematic result:', result);
      }
    }
    
    return companyObjects;
  }

  /**
   * Extract company object from parsed legal entity result
   * @param {Object} parsed - Parsed output result
   * @param {string} originalInput - Original input to extract company name from
   * @returns {Object|null} Company object or null if invalid
   */
  static extractCompanyObject(parsed, originalInput) {
    // Extract original company name from input like "Firm: ADC, Company: DataLink Service Fund Solutions"
    const companyNameMatch = originalInput.match(/Company:\s*(.+)/);
    const originalCompanyName = companyNameMatch ? companyNameMatch[1].trim() : null;
    
    if (!originalCompanyName) {
      logger.warn('Could not extract company name from input:', originalInput);
      return null;
    }
    
    let companyObject = {
      name: originalCompanyName,
      legal_entity_name: null,
      city: null,
      state: null,
      exited: false,
      form5500_match: null // ✅ Add this field to preserve form5500_match data
    };
    
    // Extract legal entity data from standardized format
    if (parsed.form5500_match) {
      logger.info(`📋 Found form5500_match for ${originalCompanyName}:`);
      logger.info(`   match_type: ${parsed.form5500_match.match_type}`);
      logger.info(`   legal_name: ${parsed.form5500_match.legal_name}`);
      logger.info(`   ein: ${parsed.form5500_match.ein}`);
      
      // ✅ Preserve the entire form5500_match object
      companyObject.form5500_match = parsed.form5500_match;
      
      companyObject.legal_entity_name = parsed.form5500_match.legal_name;
      logger.info(`   Setting legal_entity_name to: ${companyObject.legal_entity_name}`);
      
      // Handle nested location structure
      if (parsed.form5500_match.location) {
        companyObject.city = this.formatLocationText(parsed.form5500_match.location.city);
        companyObject.state = this.formatLocationText(parsed.form5500_match.location.state);
      } else if (parsed.headquarters_location) {
        // Fallback to headquarters_location if form5500_match.location not available
        companyObject.city = this.formatLocationText(parsed.headquarters_location.city);
        companyObject.state = this.formatLocationText(parsed.headquarters_location.state);
      }
    }
    
    // Extract exited flag from portfolio verification step
    if (parsed.portfolio_verification && typeof parsed.portfolio_verification.exited === 'boolean') {
      companyObject.exited = parsed.portfolio_verification.exited;
    }
    
    // Extract annual revenue data from revenue research step
    if (parsed.revenue_research) {
      companyObject.annual_revenue_usd = parsed.revenue_research.annual_revenue_usd;
      companyObject.revenue_year = parsed.revenue_research.revenue_year;
      companyObject.revenue_research_confidence = parsed.revenue_research.research_confidence;
    }
    
    // Use original company name as fallback ONLY if no form5500_match data exists
    // Do NOT override null legal_entity_name for companies with explicit no-match results
    logger.info(`🔧 Fallback logic check for ${originalCompanyName}:`);
    logger.info(`   legal_entity_name: ${companyObject.legal_entity_name}`);
    logger.info(`   has form5500_match: ${!!companyObject.form5500_match}`);
    
    if ((!companyObject.legal_entity_name || companyObject.legal_entity_name.trim().length === 0) && 
        !companyObject.form5500_match) {
      logger.info(`   Applying fallback: setting legal_entity_name to ${originalCompanyName}`);
      companyObject.legal_entity_name = originalCompanyName;
    } else {
      logger.info(`   No fallback applied`);
    }
    
    // Clean up the data
    companyObject.legal_entity_name = companyObject.legal_entity_name ? companyObject.legal_entity_name.trim() : null;
    companyObject.city = companyObject.city ? companyObject.city.trim() : null;
    companyObject.state = companyObject.state ? companyObject.state.trim() : null;
    
    return companyObject;
  }

  /**
   * Validate parsed results
   * @param {*} results - Results to validate
   * @param {string} workflowName - Expected workflow name
   * @returns {boolean} True if valid
   */
  static validateResults(results, workflowName) {
    if (!Array.isArray(results)) {
      return false;
    }
    
    if (workflowName === 'PE firm research') {
      return results.every(item => 
        item && typeof item === 'object' && 
        typeof item.name === 'string'
      );
    } else if (workflowName === 'Portfolio Company Verification and Form 5500 Matching') {
      return results.every(item => 
        item && typeof item === 'object' && 
        typeof item.name === 'string' &&
        typeof item.legal_entity_name === 'string'
      );
    }
    
    return false;
  }
}

module.exports = WorkflowResultsParser;