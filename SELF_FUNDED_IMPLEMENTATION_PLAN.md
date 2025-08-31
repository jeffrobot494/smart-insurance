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
   * Classify companies as insured, self-funded, or partially-self-funded
   * @param {Array} companies - Companies with form5500_data
   * @returns {Array} Companies with self_funded field added
   */
  async classifyCompanies(companies) {
    logger.info('🔍 Starting self-funded classification for companies');
    
    for (const company of companies) {
      if (!company.form5500_data || !company.form5500_data.ein) {
        company.form5500_data = company.form5500_data || {};
        company.form5500_data.self_funded = null;
        continue;
      }
      
      try {
        const classification = await this.classifyCompany(company);
        company.form5500_data.self_funded = classification;
        logger.debug(`✓ Classified ${company.legal_entity_name}: ${classification}`);
      } catch (error) {
        logger.error(`❌ Error classifying ${company.legal_entity_name}:`, error.message);
        company.form5500_data.self_funded = 'error';
      }
    }
    
    return companies;
  }

  /**
   * Classify a single company based on all its health plans
   * @param {Object} company - Company object with form5500_data
   * @returns {string} Classification result
   */
  async classifyCompany(company) {
    const ein = company.form5500_data.ein;
    const planClassifications = [];
    
    // Get raw Form 5500 and Schedule A data for classification
    const form5500Records = await this.databaseManager.query(
      'SELECT * FROM get_raw_form5500_for_classification($1)',
      [ein]
    );
    
    const scheduleARecords = await this.databaseManager.query(
      'SELECT * FROM get_raw_schedule_a_for_classification($1)', 
      [ein]
    );
    
    // Build Schedule A index by plan and year
    const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords.rows);
    
    // Classify each Form 5500 record (plan)
    for (const form5500Record of form5500Records.rows) {
      const planClassification = this.classifyPlan(form5500Record, scheduleAIndex);
      if (planClassification) {
        planClassifications.push(planClassification.classification);
      }
    }
    
    // Roll up plan classifications to company level
    return this.rollUpCompanyClassification(planClassifications);
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

After implementation, each company will have a `self_funded` field in their `form5500_data`:

```javascript
company.form5500_data = {
  ein: "123456789",
  form5500: { /* existing structure */ },
  scheduleA: { /* existing structure */ },
  self_funded: "insured" | "self-funded" | "partially-self-funded" | "indeterminate" | "no-medical-plans" | "error" | null
}
```

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