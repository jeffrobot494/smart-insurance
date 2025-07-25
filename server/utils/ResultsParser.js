const { parsing: logger } = require('./logger');

class ResultsParser {
  /**
   * Parse company names from workflow results with firm name prepended
   * @param {Object} workflowResults - Complete workflow results object
   * @returns {Array} - Array of cleaned company names with firm name prepended
   */
  parseCompaniesFromResults(workflowResults) {
    try {
      // Extract the final result from batchInfo.results[0]
      const finalResult = workflowResults?.batchInfo?.results?.[0];
      
      if (!finalResult) {
        throw new Error('No final result found in workflow results');
      }

      logger.debug(`📋 Raw final result: ${finalResult}`);

      // Extract firm name and company names
      const firmName = this.parseFirmNameFromResults(workflowResults);
      const companyNames = this.extractCompanyNames(finalResult);

      // Prepend firm name to each company
      const companiesWithFirm = companyNames.map(company => `${firmName}, ${company}`);

      logger.debug(`🏢 Parsed ${companiesWithFirm.length} companies with firm name: ${companiesWithFirm.join('; ')}`);
      
      return companiesWithFirm;

    } catch (error) {
      logger.error(`❌ Error parsing companies from results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse firm name from workflow results
   * @param {Object} workflowResults - Complete workflow results object
   * @returns {string} - The firm name
   */
  parseFirmNameFromResults(workflowResults) {
    try {
      // Extract the final result from batchInfo.results[0]
      const finalResult = workflowResults?.batchInfo?.results?.[0];
      
      if (!finalResult) {
        throw new Error('No final result found in workflow results');
      }

      // Expected format: "PE Firm Name: [company list]"
      const colonIndex = finalResult.indexOf(':');
      if (colonIndex === -1) {
        throw new Error('No colon found in result - expected format: "PE Firm Name: [companies]"');
      }
      
      const firmName = finalResult.substring(0, colonIndex).trim();
      logger.debug(`🏢 Extracted firm name: "${firmName}"`);
      
      return firmName;

    } catch (error) {
      logger.error(`❌ Error parsing firm name from results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract and clean company names from a text string
   * Expected format: "PE Firm Name: Company1, Company2, Company3"
   * OR format: "PE Firm Name:\n- Company1\n- Company2\n- Company3"
   * @param {string} text - Text containing company names
   * @returns {Array} - Array of cleaned company names
   */
  extractCompanyNames(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    logger.debug('🔍 Extracting companies from text:', text.substring(0, 100) + '...');
    
    // Expected format: "PE Firm Name: [company list]"
    // Find the colon and extract everything after it (throw away PE firm name)
    const colonIndex = text.indexOf(':');
    if (colonIndex === -1) {
      logger.warn('⚠️ No colon found in text - expected format: "PE Firm Name: [companies]"');
      return [];
    }
    
    // Extract PE firm name (for logging purposes)
    const firmName = text.substring(0, colonIndex).trim();
    logger.debug(`🏢 PE Firm detected: "${firmName}" (discarding this)`);
    
    // Get everything after the colon (the company list)
    const companiesText = text.substring(colonIndex + 1).trim();
    logger.debug('📋 Company list text:', companiesText.substring(0, 100) + '...');

    // Check if companies are separated by newlines with bullet points
    if (companiesText.includes('\n-') || companiesText.includes('\n•') || companiesText.includes('\n*')) {
      logger.debug('📝 Using newline/bullet point parsing');
      // Split by newlines and process each line
      const companies = companiesText
        .split('\n')
        .map(line => this.cleanCompanyName(line))
        .filter(company => company.length > 0); // Remove empty strings
      
      return companies;
    } else {
      logger.debug('📝 Using comma-separated parsing');
      // Split by commas and clean each company name
      const companies = companiesText
        .split(',')
        .map(company => this.cleanCompanyName(company))
        .filter(company => company.length > 0); // Remove empty strings

      return companies;
    }
  }

  /**
   * Clean and normalize a single company name
   * @param {string} companyName - Raw company name
   * @returns {string} - Cleaned company name
   */
  cleanCompanyName(companyName) {
    if (!companyName || typeof companyName !== 'string') {
      return '';
    }

    return companyName
      .trim() // Remove leading/trailing whitespace
      .replace(/^[-•*]\s*/, '') // Remove bullet points
      .replace(/^\d+\.\s*/, '') // Remove numbered list markers
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim(); // Final trim
  }

  /**
   * Parse companies from multiple workflow items (batch processing)
   * @param {Object} workflowResults - Complete workflow results object
   * @returns {Array} - Array of arrays, each containing company names for each input
   */
  parseCompaniesFromBatchResults(workflowResults) {
    try {
      const results = workflowResults?.batchInfo?.results;
      
      if (!results || !Array.isArray(results)) {
        throw new Error('No batch results found in workflow results');
      }

      return results.map((result, index) => {
        logger.debug(`📋 Processing batch item ${index + 1}: ${result}`);
        return this.extractCompanyNames(result);
      });

    } catch (error) {
      logger.error(`❌ Error parsing batch companies: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate that parsed companies look reasonable
   * @param {Array} companies - Array of company names
   * @returns {boolean} - True if companies look valid
   */
  validateCompanies(companies) {
    if (!Array.isArray(companies) || companies.length === 0) {
      logger.warn('⚠️ No companies found in results');
      return false;
    }

    // Check for suspiciously long "company names" (might be error text)
    const suspiciousCompanies = companies.filter(company => company.length > 100);
    if (suspiciousCompanies.length > 0) {
      logger.warn('⚠️ Found suspiciously long company names (might be error text)');
      logger.warn('Suspicious entries:', suspiciousCompanies);
    }

    // Check for very short names (might be parsing errors)
    const shortCompanies = companies.filter(company => company.length < 3);
    if (shortCompanies.length > 0) {
      logger.warn('⚠️ Found very short company names (might be parsing errors)');
      logger.warn('Short entries:', shortCompanies);
    }

    return true;
  }
}

module.exports = ResultsParser;