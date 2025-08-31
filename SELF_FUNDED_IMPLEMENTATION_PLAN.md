# Self-Funded Classification Implementation Plan

## Overview

This document outlines the complete implementation plan for adding self-funded classification functionality to the Smart Insurance application. The implementation will classify each company's health insurance plans as "insured", "self-funded", or "partially-self-funded" based on Form 5500 and Schedule A data.

## Current System Analysis

### Existing Architecture

**DataExtractionService.js** - Main orchestrator
- `extractData(pipelineId)` - Main entry point
- `mapResultsToCompanies(originalCompanies, reportData)` - Maps results back to companies
- Uses Form5500SearchService, ScheduleASearchService, and ReportGenerator

**Form5500SearchService.js**
- `searchCompanies(companyNames)` - Searches multiple companies
- `searchSingleCompany(companyName)` - Searches single company via database
- `extractEINFromRecord(record)` - Extracts EIN from database records
- `extractEINs(searchResults)` - Filters companies with valid EINs

**ScheduleASearchService.js**
- `searchEINs(companiesWithEIN)` - Searches Schedule A by EINs
- `searchSingleEIN(ein)` - Single EIN search via database
- `formatDatabaseRecord(dbRecord, recordNumber)` - Formats DB record to CSV-like structure
- `extractKeyFields(record)` - Extracts key Schedule A fields for reporting

**DatabaseManager.js**
- `searchCompaniesByName(companyName)` - Uses `search_companies_by_name()` function
- `getScheduleAByEIN(ein)` - Uses `get_schedule_a_by_ein()` function

**ReportGenerator.js**
- `generateFinalReport(searchResults)` - Creates final JSON report
- `formatScheduleADetails(schADetails)` - Formats Schedule A for output

### Current Data Flow

1. **Input**: Pipeline with company legal entity names
2. **Form 5500 Search**: Find companies in database using `search_companies_by_name()`
3. **EIN Extraction**: Extract EINs from Form 5500 records
4. **Schedule A Search**: Find Schedule A records using `get_schedule_a_by_ein()`
5. **Report Generation**: Create JSON report with all data
6. **Output**: Companies array with `form5500_data` structure:

```javascript
company.form5500_data = {
  ein: "123456789",
  form5500: {
    years: ["2023", "2024"],
    recordCount: 3,
    records: {
      "2023": [{ year, sponsor_name, ein, plan_name, active_participants, has_schedule_a }]
    }
  },
  scheduleA: {
    recordCounts: { "2023": 2 },
    details: {
      "2023": [{ carrierName, personsCovered, brokerCommission, benefitType, totalCharges }]
    },
    error: null
  }
}
```

### Database Schema Analysis

**form_5500_records table** - Contains these key fields for classification:
- `type_welfare_bnft_code` - Contains "4A" for health plans
- `funding_insurance_ind` - Insurance funding indicator (0/1)
- `benefit_insurance_ind` - Insurance benefit indicator (0/1)  
- `sch_a_attached_ind` - Schedule A attached indicator (0/1)
- `num_sch_a_attached_cnt` - Number of Schedule A attachments

**schedule_a_records table** - Contains these key fields:
- `wlfr_bnft_health_ind` - Health benefit indicator (0/1)
- Other welfare benefit indicators (dental, vision, etc.)

**❌ CRITICAL MISSING FIELDS** - Required by algorithm but not in current schema:
- `funding_gen_asset_ind` - General assets funding indicator
- `benefit_gen_asset_ind` - General assets benefit indicator  
- `wlfr_bnft_stop_loss_ind` - Stop-loss benefit indicator

**Current database functions return limited data:**
- `search_companies_by_name()` returns: year, sponsor_name, ein, plan_name, active_participants, has_schedule_a
- `get_schedule_a_by_ein()` returns: year, carrier_name, persons_covered, broker_commission, total_charges, benefit_types

## Implementation Plan

### Phase 1: Database Schema Enhancement

**1.1 Update create-tables.sql with Missing Fields**

Update `/database/create-tables.sql` to include the missing fields in the table definitions:

For `form_5500_records` table, add after line 58:
```sql
funding_gen_asset_ind INTEGER DEFAULT 0,
benefit_gen_asset_ind INTEGER DEFAULT 0,
```

For `schedule_a_records` table, add after line 131:
```sql
wlfr_bnft_stop_loss_ind INTEGER DEFAULT 0,
```

**1.2 Create New Database Functions**

Create `get_raw_form5500_for_classification(ein, year)` function:
```sql
CREATE OR REPLACE FUNCTION get_raw_form5500_for_classification(ein_param VARCHAR(9), year_param INTEGER DEFAULT NULL)
RETURNS TABLE (
    year INTEGER,
    ack_id VARCHAR(255),
    spons_dfe_pn INTEGER,
    form_plan_year_begin_date DATE,
    form_tax_prd DATE,
    type_welfare_bnft_code VARCHAR(255),
    funding_insurance_ind INTEGER,
    funding_gen_asset_ind INTEGER,
    benefit_insurance_ind INTEGER,
    benefit_gen_asset_ind INTEGER,
    sch_a_attached_ind INTEGER,
    num_sch_a_attached_cnt INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.year,
        f.ack_id,
        f.spons_dfe_pn,
        f.form_plan_year_begin_date,
        f.form_tax_prd,
        f.type_welfare_bnft_code,
        f.funding_insurance_ind,
        f.funding_gen_asset_ind,
        f.benefit_insurance_ind,
        f.benefit_gen_asset_ind,
        f.sch_a_attached_ind,
        f.num_sch_a_attached_cnt
    FROM form_5500_records f
    WHERE f.spons_dfe_ein = ein_param
    AND (year_param IS NULL OR f.year = year_param)
    ORDER BY f.year DESC, f.ack_id;
END;
$$ LANGUAGE plpgsql;
```

Create `get_raw_schedule_a_for_classification(ein, year)` function:
```sql
CREATE OR REPLACE FUNCTION get_raw_schedule_a_for_classification(ein_param VARCHAR(9), year_param INTEGER DEFAULT NULL)
RETURNS TABLE (
    year INTEGER,
    ack_id VARCHAR(255),
    sch_a_plan_num INTEGER,
    sch_a_plan_year_begin_date DATE,
    sch_a_plan_year_end_date DATE,
    wlfr_bnft_health_ind INTEGER,
    wlfr_bnft_stop_loss_ind INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.year,
        s.ack_id,
        s.sch_a_plan_num,
        s.sch_a_plan_year_begin_date,
        s.sch_a_plan_year_end_date,
        s.wlfr_bnft_health_ind,
        s.wlfr_bnft_stop_loss_ind
    FROM schedule_a_records s
    WHERE s.sch_a_ein = ein_param
    AND (year_param IS NULL OR s.year = year_param)
    ORDER BY s.year DESC, s.ack_id, s.sch_a_plan_num;
END;
$$ LANGUAGE plpgsql;
```

### Phase 2: Create SelfFundedClassifierService

**2.1 Create New Service Class**

Create `/server/data-extraction/SelfFundedClassifierService.js`:

```javascript
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
        company.form5500_data.self_funded = {
          current_classification: null,
          classifications_by_year: {},
          summary: { years_available: [], message: 'No Form 5500 data available' }
        };
        continue;
      }
      
      try {
        const classification = await this.classifyCompany(company);
        company.form5500_data.self_funded = classification;
        logger.debug(`✓ Classified ${company.legal_entity_name}: ${classification.current_classification} (${classification.summary.years_available.length} years)`);
      } catch (error) {
        logger.error(`❌ Error classifying ${company.legal_entity_name}:`, error.message);
        company.form5500_data.self_funded = {
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
    
    // Get raw Form 5500 and Schedule A data for classification
    const form5500Records = await this.databaseManager.query(
      'SELECT * FROM get_raw_form5500_for_classification($1)',
      [ein]
    );
    
    const scheduleARecords = await this.databaseManager.query(
      'SELECT * FROM get_raw_schedule_a_for_classification($1)', 
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
    const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords.rows);
    
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
            plan_name: form5500Record.plan_name,
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
   * Build Schedule A index for efficient lookups
   * @param {Array} scheduleARecords - Raw Schedule A records
   * @returns {Object} Indexed Schedule A data
   */
  buildScheduleAIndex(scheduleARecords) {
    const index = {
      byBeginYear: new Map(),
      byEndYear: new Map()
    };
    
    for (const record of scheduleARecords) {
      const planNum = record.sch_a_plan_num;
      const beginYear = this.extractYear(record.sch_a_plan_year_begin_date);
      const endYear = this.extractYear(record.sch_a_plan_year_end_date);
      
      if (beginYear) {
        const key = `${planNum}-${beginYear}`;
        if (!index.byBeginYear.has(key)) {
          index.byBeginYear.set(key, { health: false, stopLoss: false });
        }
        const entry = index.byBeginYear.get(key);
        if (record.wlfr_bnft_health_ind === 1) entry.health = true;
        if (record.wlfr_bnft_stop_loss_ind === 1) entry.stopLoss = true;
      }
      
      if (endYear) {
        const key = `${planNum}-${endYear}`;
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
    
    // Step 1: Check if this is a medical plan
    const has4A = typeWelfareCode.includes('4A');
    let hasScheduleAHealth = false;
    let hasScheduleAStopLoss = false;
    
    // Check Schedule A for health/stop-loss indicators
    if (planNum && beginYear) {
      const beginEntry = scheduleAIndex.byBeginYear.get(`${planNum}-${beginYear}`);
      if (beginEntry) {
        hasScheduleAHealth = hasScheduleAHealth || beginEntry.health;
        hasScheduleAStopLoss = hasScheduleAStopLoss || beginEntry.stopLoss;
      }
    }
    
    if (planNum && endYear && endYear !== beginYear) {
      const endEntry = scheduleAIndex.byEndYear.get(`${planNum}-${endYear}`);
      if (endEntry) {
        hasScheduleAHealth = hasScheduleAHealth || endEntry.health;
        hasScheduleAStopLoss = hasScheduleAStopLoss || endEntry.stopLoss;
      }
    }
    
    // Skip non-medical plans
    if (!has4A && !hasScheduleAHealth) {
      return null; // Not a medical plan
    }
    
    // Step 2: Apply classification logic
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
        metadata: { planNum, beginYear, endYear }
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
        metadata: { planNum, beginYear, endYear }
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
          metadata: { planNum, beginYear, endYear }
        };
      }
      return {
        classification: 'Self-funded',
        reasons,
        metadata: { planNum, beginYear, endYear }
      };
    }
    
    // Priority 4: Header indicates insurance but no Schedule A health
    if (benefitInsurance || fundingInsurance) {
      reasons.push('Header indicates insurance arrangement but no SA health flag found');
      return {
        classification: 'Likely insured (needs Sched A verification)',
        reasons,
        metadata: { planNum, beginYear, endYear }
      };
    }
    
    // Priority 5: Schedule A attached but unclear
    if (hasScheduleA) {
      reasons.push('Schedule A attached but lacks health/stop-loss flags for this plan-year');
      return {
        classification: 'Indeterminate (needs Sched A detail)',
        reasons,
        metadata: { planNum, beginYear, endYear }
      };
    }
    
    // Default: Likely self-funded
    reasons.push('No Sched A and no clear arrangement flags');
    return {
      classification: 'Likely self-funded (absence of health Schedule A)',
      reasons,
      metadata: { planNum, beginYear, endYear }
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
    
    const hasSelfFunded = planClassifications.some(c => 
      c.startsWith('Self-funded') || c.startsWith('Likely self-funded')
    );
    
    const hasInsured = planClassifications.some(c => 
      c === 'Insured' || c.startsWith('Likely insured')
    );
    
    if (hasSelfFunded && hasInsured) {
      return 'partially-self-funded';
    } else if (hasSelfFunded) {
      return 'self-funded';
    } else if (hasInsured) {
      return 'insured';
    } else {
      return 'indeterminate';
    }
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
```

### Phase 3: Database Manager Integration

**3.1 Add New Methods to DatabaseManager.js**

Add these methods to the DatabaseManager class:

```javascript
/**
 * Get raw Form 5500 data for self-funded classification
 * @param {string} ein - EIN to search for
 * @param {number} year - Optional year filter
 * @returns {Array} Raw Form 5500 records for classification
 */
async getRawForm5500ForClassification(ein, year = null) {
  try {
    const cleanEIN = ein.replace(/\D/g, '');
    
    if (cleanEIN.length !== 9) {
      throw new Error(`Invalid EIN: ${ein} (must be 9 digits)`);
    }

    const result = await this.query(
      'SELECT * FROM get_raw_form5500_for_classification($1, $2)',
      [cleanEIN, year]
    );
    
    return result.rows;
  } catch (error) {
    logger.error(`❌ Error getting raw Form 5500 data for EIN "${ein}":`, error.message);
    throw error;
  }
}

/**
 * Get raw Schedule A data for self-funded classification
 * @param {string} ein - EIN to search for  
 * @param {number} year - Optional year filter
 * @returns {Array} Raw Schedule A records for classification
 */
async getRawScheduleAForClassification(ein, year = null) {
  try {
    const cleanEIN = ein.replace(/\D/g, '');
    
    if (cleanEIN.length !== 9) {
      throw new Error(`Invalid EIN: ${ein} (must be 9 digits)`);
    }

    const result = await this.query(
      'SELECT * FROM get_raw_schedule_a_for_classification($1, $2)',
      [cleanEIN, year]
    );
    
    return result.rows;
  } catch (error) {
    logger.error(`❌ Error getting raw Schedule A data for EIN "${ein}":`, error.message);
    throw error;
  }
}
```

### Phase 4: Integration with DataExtractionService

**4.1 Modify DataExtractionService.js**

Add the SelfFundedClassifierService and integrate it into the extraction pipeline:

```javascript
const SelfFundedClassifierService = require('./SelfFundedClassifierService');

class DataExtractionService {
  constructor() {
    // ... existing constructor code ...
    this.selfFundedClassifierService = new SelfFundedClassifierService();
  }

  async extractData(pipelineId) {
    try {
      // ... existing extraction logic through Phase 4 (Generate comprehensive reports) ...
      
      // Phase 5: Classify companies as self-funded/insured
      logger.info('🔍 Classifying companies as self-funded or insured...');
      const companiesWithSelfFundedData = await this.selfFundedClassifierService.classifyCompanies(reportData.companies);
      
      // Update report data with classifications
      reportData.companies = companiesWithSelfFundedData;
      
      // Phase 6: Map results back to companies structure (existing code)
      const companiesWithForm5500 = this.mapResultsToCompanies(pipeline.companies, reportData);

      // ... rest of existing method ...
    } catch (error) {
      // ... existing error handling ...
    }
  }
}
```

### Phase 5: Testing and Validation

**5.1 Create Test Script**

Create `/tests/test-self-funded-classifier.js`:

```javascript
const SelfFundedClassifierService = require('../server/data-extraction/SelfFundedClassifierService');
const DatabaseManager = require('../server/data-extraction/DatabaseManager');

async function testClassifier() {
  const classifier = new SelfFundedClassifierService();
  const dbManager = DatabaseManager.getInstance();
  
  try {
    await dbManager.initialize();
    
    // Test with mock company data
    const testCompanies = [
      {
        name: 'Test Company 1',
        legal_entity_name: 'TEST COMPANY 1 LLC',
        form5500_data: {
          ein: '123456789',
          form5500: { /* existing structure */ },
          scheduleA: { /* existing structure */ }
        }
      }
    ];
    
    console.log('🧪 Testing self-funded classifier...');
    const classified = await classifier.classifyCompanies(testCompanies);
    
    for (const company of classified) {
      console.log(`${company.legal_entity_name}: ${company.form5500_data.self_funded}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await dbManager.close();
  }
}

if (require.main === module) {
  testClassifier();
}

module.exports = testClassifier;
```

## Database Schema Updates Required

The current database schema is **missing critical fields** required by the algorithm. Since this is test data, we can simply update the schema directly:

### form_5500_records table additions:
```sql
-- Add to existing CREATE TABLE statement in create-tables.sql
funding_gen_asset_ind INTEGER DEFAULT 0,
benefit_gen_asset_ind INTEGER DEFAULT 0,
```

### schedule_a_records table additions:
```sql
-- Add to existing CREATE TABLE statement in create-tables.sql  
wlfr_bnft_stop_loss_ind INTEGER DEFAULT 0,
```

### New database functions:
- `get_raw_form5500_for_classification(ein, year)`
- `get_raw_schedule_a_for_classification(ein, year)`

## Files to Modify

### New Files:
1. `/server/data-extraction/SelfFundedClassifierService.js` - New classifier service
2. `/tests/test-self-funded-classifier.js` - Test script

### Modified Files:
1. `/server/data-extraction/DataExtractionService.js` - Integration point
2. `/server/data-extraction/DatabaseManager.js` - Add new query methods
3. `/database/create-tables.sql` - Add new fields and functions

## Expected Output Format

After implementation, each company will have a detailed `self_funded` field in their `form5500_data` with year-by-year breakdown:

```javascript
company.form5500_data = {
  ein: "123456789",
  form5500: { /* existing structure */ },
  scheduleA: { /* existing structure */ },
  self_funded: {
    current_classification: "self-funded", // Most recent year
    classifications_by_year: {
      "2024": {
        classification: "self-funded",
        plans: [
          {
            plan_name: "Company Health Plan",
            ein: "123456789",
            classification: "Self-funded",
            reasons: ["Header indicates general assets funding/benefit"],
            metadata: { planNum: 1, beginYear: "2024", endYear: "2024" }
          }
        ]
      },
      "2023": {
        classification: "insured",
        plans: [
          {
            plan_name: "Company Health Plan",
            ein: "123456789",
            classification: "Insured",
            reasons: ["Schedule A shows health/medical coverage"],
            metadata: { planNum: 1, beginYear: "2023", endYear: "2023" }
          }
        ]
      }
    },
    summary: {
      years_available: ["2024", "2023"],
      self_funded_years: ["2024"],
      insured_years: ["2023"],
      indeterminate_years: [],
      trend: "insured → self-funded"
    }
  }
}
```

**Possible `current_classification` values:**
- `"insured"` - Company currently uses insured health plans
- `"self-funded"` - Company currently uses self-funded health plans  
- `"partially-self-funded"` - Company has mix of insured and self-funded plans
- `"indeterminate"` - Cannot determine classification from available data
- `"no-medical-plans"` - No medical/health plans found
- `"no-data"` - No Form 5500 data available
- `"error"` - Classification failed due to error

## Implementation Timeline

1. **Phase 1** (Database): Update schema with missing fields and functions - 0.5 days
2. **Phase 2** (Service): Create SelfFundedClassifierService - 2 days  
3. **Phase 3** (Integration): Add DatabaseManager methods - 0.5 days
4. **Phase 4** (Pipeline): Integrate with DataExtractionService - 0.5 days
5. **Phase 5** (Testing): Create tests and validate - 1 day

**Total: 4.5 days**

## Risk Assessment

**High Risk:**
- Algorithm complexity may need refinement based on real data

**Medium Risk:**
- Performance impact of additional database queries
- Edge cases in date/year handling

**Low Risk:**  
- Integration with existing pipeline (well-defined interfaces)
- Service architecture follows existing patterns

## Next Steps

1. **Immediate**: Review and approve this implementation plan
2. **Database Setup**: Update create-tables.sql with missing fields and rebuild database
3. **Development**: Implement SelfFundedClassifierService following this specification
4. **Testing**: Validate against known company data
5. **Integration**: Add to DataExtractionService pipeline
6. **Deployment**: Ready for production use

This plan provides a complete, production-ready implementation that integrates seamlessly with your existing architecture while adding the powerful self-funded classification capability you need.

## Testing

Before implementing the full production system, we need to validate the algorithm with a test endpoint that provides detailed year-by-year classification breakdown.

### Test Endpoint Design

**URL**: `POST /api/testing/self-funded-classification`

**CURL Example**:
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" \
  -d '{"companyName": "Microsoft"}'
```

### Input/Output Format

**Input**:
```json
{
  "companyName": "Microsoft"
}
```

**Output** (Year-by-Year Breakdown):
```json
{
  "success": true,
  "company_name": "Microsoft",
  "classifications_by_year": {
    "2024": {
      "classification": "self-funded",
      "plans": [
        {
          "plan_name": "Microsoft Employee Health Plan",
          "ein": "123456789",
          "classification": "Self-funded",
          "reasons": ["Header indicates general assets funding/benefit"],
          "metadata": { "planNum": 1, "beginYear": "2024", "endYear": "2024" }
        }
      ]
    },
    "2023": {
      "classification": "insured", 
      "plans": [
        {
          "plan_name": "Microsoft Employee Health Plan",
          "ein": "123456789",
          "classification": "Insured",
          "reasons": ["Schedule A shows health/medical coverage"],
          "metadata": { "planNum": 1, "beginYear": "2023", "endYear": "2023" }
        }
      ]
    },
    "2022": {
      "classification": "self-funded",
      "plans": [
        {
          "plan_name": "Microsoft Employee Health Plan",
          "ein": "123456789", 
          "classification": "Self-funded w/ stop-loss",
          "reasons": ["Schedule A shows stop-loss but no medical"],
          "metadata": { "planNum": 1, "beginYear": "2022", "endYear": "2022" }
        }
      ]
    }
  },
  "current_classification": "self-funded",
  "summary": {
    "years_available": ["2024", "2023", "2022"],
    "self_funded_years": ["2024", "2022"],
    "insured_years": ["2023"],
    "indeterminate_years": [],
    "trend": "self-funded → insured → self-funded"
  },
  "raw_data": {
    "form5500_records": [...],
    "schedule_a_records": [...]
  },
  "metadata": {
    "execution_time_ms": 245,
    "timestamp": "2025-08-31T..."
  }
}
```

### Test Implementation Steps

#### Step 1: Update Database Schema for Testing
First, update `/database/create-tables.sql` to include missing fields and test functions:

**Add to form_5500_records table** (after line 58):
```sql
-- Fields needed for self-funded classification
funding_gen_asset_ind INTEGER DEFAULT 0,
benefit_gen_asset_ind INTEGER DEFAULT 0,
```

**Add to schedule_a_records table** (after line 131):
```sql
-- Field needed for self-funded classification  
wlfr_bnft_stop_loss_ind INTEGER DEFAULT 0,
```

**Add new database functions** (at the end):
```sql
-- Function to get raw Form 5500 data for classification
CREATE OR REPLACE FUNCTION get_form5500_for_classification(search_term TEXT)
RETURNS TABLE (
    year INTEGER,
    ack_id VARCHAR(255),
    spons_dfe_pn INTEGER,
    sponsor_name TEXT,
    plan_name TEXT,
    form_plan_year_begin_date DATE,
    form_tax_prd DATE,
    type_welfare_bnft_code VARCHAR(255),
    funding_insurance_ind INTEGER,
    funding_gen_asset_ind INTEGER,
    benefit_insurance_ind INTEGER,
    benefit_gen_asset_ind INTEGER,
    sch_a_attached_ind INTEGER,
    num_sch_a_attached_cnt INTEGER,
    ein VARCHAR(9)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.year,
        f.ack_id,
        f.spons_dfe_pn,
        f.sponsor_dfe_name::TEXT,
        f.plan_name::TEXT,
        f.form_plan_year_begin_date,
        f.form_tax_prd,
        f.type_welfare_bnft_code,
        f.funding_insurance_ind,
        f.funding_gen_asset_ind,
        f.benefit_insurance_ind,
        f.benefit_gen_asset_ind,
        f.sch_a_attached_ind,
        f.num_sch_a_attached_cnt,
        f.spons_dfe_ein
    FROM form_5500_records f
    WHERE LOWER(f.sponsor_dfe_name) LIKE LOWER('%' || search_term || '%')
    ORDER BY f.year DESC, f.sponsor_dfe_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get raw Schedule A data for classification
CREATE OR REPLACE FUNCTION get_schedule_a_for_classification(ein_param VARCHAR(9))
RETURNS TABLE (
    year INTEGER,
    ack_id VARCHAR(255),
    sch_a_plan_num INTEGER,
    sch_a_plan_year_begin_date DATE,
    sch_a_plan_year_end_date DATE,
    wlfr_bnft_health_ind INTEGER,
    wlfr_bnft_stop_loss_ind INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.year,
        s.ack_id,
        s.sch_a_plan_num,
        s.sch_a_plan_year_begin_date,
        s.sch_a_plan_year_end_date,
        s.wlfr_bnft_health_ind,
        s.wlfr_bnft_stop_loss_ind
    FROM schedule_a_records s
    WHERE s.sch_a_ein = ein_param
    ORDER BY s.year DESC, s.ack_id, s.sch_a_plan_num;
END;
$$ LANGUAGE plpgsql;
```

#### Step 2: Add Test Method to SelfFundedClassifierService
The production `SelfFundedClassifierService` from **Phase 2** already contains all the year-by-year classification logic. For testing, we just need to add one additional method that takes a company name instead of a company object:

**Add this method to the existing SelfFundedClassifierService**:
```javascript
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
        current_classification: 'no-data',
        classifications_by_year: {},
        summary: {
          years_available: [],
          message: 'No Form 5500 records found for this company'
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
    
    // Reuse existing classification method
    const classificationResult = await this.classifyCompany(mockCompany);
    
    // Return test-specific format with raw data included
    return {
      success: true,
      company_name: companyName,
      current_classification: classificationResult.current_classification,
      classifications_by_year: classificationResult.classifications_by_year,
      summary: classificationResult.summary,
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
```

#### Step 3: Add Test Route to Server
Add to `/server/routes/testing.js`:

```javascript
const SelfFundedClassifierService = require('../data-extraction/SelfFundedClassifierService');

// POST /api/testing/self-funded-classification
router.post('/self-funded-classification', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { companyName } = req.body;
    
    // Validate input
    if (!companyName || typeof companyName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'companyName string is required'
      });
    }
    
    logger.info(`🧪 Testing self-funded classification for company: ${companyName}`);
    
    // Initialize the classifier service
    const classifier = new SelfFundedClassifierService();
    
    // Execute the classification test
    const results = await classifier.testClassifyCompany(companyName);
    
    const executionTime = Date.now() - startTime;
    
    // Return results with metadata
    const response = {
      ...results,
      metadata: {
        ...results.metadata,
        execution_time_ms: executionTime,
        timestamp: new Date().toISOString()
      }
    };
    
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(response, null, 2));
    
  } catch (error) {
    logger.error('❌ Self-funded classification test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    });
  }
});
```

### Test Scenarios

Once implemented, test these scenarios:

#### 1. Company with Multi-Year Data
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" \
  -d '{"companyName": "Microsoft"}'
```
**Expected**: Year-by-year breakdown showing trends over time

#### 2. Company with Single Year
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" \
  -d '{"companyName": "SingleYearCompany"}'
```
**Expected**: Single year classification with no trend

#### 3. Non-Existent Company  
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" \
  -d '{"companyName": "NonExistentCompany"}'
```
**Expected**: `{"classifications_by_year": {}, "current_classification": "no-data"}`

#### 4. Company with Mixed Plans
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" \
  -d '{"companyName": "CompanyWithMultiplePlans"}'
```
**Expected**: Shows multiple plans per year with individual classifications

### Expected Trend Patterns

The test endpoint will reveal valuable patterns:

- **Consistent Strategy**: `"self-funded → self-funded → self-funded"`
- **Growth Transition**: `"insured → self-funded → self-funded"` (company grew, moved to self-funding)  
- **Market Response**: `"self-funded → insured → self-funded"` (temporary shift due to claims experience)
- **Cost Management**: `"insured → partially-self-funded → self-funded"` (gradual transition)

### Test Files to Modify

1. **Database Schema**: Update `/database/create-tables.sql` with missing fields and functions (same as Phase 1)
2. **Production Service**: Add `testClassifyCompany()` method to existing `/server/data-extraction/SelfFundedClassifierService.js` from Phase 2
3. **Test Route**: Add new route to `/server/routes/testing.js`

### Validation Checklist

- [ ] Algorithm correctly identifies medical plans (4A code + Schedule A health indicators)
- [ ] Classification logic matches Python script behavior
- [ ] Year-by-year grouping works correctly
- [ ] Trend analysis provides meaningful insights
- [ ] Raw data is included for manual verification
- [ ] Error handling for edge cases (no data, invalid company names)
- [ ] Performance is acceptable for single company queries

This testing approach will validate the algorithm behavior before full implementation and provide the year-by-year insights that PE firms need for their analysis.

## Progress

### ✅ Completed Tasks

**Phase 1: Database Schema Enhancement - COMPLETE**
- ✅ **Updated `create-tables.sql`** - Added missing fields to both tables:
  - `funding_gen_asset_ind` and `benefit_gen_asset_ind` to `form_5500_records` 
  - `wlfr_bnft_stop_loss_ind` to `schedule_a_records`
- ✅ **Added new database functions** for classification data retrieval:
  - `get_form5500_for_classification(search_term)` - Returns raw Form 5500 data with all classification fields
  - `get_schedule_a_for_classification(ein_param)` - Returns raw Schedule A data with health/stop-loss indicators
- ✅ **Updated `DataMapper.js`** - Added CSV column mappings:
  - `'FUNDING_GEN_ASSET_IND': 'funding_gen_asset_ind'`
  - `'BENEFIT_GEN_ASSET_IND': 'benefit_gen_asset_ind'` 
  - `'WLFR_BNFT_STOP_LOSS_IND': 'wlfr_bnft_stop_loss_ind'`
- ✅ **Database rebuild complete** - Tables dropped, recreated, and data reimported with new fields

**Research and Planning - COMPLETE**
- ✅ **Algorithm analysis** - Reviewed Python reference implementation and algorithm summary
- ✅ **System architecture review** - Analyzed existing data extraction services and database structure
- ✅ **CSV data mapping** - Identified exact column names from layout files
- ✅ **Year-by-year approach confirmed** - Unified test and production implementations

### 🚧 Current Status: Ready for Test Endpoint Implementation

**Next Immediate Task: Phase 2 Testing Implementation**
- 🔄 **Create test endpoint** - `POST /api/testing/self-funded-classification`
- 🔄 **Implement SelfFundedClassifierService** - Year-by-year classification logic
- 🔄 **Add test route** - Integration with existing testing infrastructure

### 📋 Remaining Tasks

**Phase 2: Service Implementation** 
- ⏳ Create `/server/data-extraction/SelfFundedClassifierService.js` with production classification logic
- ⏳ Add `testClassifyCompany()` method for test endpoint

**Phase 3: Integration**
- ⏳ Add new methods to `DatabaseManager.js` (if needed)
- ⏳ Add test route to `/server/routes/testing.js`

**Phase 4: Production Integration** 
- ⏳ Integrate classifier into `DataExtractionService.js` pipeline
- ⏳ Update production data flow to include self-funded classification

**Phase 5: Validation & Testing**
- ⏳ Test algorithm with real company data
- ⏳ Validate classification accuracy against known companies
- ⏳ Performance testing with multiple company queries

### 🎯 Current Milestone

**Database Foundation: 100% Complete** ✅  
All required data is now available in the database with proper field mappings. The import process successfully populated:
- Form 5500 records with `funding_gen_asset_ind` and `benefit_gen_asset_ind` 
- Schedule A records with `wlfr_bnft_stop_loss_ind`
- New database functions for efficient classification data retrieval

**Next Milestone: Test Endpoint Implementation**  
Ready to implement and test the self-funded classification algorithm with real data through the test endpoint.