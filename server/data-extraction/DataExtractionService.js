const { database: logger } = require('../utils/logger');
const Form5500SearchService = require('./Form5500SearchService');
const ScheduleASearchService = require('./ScheduleASearchService');
const ReportGenerator = require('./ReportGenerator');
const DatabaseManager = require('./DatabaseManager');
const SelfFundedClassifierService = require('./SelfFundedClassifierService');

/**
 * Main service for orchestrating data extraction from database
 */
class DataExtractionService {
  constructor() {
    this.form5500SearchService = new Form5500SearchService();
    this.scheduleASearchService = new ScheduleASearchService();
    this.reportGenerator = new ReportGenerator();
    this.databaseManager = DatabaseManager.getInstance();
    this.selfFundedClassifierService = new SelfFundedClassifierService();
    
    // Set up report generator with Schedule A service for key field extraction
    this.reportGenerator.setScheduleASearchService(this.scheduleASearchService);
  }

  /**
   * Main entry point for data extraction process using pipeline ID
   * @param {number} pipelineId - Pipeline ID to extract data for
   * @param {Object} options - Extraction options
   * @param {boolean} options.enableSelfFundedClassification - Enable self-funded classification (default: true)
   * @returns {Object} Complete extraction results with companies array
   */
  async extractData(pipelineId, options = { enableSelfFundedClassification: true }) {
    try {
      // Load pipeline from database
      const pipeline = await this.databaseManager.getPipeline(pipelineId);
      
      if (!pipeline || !pipeline.companies) {
        throw new Error(`Pipeline ${pipelineId} not found or has no companies`);
      }
      
      // Separate companies with validated Form 5500 matches from those without
      const companiesWithValidMatches = pipeline.companies.filter(company => 
        company.form5500_match && 
        company.form5500_match.match_type !== "no_match" &&
        company.form5500_match.ein
      );
      
      const companiesWithoutMatches = pipeline.companies.filter(company => 
        !company.form5500_match || 
        company.form5500_match.match_type === "no_match" ||
        !company.form5500_match.ein
      );
      
      logger.info(`🔍 Processing ${pipeline.companies.length} companies: ${companiesWithValidMatches.length} with validated matches, ${companiesWithoutMatches.length} without matches`);
      
      let form5500Results = [];
      
      // Use EIN-based search for companies with validated matches
      if (companiesWithValidMatches.length > 0) {
        const companyMatches = companiesWithValidMatches.map(company => ({
          ein: company.form5500_match.ein,
          legal_name: company.form5500_match.legal_name,
          original_company_name: company.name
        }));
        
        logger.info(`📋 Using EIN-based search for ${companiesWithValidMatches.length} validated companies`);
        const einResults = await this.form5500SearchService.searchCompaniesByEIN(companyMatches);
        form5500Results.push(...einResults);
      }
      
      // Use name-based search for companies without validated matches (if any have legal entity names)
      const companiesWithNamesOnly = companiesWithoutMatches.filter(company => company.legal_entity_name);
      if (companiesWithNamesOnly.length > 0) {
        const companyNamesToSearch = companiesWithNamesOnly.map(company => company.legal_entity_name);
        logger.info(`📋 Using name-based search for ${companiesWithNamesOnly.length} companies without validated matches`);
        const nameResults = await this.form5500SearchService.searchCompanies(companyNamesToSearch);
        form5500Results.push(...nameResults);
      }
      
      if (form5500Results.length === 0) {
        return { 
          success: true, 
          companies: pipeline.companies, 
          message: 'No companies found for Form 5500 search',
          pipelineId: pipelineId,
          extractedAt: new Date().toISOString()
        };
      }
      
      logger.info(`📋 Found Form 5500 records for ${form5500Results.filter(r => r.recordCount > 0).length} of ${form5500Results.length} searched companies`);
      
      // Phase 2: Extract EINs from Form 5500 results
      const companiesWithEIN = this.form5500SearchService.extractEINs(form5500Results);
      
      // Phase 3: Search EINs in Schedule A using database
      const finalResults = await this.scheduleASearchService.searchEINs(companiesWithEIN);
      
      logger.info(`📋 Found Schedule A records for ${finalResults.filter(r => r.schARecords && Object.keys(r.schARecords).length > 0).length} EINs`);
      
      // Phase 4: Generate comprehensive reports (now in classifier-compatible format)
      const reportData = this.reportGenerator.generateFinalReport(finalResults);
      
      // Phase 5: Classify companies as self-funded/insured (if enabled)
      const enableSelfFundedClassification = options.enableSelfFundedClassification !== false;
      if (enableSelfFundedClassification) {
        logger.info('🔍 Classifying companies as self-funded or insured...');
        try {
          const classifiedCompanies = await this.selfFundedClassifierService.classifyCompanies(reportData.companies);
          reportData.companies = classifiedCompanies;
          logger.info(`✅ Self-funded classification completed for ${classifiedCompanies.length} companies`);
        } catch (error) {
          logger.error('❌ Self-funded classification failed, continuing without classification:', error.message);
          // Continue without classification rather than failing entire pipeline
        }
      } else {
        logger.info('⏭️  Self-funded classification disabled, skipping');
      }
      
      // Phase 6: Map results back to companies structure
      const companiesWithForm5500 = this.mapResultsToCompanies(pipeline.companies, reportData);

      logger.info('✅ Data extraction completed');
      
      return {
        success: true,
        companies: companiesWithForm5500,
        pipelineId: pipelineId,
        extractedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('❌ Data extraction failed:', error.message);
      
      return {
        success: false,
        error: error.message,
        pipelineId: pipelineId,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Map Form 5500 extraction results back to company objects
   * @param {Array} originalCompanies - Original company objects from pipeline
   * @param {Object} reportData - Report data from extraction
   * @returns {Array} Companies with form5500_data added
   */
  mapResultsToCompanies(originalCompanies, reportData) {
    const companiesWithData = [...originalCompanies];
    
    // Create a lookup map from the report data
    const reportLookup = new Map();
    if (reportData.companies) {
      reportData.companies.forEach(company => {
        reportLookup.set(company.legal_entity_name, company); // Changed from companyName to legal_entity_name
      });
    }
    
    // Add form5500_data to matching companies
    companiesWithData.forEach(company => {
      const reportCompany = reportLookup.get(company.legal_entity_name);
      if (reportCompany) {
        // Data is already in the correct structure from ReportGenerator
        company.form5500_data = reportCompany.form5500_data;
      } else {
        company.form5500_data = null; // No data found
      }
    });
    
    return companiesWithData;
  }


}

module.exports = DataExtractionService;