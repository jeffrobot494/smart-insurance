const Form5500SearchService = require('./Form5500SearchService');
const ScheduleASearchService = require('./ScheduleASearchService');
const ReportGenerator = require('./ReportGenerator');

/**
 * Main service for orchestrating data extraction from database
 */
class DataExtractionService {
  constructor() {
    this.form5500SearchService = new Form5500SearchService();
    this.scheduleASearchService = new ScheduleASearchService();
    this.reportGenerator = new ReportGenerator();
    
    // Set up report generator with Schedule A service for key field extraction
    this.reportGenerator.setScheduleASearchService(this.scheduleASearchService);
  }

  /**
   * Main entry point for data extraction process using database
   * @param {Array} legalNames - Array of legal company names from run2()
   * @returns {Object} Complete extraction results
   */
  async extractData(legalNames) {
    try {
      console.log(`🔍 Processing ${legalNames.length} companies for Form 5500/Schedule A data`);

      // Phase 1: Search companies in Form 5500 using database
      const form5500Results = await this.form5500SearchService.searchCompanies(legalNames);
      
      // Phase 2: Extract EINs from Form 5500 results
      const companiesWithEIN = this.form5500SearchService.extractEINs(form5500Results);

      // Phase 3: Search EINs in Schedule A using database
      const finalResults = await this.scheduleASearchService.searchEINs(companiesWithEIN);
      
      // Phase 4: Generate comprehensive reports
      const reportData = this.reportGenerator.generateFinalReport(finalResults);

      console.log('✅ Data extraction completed');
      return reportData;

    } catch (error) {
      console.error('❌ Data extraction failed:', error.message);
      
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

}

module.exports = DataExtractionService;