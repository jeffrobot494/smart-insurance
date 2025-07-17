class ResultsParser {
  /**
   * Parse company names from workflow results
   * @param {Object} workflowResults - Complete workflow results object
   * @returns {Array} - Array of cleaned company names
   */
  parseCompaniesFromResults(workflowResults) {
    try {
      // Extract the final result from batchInfo.results[0]
      const finalResult = workflowResults?.batchInfo?.results?.[0];
      
      if (!finalResult) {
        throw new Error('No final result found in workflow results');
      }

      console.log(`📋 Raw final result: ${finalResult}`);

      // Parse the company list from the final result
      // Expected format: "American Discovery Capital: Company1, Company2, Company3"
      // or just: "Company1, Company2, Company3"
      const companyNames = this.extractCompanyNames(finalResult);

      console.log(`🏢 Parsed ${companyNames.length} companies: ${companyNames.join(', ')}`);
      
      return companyNames;

    } catch (error) {
      console.error(`❌ Error parsing companies from results: ${error.message}`);
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

    console.log('🔍 Extracting companies from text:', text.substring(0, 100) + '...');
    
    // Expected format: "PE Firm Name: [company list]"
    // Find the colon and extract everything after it (throw away PE firm name)
    const colonIndex = text.indexOf(':');
    if (colonIndex === -1) {
      console.warn('⚠️ No colon found in text - expected format: "PE Firm Name: [companies]"');
      return [];
    }
    
    // Extract PE firm name (for logging purposes)
    const firmName = text.substring(0, colonIndex).trim();
    console.log(`🏢 PE Firm detected: "${firmName}" (discarding this)`);
    
    // Get everything after the colon (the company list)
    const companiesText = text.substring(colonIndex + 1).trim();
    console.log('📋 Company list text:', companiesText.substring(0, 100) + '...');

    // Check if companies are separated by newlines with bullet points
    if (companiesText.includes('\n-') || companiesText.includes('\n•') || companiesText.includes('\n*')) {
      console.log('📝 Using newline/bullet point parsing');
      // Split by newlines and process each line
      const companies = companiesText
        .split('\n')
        .map(line => this.cleanCompanyName(line))
        .filter(company => company.length > 0); // Remove empty strings
      
      return companies;
    } else {
      console.log('📝 Using comma-separated parsing');
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
        console.log(`📋 Processing batch item ${index + 1}: ${result}`);
        return this.extractCompanyNames(result);
      });

    } catch (error) {
      console.error(`❌ Error parsing batch companies: ${error.message}`);
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
      console.warn('⚠️ No companies found in results');
      return false;
    }

    // Check for suspiciously long "company names" (might be error text)
    const suspiciousCompanies = companies.filter(company => company.length > 100);
    if (suspiciousCompanies.length > 0) {
      console.warn('⚠️ Found suspiciously long company names (might be error text)');
      console.warn('Suspicious entries:', suspiciousCompanies);
    }

    // Check for very short names (might be parsing errors)
    const shortCompanies = companies.filter(company => company.length < 3);
    if (shortCompanies.length > 0) {
      console.warn('⚠️ Found very short company names (might be parsing errors)');
      console.warn('Short entries:', shortCompanies);
    }

    return true;
  }
}

module.exports = ResultsParser;