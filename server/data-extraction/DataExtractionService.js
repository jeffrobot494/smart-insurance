const DatasetManager = require('./DatasetManager');
const Form5500SearchService = require('./Form5500SearchService');
const ScheduleASearchService = require('./ScheduleASearchService');
const ReportGenerator = require('./ReportGenerator');

/**
 * Main service for orchestrating data extraction from Form 5500 and Schedule A datasets
 */
class DataExtractionService {
  constructor() {
    this.datasetManager = new DatasetManager();
    this.form5500SearchService = new Form5500SearchService();
    this.scheduleASearchService = new ScheduleASearchService();
    this.reportGenerator = new ReportGenerator();
    
    // Set up report generator with Schedule A service for key field extraction
    this.reportGenerator.setScheduleASearchService(this.scheduleASearchService);
  }

  /**
   * Main entry point for data extraction process
   * @param {Array} legalNames - Array of legal company names from run2()
   * @returns {Object} Complete extraction results
   */
  async extractData(legalNames) {
    try {
      console.log('🔍 Starting data extraction process');
      console.log(`📊 Processing ${legalNames.length} legal company names`);
      console.log('='.repeat(80));

      // Phase 1: Load datasets
      console.log('📂 Loading datasets...');
      const form5500Datasets = this.datasetManager.loadForm5500Datasets();
      const scheduleADatasets = this.datasetManager.loadScheduleADatasets();
      
      console.log(`✅ Loaded ${form5500Datasets.length} Form 5500 datasets`);
      console.log(`✅ Loaded ${scheduleADatasets.length} Schedule A datasets`);

      // Phase 2: Search companies in Form 5500
      const form5500Results = this.form5500SearchService.searchCompanies(form5500Datasets, legalNames);
      
      // Phase 3: Extract EINs from Form 5500 results
      const companiesWithEIN = this.form5500SearchService.extractEINs(form5500Results);

      // Phase 4: Search EINs in Schedule A
      const finalResults = this.scheduleASearchService.searchEINs(scheduleADatasets, companiesWithEIN);

      // Phase 5: Generate comprehensive reports
      const reportData = this.reportGenerator.generateFinalReport(finalResults);

      // Phase 6: Return results
      console.log('\n✅ Data extraction completed successfully');
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
        summary: reportData.summary,
        companies: finalResults,
        jsonReport: reportData.jsonReport
      };

    } catch (error) {
      console.error('❌ Data extraction failed:', error.message);
      console.error('Stack trace:', error.stack);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Extract data from a single company name (for testing)
   * @param {string} companyName - Single company name
   * @returns {Object} Extraction results for single company
   */
  async extractSingleCompany(companyName) {
    return await this.extractData([companyName]);
  }

  /**
   * Get extraction statistics
   * @param {Object} results - Extraction results
   * @returns {Object} Statistics summary
   */
  getExtractionStats(results) {
    if (!results.success) {
      return {
        success: false,
        error: results.error
      };
    }

    return {
      success: true,
      totalCompanies: results.summary.totalCompanies,
      companiesWithForm5500: results.summary.companiesWithForm5500,
      companiesWithEIN: results.summary.companiesWithEIN,
      companiesWithScheduleA: results.summary.companiesWithScheduleA,
      successRate: {
        form5500: ((results.summary.companiesWithForm5500 / results.summary.totalCompanies) * 100).toFixed(2) + '%',
        ein: ((results.summary.companiesWithEIN / results.summary.totalCompanies) * 100).toFixed(2) + '%',
        scheduleA: ((results.summary.companiesWithScheduleA / results.summary.totalCompanies) * 100).toFixed(2) + '%'
      }
    };
  }
}

module.exports = DataExtractionService;