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
        const classification = await this.classifyCompany(company);
        // Quick access field (same as current_classification)
        company.form5500_data.self_funded = classification.current_classification;
        // Detailed analysis
        company.form5500_data.self_funded_analysis = classification;
        logger.debug(`✓ Classified ${company.legal_entity_name}: ${classification.current_classification} (${classification.summary.years_available.length} years)`);
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
    const ein = company.form5500_data.ein;
    const legalEntityName = company.legal_entity_name;
    
    // Get raw Form 5500 and Schedule A data for classification
    // Note: get_form5500_for_classification expects company name, not EIN
    const form5500Records = await this.databaseManager.query(
      'SELECT * FROM get_form5500_for_classification($1)',
      [legalEntityName]
    );
    
    const scheduleARecords = await this.databaseManager.query(
      'SELECT * FROM get_schedule_a_for_classification($1)', 
      [ein]
    );
    
    if (form5500Records.rows.length === 0) {
      return {
        current_classification: 'no-data',
        classifications_by_year: {},
        summary: {
          years_available: [],
          message: 'No Form 5500 records found for this EIN'
        }
      };
    }
    
    // Build Schedule A index by plan and year
    const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords.rows, ein);
    
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
   * Test classification for a single company name (for test endpoint)
   * @param {string} companyName - Company name to search and classify
   * @returns {Object} Classification results with year-by-year breakdown and raw data
   */
  async testClassifyCompany(companyName) {
    logger.info(`🔍 Testing self-funded classification for: ${companyName}`);
    
    try {
      // Get raw Form 5500 data by company name
      const form5500Result = await this.databaseManager.query(
        'SELECT * FROM get_form5500_for_classification($1)',
        [companyName]
      );
      
      const form5500Records = form5500Result.rows;
      
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
      
      // Get EINs and Schedule A data
      const eins = [...new Set(form5500Records.map(r => r.ein).filter(ein => ein))];
      const scheduleARecords = [];
      for (const ein of eins) {
        const scheduleAResult = await this.databaseManager.query(
          'SELECT * FROM get_schedule_a_for_classification($1)',
          [ein]
        );
        scheduleARecords.push(...scheduleAResult.rows);
      }
      
      // Create a mock company object to reuse existing classification logic
      const mockCompany = {
        legal_entity_name: companyName,
        form5500_data: { ein: eins[0] } // Use first EIN found
      };
      
      // Build Schedule A index and classify manually (since we have raw data)
      const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords, eins[0]);
      
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
   * Build Schedule A index for efficient lookups
   * @param {Array} scheduleARecords - Raw Schedule A records
   * @param {string} ein - The EIN these records belong to
   * @returns {Object} Indexed Schedule A data
   */
  buildScheduleAIndex(scheduleARecords, ein) {
    const index = {
      byBeginYear: new Map(),
      byEndYear: new Map()
    };
    
    for (const record of scheduleARecords) {
      const planNum = record.sch_a_plan_num;
      const beginYear = this.extractYear(record.sch_a_plan_year_begin_date);
      const endYear = this.extractYear(record.sch_a_plan_year_end_date);
      
      if (beginYear && planNum && ein) {
        const key = `${ein}-${planNum}-${beginYear}`;
        if (!index.byBeginYear.has(key)) {
          index.byBeginYear.set(key, { health: false, stopLoss: false });
        }
        const entry = index.byBeginYear.get(key);
        if (record.wlfr_bnft_health_ind === 1) entry.health = true;
        if (record.wlfr_bnft_stop_loss_ind === 1) entry.stopLoss = true;
      }
      
      if (endYear && planNum && ein && endYear !== beginYear) {
        const key = `${ein}-${planNum}-${endYear}`;
        if (!index.byEndYear.has(key)) {
          index.byEndYear.set(key, { health: false, stopLoss: false });
        }
        const entry = index.byEndYear.get(key);
        if (record.wlfr_bnft_health_ind === 1) entry.health = true;
        if (record.wlfr_bnft_stop_loss_ind === 1) entry.stopLoss = true;
      }
    }
    
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
    
    // Step 1: Check if this is a medical plan
    const has4A = typeWelfareCode.includes('4A');
    let hasScheduleAHealth = false;
    let hasScheduleAStopLoss = false;
    
    // Check Schedule A for health/stop-loss indicators
    if (ein && planNum && beginYear) {
      const beginKey = `${ein}-${planNum}-${beginYear}`;
      const beginEntry = scheduleAIndex.byBeginYear.get(beginKey);
      if (beginEntry) {
        hasScheduleAHealth = hasScheduleAHealth || beginEntry.health;
        hasScheduleAStopLoss = hasScheduleAStopLoss || beginEntry.stopLoss;
      }
    }
    
    if (ein && planNum && endYear && endYear !== beginYear) {
      const endKey = `${ein}-${planNum}-${endYear}`;
      const endEntry = scheduleAIndex.byEndYear.get(endKey);
      if (endEntry) {
        hasScheduleAHealth = hasScheduleAHealth || endEntry.health;
        hasScheduleAStopLoss = hasScheduleAStopLoss || endEntry.stopLoss;
      }
    }
    
    // Skip non-medical plans
    if (!has4A && !hasScheduleAHealth) {
      return null; // Not a medical plan
    }
    
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