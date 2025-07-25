const { database: logger } = require('../utils/logger');
const DatabaseManager = require('./DatabaseManager');

/**
 * Service for searching EINs in Schedule A datasets using database
 */
class ScheduleASearchService {
  constructor() {
    this.databaseManager = DatabaseManager.getInstance();
  }

  /**
   * Search for EINs in Schedule A datasets using database
   * @param {Array} companiesWithEIN - Array of companies with valid EINs
   * @returns {Array} Array of companies with Schedule A data
   */
  async searchEINs(companiesWithEIN) {
    // Initialize database connection
    await this.databaseManager.initialize();

    for (let i = 0; i < companiesWithEIN.length; i++) {
      const company = companiesWithEIN[i];

      try {
        const schAResult = await this.searchSingleEIN(company.ein);
        company.schARecords = schAResult.counts;
        company.schADetails = schAResult.details;

      } catch (error) {
        company.schARecords = {};
        company.schADetails = {};
        company.schAError = error.message;
      }
    }

    return companiesWithEIN;
  }

  /**
   * Search for a single EIN using database
   * @param {string} ein - EIN to search for
   * @returns {Object} Search result with counts and details
   */
  async searchSingleEIN(ein) {
    const cleanEIN = ein.replace(/\D/g, '');
    
    if (cleanEIN.length !== 9) {
      throw new Error(`Invalid EIN: ${ein} (must be 9 digits)`);
    }

    const result = {
      counts: {},
      details: {}
    };

    try {
      // Get all matching Schedule A records from database
      const dbRecords = await this.databaseManager.getScheduleAByEIN(cleanEIN);
      
      if (dbRecords.length > 0) {
        // Group records by year
        const recordsByYear = {};
        
        for (const record of dbRecords) {
          const year = record.year || 'unknown';
          
          if (!recordsByYear[year]) {
            recordsByYear[year] = [];
          }
          
          // Convert database record to expected format
          const formattedRecord = this.formatDatabaseRecord(record, recordsByYear[year].length + 1);
          recordsByYear[year].push(formattedRecord);
        }
        
        // Populate result structure
        for (const [year, records] of Object.entries(recordsByYear)) {
          result.counts[year] = records.length;
          result.details[year] = records;
        }
      }

    } catch (error) {
      logger.debug(`   ✗ Error searching database for EIN "${ein}": ${error.message}`);
      throw error;
    }

    return result;
  }

  /**
   * Format database record to match expected CSV record structure
   * @param {Object} dbRecord - Database record
   * @param {number} recordNumber - Record number for this EIN
   * @returns {Object} Formatted record object
   */
  formatDatabaseRecord(dbRecord, recordNumber) {
    const record = {
      recordNumber,
      headers: [],
      values: [],
      fieldsMap: {}
    };
    
    // Convert database field names to expected CSV format and populate record
    for (const [key, value] of Object.entries(dbRecord)) {
      if (value !== null && value !== undefined && value !== '') {
        // Convert database column names to uppercase (CSV format)
        const headerName = key.toUpperCase();
        
        record.headers.push(headerName);
        record.values.push(value.toString());
        record.fieldsMap[headerName] = value.toString();
      }
    }

    return record;
  }

  /**
   * Extract key Schedule A fields for reporting
   * @param {Object} record - Schedule A record
   * @returns {Object} Key fields extracted from record
   */
  extractKeyFields(record) {
    const keyFields = {
      carrierName: record.fieldsMap['INS_CARRIER_NAME'] || '',
      personsCovered: record.fieldsMap['INS_PRSN_COVERED_EOY_CNT'] || '',
      brokerCommission: record.fieldsMap['INS_BROKER_COMM_TOT_AMT'] || '',
      benefitType: record.fieldsMap['WLFR_TYPE_BNFT_OTH_TEXT'] || '',
      totalCharges: record.fieldsMap['WLFR_TOT_CHARGES_PAID_AMT'] || ''
    };

    return keyFields;
  }

  /**
   * Get companies that have Schedule A records
   * @param {Array} companiesWithEIN - Array of companies with EINs
   * @returns {Array} Array of companies with Schedule A records
   */
  getCompaniesWithScheduleA(companiesWithEIN) {
    const companiesWithSchARecords = companiesWithEIN.filter(company => 
      company.schARecords && Object.values(company.schARecords).some(count => count > 0)
    );
    
    return companiesWithSchARecords;
  }
}

module.exports = ScheduleASearchService;