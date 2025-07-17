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
    console.log('\n📊 STEP 3: Generating comprehensive summary report');
    console.log('='.repeat(50));

    const summary = {
      totalCompanies: searchResults.length,
      companiesWithForm5500: 0,
      companiesWithEIN: 0,
      companiesWithScheduleA: 0,
      detailedResults: []
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

      // Add to detailed results
      summary.detailedResults.push({
        company: result.company,
        ein: result.ein || 'Not Found',
        form5500Years: result.years.length > 0 ? result.years.join(', ') : 'None',
        scheduleARecords: this.formatScheduleARecords(result.schARecords)
      });
    }

    this.printSummaryReport(summary);
    return summary;
  }

  /**
   * Format Schedule A records for display
   * @param {Object} schARecords - Schedule A records by year
   * @returns {string} Formatted string
   */
  formatScheduleARecords(schARecords) {
    if (!schARecords || Object.keys(schARecords).length === 0) {
      return 'N/A';
    }

    const schAEntries = Object.entries(schARecords)
      .filter(([year, count]) => count > 0)
      .map(([year, count]) => `${year}:${count}`)
      .join(', ');
    
    return schAEntries || 'None';
  }

  /**
   * Print summary report to console
   * @param {Object} summary - Summary report data
   */
  printSummaryReport(summary) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE RESEARCH SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\nCompany Name | EIN | Form 5500 Years | SCH_A Records by Year');
    console.log('-'.repeat(80));
    
    for (const result of summary.detailedResults) {
      console.log(`${result.company.padEnd(25)} | ${result.ein.padEnd(12)} | ${result.form5500Years.padEnd(15)} | ${result.scheduleARecords}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📈 STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total companies processed: ${summary.totalCompanies}`);
    console.log(`Companies with Form 5500 records: ${summary.companiesWithForm5500}`);
    console.log(`Companies with EIN identified: ${summary.companiesWithEIN}`);
    console.log(`Companies with SCH_A records: ${summary.companiesWithScheduleA}`);
  }

  /**
   * Generate detailed Schedule A tables
   * @param {Array} companiesWithScheduleA - Companies with Schedule A data
   */
  generateScheduleATables(companiesWithScheduleA) {
    console.log('\n📊 STEP 4: Generating Schedule A record details');
    console.log('='.repeat(50));

    for (const company of companiesWithScheduleA) {
      if (company.schADetails && Object.keys(company.schADetails).length > 0) {
        this.generateScheduleATable(company.schADetails, company.company);
      }
    }
  }

  /**
   * Generate Schedule A table for a single company
   * @param {Object} schADetails - Schedule A details by year
   * @param {string} companyName - Company name
   */
  generateScheduleATable(schADetails, companyName) {
    console.log(`\n📋 Schedule A Records for ${companyName}`);
    console.log('='.repeat(80));
    
    for (const [year, records] of Object.entries(schADetails)) {
      console.log(`\n${year} Records (${records.length} total):`);
      console.log('-'.repeat(80));
      
      // Print header
      console.log('Carrier Name | Persons Covered | Broker Commission | Benefit Type | Total Charges');
      console.log('-'.repeat(80));
      
      for (const record of records) {
        if (this.scheduleASearchService) {
          const keyFields = this.scheduleASearchService.extractKeyFields(record);
          
          const carrierName = keyFields.carrierName.substring(0, 15);
          const personsCovered = keyFields.personsCovered.substring(0, 12);
          const brokerComm = keyFields.brokerCommission.substring(0, 15);
          const benefitType = keyFields.benefitType.substring(0, 15);
          const totalCharges = keyFields.totalCharges.substring(0, 12);
          
          console.log(`${carrierName.padEnd(15)} | ${personsCovered.padEnd(12)} | ${brokerComm.padEnd(15)} | ${benefitType.padEnd(15)} | ${totalCharges.padEnd(12)}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }

  /**
   * Generate JSON report for export
   * @param {Array} searchResults - Array of search results
   * @param {Object} summary - Summary report data
   * @returns {Object} Complete report data for JSON export
   */
  generateJSONReport(searchResults, summary) {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary,
      companies: searchResults.map(result => ({
        company: result.company,
        ein: result.ein,
        form5500: {
          years: result.years,
          recordCount: result.recordCount,
          records: result.records
        },
        scheduleA: {
          recordCounts: result.schARecords || {},
          details: result.schADetails || {},
          error: result.schAError || null
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
    // Get companies with Schedule A records
    const companiesWithScheduleA = searchResults.filter(result => 
      result.schARecords && Object.values(result.schARecords).some(count => count > 0)
    );

    // Generate summary report
    const summary = this.generateSummaryReport(searchResults);

    // Generate detailed Schedule A tables
    this.generateScheduleATables(companiesWithScheduleA);

    // Generate JSON report
    const jsonReport = this.generateJSONReport(searchResults, summary);

    return {
      summary,
      companiesWithScheduleA,
      jsonReport,
      searchResults
    };
  }
}

module.exports = ReportGenerator;