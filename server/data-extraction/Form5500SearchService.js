const DatabaseManager = require('./DatabaseManager');

/**
 * Service for searching company names in Form 5500 datasets using database
 */
class Form5500SearchService {
  constructor() {
    this.databaseManager = new DatabaseManager();
  }

  /**
   * Search for companies in Form 5500 datasets using database
   * @param {Array} companyNames - Array of company names to search for
   * @returns {Array} Array of search results
   */
  async searchCompanies(companyNames) {
    const results = [];

    console.log('📊 STEP 1: Searching company names in Form 5500 data');
    console.log('='.repeat(50));

    // Initialize database connection
    await this.databaseManager.initialize();

    for (let i = 0; i < companyNames.length; i++) {
      const companyName = companyNames[i];
      console.log(`[${i + 1}/${companyNames.length}] Researching: ${companyName}`);

      const result = await this.searchSingleCompany(companyName);
      results.push(result);

      console.log(`   ✓ Found ${result.years.length} year(s) of data`);
    }

    return results;
  }

  /**
   * Search for a single company using database
   * @param {string} companyName - Company name to search for
   * @returns {Object} Search result for the company
   */
  async searchSingleCompany(companyName) {
    const result = {
      company: companyName,
      ein: null,
      years: [],
      recordCount: 0,
      records: {}
    };

    try {
      // Get all matching records from database
      const dbRecords = await this.databaseManager.searchCompaniesByName(companyName);
      
      if (dbRecords.length > 0) {
        // Group records by year
        const recordsByYear = {};
        
        for (const record of dbRecords) {
          const year = record.year || 'unknown';
          
          if (!recordsByYear[year]) {
            recordsByYear[year] = [];
          }
          
          recordsByYear[year].push(record);
          
          // Extract EIN from first record if we don't have one yet
          if (!result.ein) {
            result.ein = this.extractEINFromRecord(record);
          }
        }
        
        // Populate result structure
        result.years = Object.keys(recordsByYear).sort();
        result.recordCount = dbRecords.length;
        result.records = recordsByYear;
      }

    } catch (error) {
      console.log(`   ✗ Error searching database for "${companyName}": ${error.message}`);
    }

    return result;
  }


  /**
   * Extract EIN from a database record
   * @param {Object} record - Database record object
   * @returns {string|null} EIN or null if not found
   */
  extractEINFromRecord(record) {
    // Common EIN field names in Form 5500 database records
    const einFields = ['sponsor_ein', 'ein', 'plan_ein', 'SPONSOR_EIN', 'EIN', 'PLAN_EIN'];
    
    for (const field of einFields) {
      if (record[field]) {
        // Clean EIN (remove non-digits)
        const cleanEIN = record[field].toString().replace(/\D/g, '');
        if (cleanEIN.length === 9) {
          return cleanEIN;
        }
      }
    }

    return null;
  }

  /**
   * Extract all EINs from search results
   * @param {Array} searchResults - Array of search results
   * @returns {Array} Array of companies with valid EINs
   */
  extractEINs(searchResults) {
    const companiesWithEIN = searchResults.filter(result => 
      result.ein && result.ein !== 'ERROR' && result.ein !== 'Not Found'
    );

    console.log(`📊 Found ${companiesWithEIN.length} companies with valid EINs`);
    
    return companiesWithEIN;
  }
}

module.exports = Form5500SearchService;