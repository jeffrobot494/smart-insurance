const { database: logger } = require('../utils/logger');
const DatabaseManager = require('./DatabaseManager');

class SelfFundedClassifierService {
  constructor() {
    this.databaseManager = DatabaseManager.getInstance();
  }

  /**
   * Classify companies with year-by-year breakdown
   * @param {Array} companies - Companies with form5500_data
   * @returns {Array} Companies with detailed self_funded classification added
   */
  async classifyCompanies(companies) {
    logger.info('🔍 Starting self-funded classification for companies');
    logger.info(`[DEBUG] Classifying ${companies.length} companies`);
    
    for (const company of companies) {
      if (!company.form5500_data || !company.form5500_data.ein) {
        company.form5500_data = company.form5500_data || {};
        // Quick access field
        company.form5500_data.self_funded = 'no-data';
        // Detailed analysis
        company.form5500_data.self_funded_analysis = {
          current_classification: 'no-data',
          classifications_by_year: {},
          summary: { years_available: [], message: 'No Form 5500 data available' }
        };
        continue;
      }
      
      try {
        logger.info(`[DEBUG] Classifying company: ${company.legal_entity_name || company.name}`);
        const classification = await this.classifyCompany(company);
        // Quick access field (same as current_classification)
        company.form5500_data.self_funded = classification.current_classification;
        // Detailed analysis
        company.form5500_data.self_funded_analysis = classification;
        logger.info(`✓ Classified ${company.legal_entity_name}: ${classification.current_classification} (${classification.summary.years_available.length} years)`);
      } catch (error) {
        logger.error(`❌ Error classifying ${company.legal_entity_name}:`, error.message);
        // Quick access field
        company.form5500_data.self_funded = 'error';
        // Detailed analysis
        company.form5500_data.self_funded_analysis = {
          current_classification: 'error',
          classifications_by_year: {},
          summary: { years_available: [], error: error.message }
        };
      }
    }
    
    return companies;
  }

  /**
   * Classify a single company with year-by-year breakdown using existing form5500_data
   * @param {Object} company - Company object with form5500_data
   * @returns {Object} Detailed classification result with year-by-year breakdown
   */
  async classifyCompany(company) {
    const legalEntityName = company.legal_entity_name;
    
    // Get raw Form 5500 data for classification
    const form5500Records = await this.databaseManager.query(
      'SELECT * FROM get_form5500_for_classification($1)',
      [legalEntityName]
    );
    
    if (form5500Records.rows.length === 0) {
      return {
        current_classification: 'no-data',
        classifications_by_year: {},
        summary: {
          years_available: [],
          message: 'No Form 5500 records found for this company'
        }
      };
    }
    
    // NEW: Get all unique EINs from Form 5500 records with validation
    const baseCompanyName = form5500Records.rows[0].sponsor_name;
    
    // Defensive check for missing base company name
    if (!baseCompanyName || baseCompanyName.trim() === '') {
      logger.warn(`No sponsor name found for company: ${legalEntityName}`);
      // Fallback to single EIN approach
      const ein = company.form5500_data?.ein;
      if (!ein) {
        return {
          current_classification: 'no-data',
          classifications_by_year: {},
          summary: {
            years_available: [],
            message: 'No EIN available for classification'
          }
        };
      }
      const scheduleARecords = await this.databaseManager.query(
        'SELECT * FROM get_schedule_a_for_classification($1)', 
        [ein]
      );
      const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords.rows, [ein]);
    } else {
      // Multi-EIN approach with validation
      const allEINs = [...new Set(
        form5500Records.rows
          .filter(record => record.sponsor_name && record.sponsor_name === baseCompanyName)
          .map(record => record.ein)
          .filter(ein => ein && ein.trim() !== '')
      )];
      
      // Defensive check for empty EINs array
      if (allEINs.length === 0) {
        logger.warn(`No valid EINs found for company: ${legalEntityName}`);
        return {
          current_classification: 'no-data',
          classifications_by_year: {},
          summary: {
            years_available: [],
            message: 'No valid EINs found for this company'
          }
        };
      }
      
      // Get Schedule A records for ALL company EINs
      const allScheduleARecords = [];
      for (const ein of allEINs) {
        try {
          const scheduleAResult = await this.databaseManager.query(
            'SELECT * FROM get_schedule_a_for_classification($1)',
            [ein]
          );
          allScheduleARecords.push(...scheduleAResult.rows);
        } catch (error) {
          logger.warn(`Failed to get Schedule A for EIN ${ein}:`, error.message);
          // Continue with other EINs instead of failing completely
        }
      }
      
      // Build Schedule A index with ALL EINs
      var scheduleAIndex = this.buildScheduleAIndex(allScheduleARecords, allEINs);
    }
    
    // Group Form 5500 records by year
    const recordsByYear = {};
    form5500Records.rows.forEach(record => {
      const year = record.year.toString();
      if (!recordsByYear[year]) {
        recordsByYear[year] = [];
      }
      recordsByYear[year].push(record);
    });
    
    // Classify each year separately
    const classificationsByYear = {};
    const yearlyClassifications = [];
    
    for (const [year, yearRecords] of Object.entries(recordsByYear)) {
      const yearPlans = [];
      
      // Classify each plan in this year
      for (const form5500Record of yearRecords) {
        const planClassification = this.classifyPlan(form5500Record, scheduleAIndex);
        if (planClassification) {
          yearPlans.push({
            plan_name: form5500Record.plan_name || '',
            ein: form5500Record.ein,
            classification: planClassification.classification,
            reasons: planClassification.reasons,
            metadata: planClassification.metadata
          });
        }
      }
      
      // Roll up plans within this year only
      const yearClassification = this.rollUpCompanyClassification(
        yearPlans.map(p => p.classification)
      );
      
      classificationsByYear[year] = {
        classification: yearClassification,
        plans: yearPlans
      };
      
      yearlyClassifications.push({
        year: year,
        classification: yearClassification
      });
    }
    
    // Generate summary with trend analysis
    const summary = this.generateYearlySummary(yearlyClassifications);
    
    // Current classification = most recent year
    const years = Object.keys(classificationsByYear).sort((a, b) => parseInt(b) - parseInt(a));
    const currentClassification = years.length > 0 ? classificationsByYear[years[0]].classification : 'no-data';
    
    return {
      current_classification: currentClassification,
      classifications_by_year: classificationsByYear,
      summary: summary
    };
  }

  /**
   * Analyze raw Schedule A benefit text for health indicators
   * @param {string} benefitText - Raw benefit text from database
   * @returns {boolean} True if this indicates health coverage
   */
  isHealthBenefitText(benefitText) {
    try {
      if (!benefitText || typeof benefitText !== 'string') return false;
      
      const text = benefitText.toUpperCase().trim();
      
      // Exclude non-health benefits
      const nonHealthKeywords = [
        'DISABILITY', 'AD&D', 'LIFE INSURANCE', 'VISION', 'DENTAL',
        'ACCIDENTAL DEATH', 'STATUTORY', 'LEGAL SERVICES', 'EMPLOYEE ASSISTANCE'
      ];
      
      if (nonHealthKeywords.some(exclude => text.includes(exclude))) {
        return false;
      }
      
      // Health benefit indicators
      const healthKeywords = [
        'MEDICAL', 'HEALTH', 'HEALTHCARE', 'MAJOR MEDICAL', 'COMPREHENSIVE MEDICAL'
      ];
      
      return healthKeywords.some(keyword => text.includes(keyword));
    } catch (error) {
      logger.warn(`Error analyzing benefit text: ${error.message}`);
      return false; // Conservative fallback
    }
  }

  /**
   * Analyze raw Schedule A benefit text for stop-loss indicators
   * @param {string} benefitText - Raw benefit text from database
   * @returns {boolean} True if this indicates stop-loss coverage
   */
  isStopLossBenefitText(benefitText) {
    try {
      if (!benefitText || typeof benefitText !== 'string') return false;
      
      const text = benefitText.toUpperCase();
      const stopLossKeywords = ['STOP LOSS', 'STOP-LOSS', 'STOPLOSS'];
      
      return stopLossKeywords.some(keyword => text.includes(keyword));
    } catch (error) {
      logger.warn(`Error analyzing stop-loss text: ${error.message}`);
      return false; // Conservative fallback
    }
  }

  /**
   * Test classification for a single company name (for test endpoint)
   * @param {string} companyName - Company name to search and classify
   * @returns {Object} Classification results with year-by-year breakdown and raw data
   */
  async testClassifyCompany(companyName) {
    logger.info(`🔍 Testing self-funded classification for: ${companyName}`);
    
    try {
      // Get raw Form 5500 data by company name
      logger.debug(`[DEBUG] Querying Form 5500 for company: "${companyName}"`);
      const form5500Result = await this.databaseManager.query(
        'SELECT * FROM get_form5500_for_classification($1)',
        [companyName]
      );
      
      const form5500Records = form5500Result.rows;
      logger.debug(`[DEBUG] Found ${form5500Records.length} Form 5500 records`);
      form5500Records.forEach((record, index) => {
        logger.debug(`[DEBUG] Form5500[${index}]: EIN=${record.ein}, Plan=${record.spons_dfe_pn}, Year=${record.year}, WelfareCode="${record.type_welfare_bnft_code}", Sponsor="${record.sponsor_name}"`);
      });
      
      if (form5500Records.length === 0) {
        return {
          success: true,
          company_name: companyName,
          // Quick access field
          self_funded: 'no-data',
          // Detailed analysis
          self_funded_analysis: {
            current_classification: 'no-data',
            classifications_by_year: {},
            summary: {
              years_available: [],
              message: 'No Form 5500 records found for this company'
            }
          },
          raw_data: { form5500_records: [], schedule_a_records: [] }
        };
      }
      
      // Get EINs and Schedule A data with validation
      const baseCompanyName = form5500Records[0].sponsor_name;
      logger.debug(`[DEBUG] Base company name: "${baseCompanyName}"`);
      
      // Defensive programming for missing base company name
      if (!baseCompanyName || baseCompanyName.trim() === '') {
        logger.warn(`No sponsor name found for company: ${companyName}`);
        return {
          success: true,
          company_name: companyName,
          self_funded: 'no-data',
          self_funded_analysis: {
            current_classification: 'no-data',
            classifications_by_year: {},
            summary: {
              years_available: [],
              message: 'No sponsor name available for classification'
            }
          },
          raw_data: { form5500_records: form5500Records, schedule_a_records: [] }
        };
      }
      
      logger.debug(`[DEBUG] Filtering Form 5500 records by sponsor name match`);
      const filteredRecords = form5500Records.filter(record => record.sponsor_name && record.sponsor_name === baseCompanyName);
      logger.debug(`[DEBUG] After sponsor name filter: ${filteredRecords.length} records remain`);
      
      const eins = [...new Set(
        filteredRecords
          .map(r => r.ein)
          .filter(ein => ein && ein.trim() !== '')
      )];
      
      logger.info(`[DEBUG] Extracted unique EINs: [${eins.join(', ')}]`);
      
      // Defensive check for empty EINs array
      if (eins.length === 0) {
        logger.warn(`No valid EINs found for company: ${companyName}`);
        return {
          success: true,
          company_name: companyName,
          self_funded: 'no-data',
          self_funded_analysis: {
            current_classification: 'no-data',
            classifications_by_year: {},
            summary: {
              years_available: [],
              message: 'No valid EINs found for this company'
            }
          },
          raw_data: { form5500_records: form5500Records, schedule_a_records: [] }
        };
      }
      
      const scheduleARecords = [];
      for (const ein of eins) {
        try {
          logger.debug(`[DEBUG] Querying Schedule A for EIN: ${ein}`);
          const scheduleAResult = await this.databaseManager.query(
            'SELECT * FROM get_schedule_a_for_classification($1)',
            [ein]
          );
          logger.info(`[DEBUG] Found ${scheduleAResult.rows.length} Schedule A records for EIN ${ein}`);
          scheduleAResult.rows.forEach((record, index) => {
            logger.info(`[DEBUG] ScheduleA[${index}] for EIN ${ein}: Plan=${record.sch_a_plan_num}, Year=${record.year}, HealthInd=${record.wlfr_bnft_health_ind}, StopLossInd=${record.wlfr_bnft_stop_loss_ind}, TextField="${record.wlfr_type_bnft_oth_text}"`);
          });
          scheduleARecords.push(...scheduleAResult.rows);
        } catch (error) {
          logger.warn(`Failed to get Schedule A for EIN ${ein} in test:`, error.message);
          // Continue with other EINs instead of failing completely
        }
      }
      
      // Build Schedule A index with ALL EINs (not just first one)
      const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords, eins);
      
      // Group Form 5500 records by year
      const recordsByYear = {};
      form5500Records.forEach(record => {
        const year = record.year.toString();
        if (!recordsByYear[year]) {
          recordsByYear[year] = [];
        }
        recordsByYear[year].push(record);
      });
      
      // Classify each year separately
      const classificationsByYear = {};
      const yearlyClassifications = [];
      
      for (const [year, yearRecords] of Object.entries(recordsByYear)) {
        const yearPlans = [];
        
        // Classify each plan in this year
        for (const form5500Record of yearRecords) {
          const planClassification = this.classifyPlan(form5500Record, scheduleAIndex);
          if (planClassification) {
            yearPlans.push({
              plan_name: form5500Record.plan_name || '',
              ein: form5500Record.ein,
              classification: planClassification.classification,
              reasons: planClassification.reasons,
              metadata: planClassification.metadata
            });
          }
        }
        
        // Roll up plans within this year only
        const yearClassification = this.rollUpCompanyClassification(
          yearPlans.map(p => p.classification)
        );
        
        classificationsByYear[year] = {
          classification: yearClassification,
          plans: yearPlans
        };
        
        yearlyClassifications.push({
          year: year,
          classification: yearClassification
        });
      }
      
      // Generate summary with trend analysis
      const summary = this.generateYearlySummary(yearlyClassifications);
      
      // Current classification = most recent year
      const years = Object.keys(classificationsByYear).sort((a, b) => parseInt(b) - parseInt(a));
      const currentClassification = years.length > 0 ? classificationsByYear[years[0]].classification : 'no-data';
      
      // Return test-specific format with raw data included (matching new structure)
      return {
        success: true,
        company_name: companyName,
        // Quick access field (same as current_classification)
        self_funded: currentClassification,
        // Detailed analysis
        self_funded_analysis: {
          current_classification: currentClassification,
          classifications_by_year: classificationsByYear,
          summary: summary
        },
        raw_data: {
          form5500_records: form5500Records,
          schedule_a_records: scheduleARecords
        }
      };
      
    } catch (error) {
      logger.error(`❌ Classification test failed for ${companyName}:`, error.message);
      throw error;
    }
  }

  /**
   * Build Schedule A index for efficient lookups with enhanced fallback text analysis
   * @param {Array} scheduleARecords - Raw Schedule A records
   * @param {Array} allEINs - All EINs associated with this company
   * @returns {Object} Indexed Schedule A data
   */
  buildScheduleAIndex(scheduleARecords, allEINs) {
    logger.debug(`[DEBUG] Building Schedule A index with ${scheduleARecords.length} records for EINs: [${allEINs.join(', ')}]`);
    
    const index = {
      byBeginYear: new Map(),
      byEndYear: new Map()
    };
    
    // Defensive checks
    if (!Array.isArray(scheduleARecords)) {
      logger.warn('buildScheduleAIndex: scheduleARecords is not an array');
      return index;
    }
    
    if (!Array.isArray(allEINs) || allEINs.length === 0) {
      logger.warn('buildScheduleAIndex: allEINs is not a valid array or is empty');
      return index;
    }
    
    let processedCount = 0;
    let skippedCount = 0;
    let healthDetectedCount = 0;
    let textAnalysisUsedCount = 0;
    
    for (const record of scheduleARecords) {
      if (!record) {
        skippedCount++;
        continue; // Skip null/undefined records
      }
      
      const recordEIN = record.sch_a_ein;
      const planNum = record.sch_a_plan_num;
      const beginYear = this.extractYear(record.sch_a_plan_year_begin_date);
      const endYear = this.extractYear(record.sch_a_plan_year_end_date);
      
      logger.debug(`[DEBUG] Processing Schedule A record: EIN=${recordEIN}, Plan=${planNum}, BeginYear=${beginYear}, EndYear=${endYear}`);
      
      // Skip if record has no plan number
      if (!planNum) {
        logger.debug(`[DEBUG] Skipping record - no plan number`);
        skippedCount++;
        continue;
      }
      
      // Step 1: Try database indicators first (existing logic)
      let hasHealth = record.wlfr_bnft_health_ind === 1;
      let hasStopLoss = record.wlfr_bnft_stop_loss_ind === 1;
      
      logger.debug(`[DEBUG] Initial indicators: hasHealth=${hasHealth}, hasStopLoss=${hasStopLoss}`);
      
      // Step 2: FALLBACK - Analyze raw text fields when database indicators are false/missing
      if (!hasHealth && record.wlfr_type_bnft_oth_text) {
        logger.debug(`[DEBUG] Trying text analysis fallback for text: "${record.wlfr_type_bnft_oth_text}"`);
        hasHealth = this.isHealthBenefitText(record.wlfr_type_bnft_oth_text);
        if (hasHealth) {
          logger.debug(`Text-based health detection for EIN ${recordEIN}, plan ${planNum}: "${record.wlfr_type_bnft_oth_text}"`);
          textAnalysisUsedCount++;
        }
      }
      
      if (!hasStopLoss && record.wlfr_type_bnft_oth_text) {
        hasStopLoss = this.isStopLossBenefitText(record.wlfr_type_bnft_oth_text);
        if (hasStopLoss) {
          logger.debug(`Text-based stop-loss detection for EIN ${recordEIN}, plan ${planNum}: "${record.wlfr_type_bnft_oth_text}"`);
          textAnalysisUsedCount++;
        }
      }
      
      if (hasHealth) healthDetectedCount++;
      
      // Step 3: Apply enhanced indicators to index (preserve existing structure)
      // Use the first available EIN from our company EINs if record EIN is missing
      const keyEIN = recordEIN || allEINs[0] || 'unknown';
      
      if (beginYear && planNum) {
        const key = `${keyEIN}-${planNum}-${beginYear}`;
        if (!index.byBeginYear.has(key)) {
          index.byBeginYear.set(key, { health: false, stopLoss: false });
        }
        const entry = index.byBeginYear.get(key);
        if (hasHealth) entry.health = true;
        if (hasStopLoss) entry.stopLoss = true;
      }
      
      if (endYear && planNum && endYear !== beginYear) {
        const key = `${keyEIN}-${planNum}-${endYear}`;
        if (!index.byEndYear.has(key)) {
          index.byEndYear.set(key, { health: false, stopLoss: false });
        }
        const entry = index.byEndYear.get(key);
        if (hasHealth) entry.health = true;
        if (hasStopLoss) entry.stopLoss = true;
      }
      
      processedCount++;
    }
    
    logger.info(`[DEBUG] Schedule A index built - Processed: ${processedCount}, Skipped: ${skippedCount}, Health detected: ${healthDetectedCount}, Text analysis used: ${textAnalysisUsedCount}`);
    logger.info(`[DEBUG] Index contains ${index.byBeginYear.size} begin-year entries and ${index.byEndYear.size} end-year entries`);
    
    // Log all index keys for debugging
    const beginKeys = Array.from(index.byBeginYear.keys());
    const healthKeys = beginKeys.filter(key => index.byBeginYear.get(key).health);
    logger.info(`[DEBUG] All Schedule A index keys: [${beginKeys.join(', ')}]`);
    logger.info(`[DEBUG] Keys with health=true: [${healthKeys.join(', ')}]`);
    
    return index;
  }

  /**
   * Classify a single plan using the algorithm logic
   * @param {Object} form5500Record - Form 5500 record
   * @param {Object} scheduleAIndex - Schedule A index
   * @returns {Object} Classification result with reasons
   */
  classifyPlan(form5500Record, scheduleAIndex) {
    const reasons = [];
    const planNum = form5500Record.spons_dfe_pn;
    const typeWelfareCode = form5500Record.type_welfare_bnft_code || '';
    const beginYear = this.extractYear(form5500Record.form_plan_year_begin_date);
    const endYear = this.extractYear(form5500Record.form_tax_prd);
    const ein = form5500Record.ein || '';
    
    logger.debug(`[DEBUG] Classifying plan: EIN=${ein}, PlanNum=${planNum}, BeginYear=${beginYear}, EndYear=${endYear}, WelfareCode="${typeWelfareCode}"`);
    
    // Step 1: Check if this is a medical plan
    const has4A = typeWelfareCode.includes('4A');
    let hasScheduleAHealth = false;
    let hasScheduleAStopLoss = false;
    
    logger.debug(`[DEBUG] Plan ${planNum}: has4A=${has4A} (welfare code="${typeWelfareCode}")`);
    
    
    // Check Schedule A for health/stop-loss indicators
    if (ein && planNum && beginYear) {
      const beginKey = `${ein}-${planNum}-${beginYear}`;
      logger.info(`[DEBUG] Looking for Schedule A key: "${beginKey}"`);
      const beginEntry = scheduleAIndex.byBeginYear.get(beginKey);
      if (beginEntry) {
        logger.info(`[DEBUG] Found begin entry: health=${beginEntry.health}, stopLoss=${beginEntry.stopLoss}`);
        hasScheduleAHealth = hasScheduleAHealth || beginEntry.health;
        hasScheduleAStopLoss = hasScheduleAStopLoss || beginEntry.stopLoss;
      } else {
        logger.info(`[DEBUG] No begin entry found for key: "${beginKey}"`);
      }
    }
    
    if (ein && planNum && endYear && endYear !== beginYear) {
      const endKey = `${ein}-${planNum}-${endYear}`;
      logger.debug(`[DEBUG] Checking Schedule A end key: "${endKey}"`);
      const endEntry = scheduleAIndex.byEndYear.get(endKey);
      if (endEntry) {
        logger.debug(`[DEBUG] Found end entry: health=${endEntry.health}, stopLoss=${endEntry.stopLoss}`);
        hasScheduleAHealth = hasScheduleAHealth || endEntry.health;
        hasScheduleAStopLoss = hasScheduleAStopLoss || endEntry.stopLoss;
      } else {
        logger.debug(`[DEBUG] No end entry found for key: "${endKey}"`);
      }
    }
    
    logger.debug(`[DEBUG] Plan ${planNum} medical plan check: has4A=${has4A}, hasScheduleAHealth=${hasScheduleAHealth}`);
    
    // Skip non-medical plans
    if (!has4A && !hasScheduleAHealth) {
      logger.info(`[DEBUG] Plan ${planNum} SKIPPED - not a medical plan (no 4A code and no Schedule A health indicators)`);
      return null; // Not a medical plan
    }
    
    logger.info(`[DEBUG] Plan ${planNum} is a medical plan - proceeding with classification`);
    
    
    // Step 2: Apply classification logic (following Python script priority order)
    const benefitInsurance = form5500Record.benefit_insurance_ind === 1;
    const benefitGenAssets = form5500Record.benefit_gen_asset_ind === 1;
    const fundingInsurance = form5500Record.funding_insurance_ind === 1;
    const fundingGenAssets = form5500Record.funding_gen_asset_ind === 1;
    
    const hasScheduleA = form5500Record.sch_a_attached_ind === 1 || 
                        (form5500Record.num_sch_a_attached_cnt || 0) > 0;
    
    // Priority 1: Schedule A shows health coverage
    if (hasScheduleAHealth) {
      reasons.push('Schedule A shows health/medical coverage');
      if (benefitInsurance || fundingInsurance) {
        reasons.push('Header insurance arrangement flags present');
      }
      return {
        classification: 'Insured',
        reasons,
        metadata: { planNum, beginYear, endYear, ein }
      };
    }
    
    // Priority 2: Schedule A shows stop-loss but no health
    if (hasScheduleAStopLoss && !hasScheduleAHealth) {
      reasons.push('Schedule A shows stop-loss but no medical');
      if (benefitGenAssets || fundingGenAssets) {
        reasons.push('Header general-assets arrangement present');
      }
      return {
        classification: 'Self-funded w/ stop-loss',
        reasons,
        metadata: { planNum, beginYear, endYear, ein }
      };
    }
    
    // Priority 3: Header indicates general assets
    if (benefitGenAssets || fundingGenAssets) {
      reasons.push('Header indicates general assets funding/benefit');
      if (hasScheduleA) {
        reasons.push('Schedule A attached (non-medical or unknown)');
        return {
          classification: 'Likely self-funded (non-medical Schedule A)',
          reasons,
          metadata: { planNum, beginYear, endYear, ein }
        };
      }
      return {
        classification: 'Self-funded',
        reasons,
        metadata: { planNum, beginYear, endYear, ein }
      };
    }
    
    // Priority 4: Header indicates insurance but no Schedule A health
    if (benefitInsurance || fundingInsurance) {
      reasons.push('Header indicates insurance arrangement but no SA health flag found');
      return {
        classification: 'Likely insured (needs Sched A verification)',
        reasons,
        metadata: { planNum, beginYear, endYear, ein }
      };
    }
    
    // Priority 5: Schedule A attached but unclear
    if (hasScheduleA) {
      reasons.push('Schedule A attached but lacks health/stop-loss flags for this plan-year');
      return {
        classification: 'Indeterminate (needs Sched A detail)',
        reasons,
        metadata: { planNum, beginYear, endYear, ein }
      };
    }
    
    // Default: Likely self-funded
    reasons.push('No Sched A and no clear arrangement flags');
    return {
      classification: 'Likely self-funded (absence of health Schedule A)',
      reasons,
      metadata: { planNum, beginYear, endYear, ein }
    };
  }

  /**
   * Roll up individual plan classifications to company level
   * @param {Array} planClassifications - Array of plan classification strings
   * @returns {string} Company-level classification
   */
  rollUpCompanyClassification(planClassifications) {
    if (planClassifications.length === 0) {
      return 'no-medical-plans';
    }
    
    // Following Python script logic: "Self-funded (at least one plan)" if any plan is self-funded
    const hasSelfFunded = planClassifications.some(c => 
      c.startsWith('Self-funded') || c.startsWith('Likely self-funded')
    );
    
    if (hasSelfFunded) {
      return 'self-funded';
    }
    
    const hasInsured = planClassifications.some(c => 
      c === 'Insured' || c.startsWith('Likely insured')
    );
    
    if (hasInsured) {
      return 'insured';
    }
    
    return 'indeterminate';
  }

  /**
   * Generate summary of yearly classifications with trend analysis
   * @param {Array} yearlyClassifications - Array of {year, classification} objects
   * @returns {Object} Summary object
   */
  generateYearlySummary(yearlyClassifications) {
    const years = yearlyClassifications.map(yc => yc.year).sort();
    
    const selfFundedYears = [];
    const insuredYears = [];
    const indeterminateYears = [];
    
    yearlyClassifications.forEach(yc => {
      if (yc.classification === 'self-funded' || yc.classification.includes('self-funded')) {
        selfFundedYears.push(yc.year);
      } else if (yc.classification === 'insured' || yc.classification.includes('insured')) {
        insuredYears.push(yc.year);
      } else {
        indeterminateYears.push(yc.year);
      }
    });
    
    // Generate trend description
    const trend = this.generateTrendDescription(yearlyClassifications);
    
    return {
      years_available: years,
      self_funded_years: selfFundedYears.sort(),
      insured_years: insuredYears.sort(),
      indeterminate_years: indeterminateYears.sort(),
      trend: trend
    };
  }

  /**
   * Generate human-readable trend description
   * @param {Array} yearlyClassifications - Array of {year, classification} objects  
   * @returns {string} Trend description
   */
  generateTrendDescription(yearlyClassifications) {
    if (yearlyClassifications.length === 0) return 'no-data';
    if (yearlyClassifications.length === 1) return yearlyClassifications[0].classification;
    
    // Sort by year
    const sorted = yearlyClassifications
      .sort((a, b) => parseInt(a.year) - parseInt(b.year))
      .map(yc => this.simplifyClassification(yc.classification));
    
    return sorted.join(' → ');
  }

  /**
   * Simplify classification for trend display
   * @param {string} classification - Full classification
   * @returns {string} Simplified classification
   */
  simplifyClassification(classification) {
    if (classification.includes('self-funded')) return 'self-funded';
    if (classification.includes('insured')) return 'insured';
    return classification;
  }

  /**
   * Extract year from date string or Date object
   * @param {string|Date} date - Date to extract year from
   * @returns {string|null} Year string or null
   */
  extractYear(date) {
    if (!date) return null;
    if (date instanceof Date) {
      return date.getFullYear().toString();
    }
    const dateStr = date.toString();
    if (dateStr.length >= 4) {
      return dateStr.substring(0, 4);
    }
    return null;
  }
}

module.exports = SelfFundedClassifierService;