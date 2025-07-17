const CSVParser = require('./CSVParser');

/**
 * Service for searching EINs in Schedule A datasets
 */
class ScheduleASearchService {
  constructor() {
    this.csvParser = new CSVParser();
  }

  /**
   * Search for EINs in Schedule A datasets
   * @param {Array} datasets - Array of Schedule A datasets
   * @param {Array} companiesWithEIN - Array of companies with valid EINs
   * @returns {Array} Array of companies with Schedule A data
   */
  searchEINs(datasets, companiesWithEIN) {
    console.log('\n📊 STEP 2: Searching EINs in SCH_A data');
    console.log('='.repeat(50));

    for (let i = 0; i < companiesWithEIN.length; i++) {
      const company = companiesWithEIN[i];
      console.log(`[${i + 1}/${companiesWithEIN.length}] Searching EIN ${company.ein} for ${company.company}`);

      try {
        const schAResult = this.searchSingleEIN(datasets, company.ein);
        company.schARecords = schAResult.counts;
        company.schADetails = schAResult.details;

        const totalSchARecords = Object.values(schAResult.counts).reduce((sum, count) => sum + count, 0);
        console.log(`   ✓ Found ${totalSchARecords} SCH_A record(s) across all years`);

      } catch (error) {
        console.log(`   ✗ Error searching EIN: ${error.message}`);
        company.schARecords = {};
        company.schADetails = {};
        company.schAError = error.message;
      }
    }

    return companiesWithEIN;
  }

  /**
   * Search for a single EIN across all Schedule A datasets
   * @param {Array} datasets - Array of Schedule A datasets
   * @param {string} ein - EIN to search for
   * @returns {Object} Search result with counts and details
   */
  searchSingleEIN(datasets, ein) {
    const cleanEIN = ein.replace(/\D/g, '');
    
    if (cleanEIN.length !== 9) {
      throw new Error(`Invalid EIN: ${ein} (must be 9 digits)`);
    }

    const result = {
      counts: {},
      details: {}
    };

    for (const dataset of datasets) {
      try {
        const datasetResult = this.searchDataset(dataset, cleanEIN);
        
        if (datasetResult.foundRecords > 0) {
          result.counts[dataset.year] = datasetResult.foundRecords;
          result.details[dataset.year] = datasetResult.records;
        }

      } catch (error) {
        console.log(`   ✗ Error searching ${dataset.year} dataset: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Search a single dataset for an EIN
   * @param {Object} dataset - Dataset object
   * @param {string} cleanEIN - Clean EIN to search for
   * @returns {Object} Dataset search result
   */
  searchDataset(dataset, cleanEIN) {
    const einIndex = this.csvParser.findColumnIndex(dataset.headers, 'SCH_A_EIN');
    
    if (einIndex === -1) {
      throw new Error('Could not find SCH_A_EIN column in CSV');
    }

    const records = [];
    let foundRecords = 0;

    // Search through all data rows
    for (let i = 0; i < dataset.rows.length; i++) {
      const row = dataset.rows[i];
      
      if (row.length > einIndex) {
        const recordEIN = this.csvParser.cleanValue(row[einIndex]).replace(/\D/g, '');
        
        if (recordEIN === cleanEIN) {
          foundRecords++;
          
          // Create record object with field mappings
          const record = this.createRecordObject(dataset.headers, row, foundRecords);
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
   * Create a Schedule A record object with field mappings
   * @param {Array} headers - Dataset headers
   * @param {Array} row - Row data
   * @param {number} recordNumber - Record number for this EIN
   * @returns {Object} Record object with field mappings
   */
  createRecordObject(headers, row, recordNumber) {
    const record = {
      recordNumber,
      headers: [],
      values: [],
      fieldsMap: {}
    };
    
    for (let i = 0; i < Math.min(headers.length, row.length); i++) {
      const header = headers[i];
      const value = this.csvParser.cleanValue(row[i]);
      
      // Only include non-empty values
      if (value && value.length > 0) {
        record.headers.push(header);
        record.values.push(value);
        record.fieldsMap[header] = value;
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

    console.log(`📊 Found ${companiesWithSchARecords.length} companies with Schedule A records`);
    
    return companiesWithSchARecords;
  }
}

module.exports = ScheduleASearchService;