/**
 * Generates comprehensive reports for Form 5500 and Schedule A search results
 */
class ReportGenerator {
  constructor() {
    this.scheduleASearchService = null;
  }

  /**
   * Set the Schedule A search service for key field extraction
   * @param {ScheduleASearchService} service - Schedule A search service
   */
  setScheduleASearchService(service) {
    this.scheduleASearchService = service;
  }

  /**
   * Generate comprehensive summary report
   * @param {Array} searchResults - Array of search results
   * @returns {Object} Summary report data
   */
  generateSummaryReport(searchResults) {
    const summary = {
      totalCompanies: searchResults.length,
      companiesWithForm5500: 0,
      companiesWithEIN: 0,
      companiesWithScheduleA: 0
    };

    // Calculate statistics
    for (const result of searchResults) {
      if (result.years.length > 0) {
        summary.companiesWithForm5500++;
      }
      
      if (result.ein && result.ein !== 'ERROR' && result.ein !== 'Not Found') {
        summary.companiesWithEIN++;
      }
      
      if (result.schARecords && Object.values(result.schARecords).some(count => count > 0)) {
        summary.companiesWithScheduleA++;
      }
    }

    return summary;
  }

  /**
   * Format Schedule A details for JSON output
   * @param {Object} schADetails - Schedule A details by year
   * @returns {Object} Formatted Schedule A details
   */
  formatScheduleADetails(schADetails) {
    const formatted = {};
    
    for (const [year, records] of Object.entries(schADetails)) {
      formatted[year] = records.map(record => {
        if (this.scheduleASearchService) {
          const keyFields = this.scheduleASearchService.extractKeyFields(record);
          return {
            carrierName: keyFields.carrierName || '',
            personsCovered: keyFields.personsCovered || '',
            brokerCommission: keyFields.brokerCommission || '',
            benefitType: keyFields.benefitType || '',
            totalCharges: keyFields.totalCharges || ''
          };
        }
        return record;
      });
    }
    
    return formatted;
  }

  /**
   * Generate JSON report for export
   * @param {Array} searchResults - Array of search results
   * @param {Object} summary - Summary report data
   * @returns {Object} Complete report data for JSON export
   */
  generateJSONReport(searchResults, summary) {
    const reportData = {
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      companies: searchResults.map(result => ({
        legal_entity_name: result.company,  // Changed from companyName to legal_entity_name
        form5500_data: {  // Nested all data under form5500_data
          ein: result.ein || null,
          form5500: {
            years: result.years || [],
            recordCount: result.recordCount || 0,
            records: result.records || {}
          },
          scheduleA: {
            recordCounts: result.schARecords || {},
            details: this.formatScheduleADetails(result.schADetails || {}),
            error: result.schAError || null
          }
        }
      }))
    };

    return reportData;
  }

  /**
   * Generate final extraction report
   * @param {Array} searchResults - Complete search results
   * @returns {Object} Final report with all data
   */
  generateFinalReport(searchResults) {
    // Generate summary report
    const summary = this.generateSummaryReport(searchResults);

    // Generate JSON report
    const jsonReport = this.generateJSONReport(searchResults, summary);

    return jsonReport;
  }
}

module.exports = ReportGenerator;