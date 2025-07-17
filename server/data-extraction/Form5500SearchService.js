const CSVParser = require('./CSVParser');

/**
 * Service for searching company names in Form 5500 datasets
 */
class Form5500SearchService {
  constructor() {
    this.csvParser = new CSVParser();
  }

  /**
   * Search for companies in Form 5500 datasets
   * @param {Array} datasets - Array of Form 5500 datasets
   * @param {Array} companyNames - Array of company names to search for
   * @returns {Array} Array of search results
   */
  searchCompanies(datasets, companyNames) {
    const results = [];

    console.log('📊 STEP 1: Searching company names in Form 5500 data');
    console.log('='.repeat(50));

    for (let i = 0; i < companyNames.length; i++) {
      const companyName = companyNames[i];
      console.log(`[${i + 1}/${companyNames.length}] Researching: ${companyName}`);

      const result = this.searchSingleCompany(datasets, companyName);
      results.push(result);

      console.log(`   ✓ Found ${result.years.length} year(s) of data`);
    }

    return results;
  }

  /**
   * Search for a single company across all datasets
   * @param {Array} datasets - Array of Form 5500 datasets
   * @param {string} companyName - Company name to search for
   * @returns {Object} Search result for the company
   */
  searchSingleCompany(datasets, companyName) {
    const result = {
      company: companyName,
      ein: null,
      years: [],
      recordCount: 0,
      records: {}
    };

    const searchLower = companyName.toLowerCase();

    for (const dataset of datasets) {
      try {
        const datasetResult = this.searchDataset(dataset, searchLower, companyName);
        
        if (datasetResult.foundRecords > 0) {
          result.years.push(dataset.year);
          result.recordCount += datasetResult.foundRecords;
          result.records[dataset.year] = datasetResult.records;
          
          // Extract EIN from the first record if we don't have one yet
          if (!result.ein && datasetResult.records.length > 0) {
            result.ein = this.extractEIN(datasetResult.records[0]);
          }
        }

      } catch (error) {
        console.log(`   ✗ Error searching ${dataset.year} dataset: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Search a single dataset for a company
   * @param {Object} dataset - Dataset object
   * @param {string} searchLower - Lowercase company name to search for
   * @param {string} originalCompanyName - Original company name for logging
   * @returns {Object} Dataset search result
   */
  searchDataset(dataset, searchLower, originalCompanyName) {
    const sponsorNameIndex = this.csvParser.findColumnIndex(dataset.headers, 'SPONSOR_DFE_NAME');
    
    if (sponsorNameIndex === -1) {
      throw new Error('Could not find SPONSOR_DFE_NAME column in CSV');
    }

    const records = [];
    let foundRecords = 0;

    // Search through all data rows
    for (let i = 0; i < dataset.rows.length; i++) {
      const row = dataset.rows[i];
      
      if (row.length > sponsorNameIndex) {
        const sponsorName = this.csvParser.cleanValue(row[sponsorNameIndex]);
        
        if (sponsorName.toLowerCase().includes(searchLower)) {
          foundRecords++;
          
          // Create record object with field mappings
          const record = this.createRecordObject(dataset.headers, row);
          records.push(record);
        }
      }
    }

    return {
      foundRecords,
      records,
      year: dataset.year
    };
  }

  /**
   * Create a record object with field mappings
   * @param {Array} headers - Dataset headers
   * @param {Array} row - Row data
   * @returns {Object} Record object with field mappings
   */
  createRecordObject(headers, row) {
    const record = {};
    
    for (let i = 0; i < Math.min(headers.length, row.length); i++) {
      const header = headers[i];
      const value = this.csvParser.cleanValue(row[i]);
      
      // Only include non-empty values
      if (value && value.length > 0) {
        record[header] = value;
      }
    }

    return record;
  }

  /**
   * Extract EIN from a record
   * @param {Object} record - Record object
   * @returns {string|null} EIN or null if not found
   */
  extractEIN(record) {
    // Common EIN field names in Form 5500
    const einFields = ['SPONSOR_EIN', 'EIN', 'PLAN_EIN'];
    
    for (const field of einFields) {
      if (record[field]) {
        // Clean EIN (remove non-digits)
        const cleanEIN = record[field].replace(/\D/g, '');
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