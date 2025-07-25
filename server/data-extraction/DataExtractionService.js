const { database: logger } = require('../utils/logger');
const Form5500SearchService = require('./Form5500SearchService');
const ScheduleASearchService = require('./ScheduleASearchService');
const ReportGenerator = require('./ReportGenerator');
const pollingService = require('../services/PollingService');

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
   * @param {string|number} workflowId - Optional workflow ID for polling messages
   * @param {string|number} firmId - Optional firm ID for polling messages
   * @returns {Object} Complete extraction results
   */
  async extractData(legalNames, workflowId = null, firmId = null) {
    try {
      logger.info(`🔍 Processing ${legalNames.length} companies for Form 5500/Schedule A data`);
      
      // Add polling message for data extraction start
      if (workflowId) {
        pollingService.addMessage(workflowId, firmId, 'progress', `🔍 Starting Form 5500 research for ${legalNames.length} companies`);
      }

      // Phase 1: Search companies in Form 5500 using database
      const form5500Results = await this.form5500SearchService.searchCompanies(legalNames);
      
      // Add polling message for Form 5500 results
      if (workflowId) {
        const foundCount = form5500Results.filter(r => r.matchCount > 0).length;
        pollingService.addMessage(workflowId, firmId, 'progress', `📋 Found Form 5500 records for ${foundCount} companies`);
      }
      
      // Phase 2: Extract EINs from Form 5500 results
      const companiesWithEIN = this.form5500SearchService.extractEINs(form5500Results);
      
      // Add polling message for Schedule A research start
      if (workflowId) {
        const einCount = companiesWithEIN.filter(c => c.ein).length;
        pollingService.addMessage(workflowId, firmId, 'progress', `🔍 Starting Schedule A research for ${einCount} EINs`);
      }

      // Phase 3: Search EINs in Schedule A using database
      const finalResults = await this.scheduleASearchService.searchEINs(companiesWithEIN);
      
      // Add polling message for Schedule A results
      if (workflowId) {
        const scheduleACount = finalResults.filter(r => r.scheduleAResults && r.scheduleAResults.length > 0).length;
        pollingService.addMessage(workflowId, firmId, 'progress', `📋 Found Schedule A records for ${scheduleACount} EINs`);
      }
      
      // Phase 4: Generate comprehensive reports
      if (workflowId) {
        pollingService.addMessage(workflowId, firmId, 'progress', `📊 Generating final report`);
      }
      
      const reportData = this.reportGenerator.generateFinalReport(finalResults);

      logger.info('✅ Data extraction completed');
      
      // Add polling message for completion
      if (workflowId) {
        pollingService.addMessage(workflowId, firmId, 'progress', `✅ Data extraction completed`);
      }
      
      return reportData;

    } catch (error) {
      logger.error('❌ Data extraction failed:', error.message);
      
      // Add polling message for error
      if (workflowId) {
        pollingService.addMessage(workflowId, firmId, 'error', `❌ Data extraction failed: ${error.message}`);
      }
      
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