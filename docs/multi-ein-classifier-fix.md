# Multi-EIN Self-Funded Classifier Fix

## Context

### Original Algorithm
The self-funded classifier service was designed to analyze Form 5500 and Schedule A data to determine whether a company's health insurance plans are self-funded or insured. The algorithm follows these steps:

1. Search Form 5500 records by company name
2. Extract EINs from Form 5500 results
3. Search Schedule A records by EIN
4. Apply classification logic using Form 5500 headers and Schedule A health indicators
5. Roll up individual plan classifications to company level

### Problem #1: Incorrect Database Indicators
After initial implementation, we discovered that human data entry errors in Form 5500 database fields cause misclassification. Companies like Family Care Center have legitimate health insurance coverage (UnitedHealthcare, Cigna) but their `wlfr_bnft_health_ind` database field is incorrectly set to `0`, causing the algorithm to conclude "no health coverage."

### Solution #1: Text Analysis Fallback
We added fallback mechanisms that analyze raw database text fields (`wlfr_type_bnft_oth_text`) when binary indicators fail:
- Added `isHealthBenefitText()` method to detect health coverage from text
- Added `isStopLossBenefitText()` method to detect stop-loss coverage from text
- Enhanced `buildScheduleAIndex()` to use text analysis when database indicators are false/missing

### Problem #2: Multi-EIN Company Limitation
After implementing the text fallback, we discovered a second issue with HealthAxis Group. The algorithm was designed assuming one EIN per company, but companies often have multiple EINs for different benefit plans:

**HealthAxis Example:**
- EIN `455531595`: 401(k) retirement plan
- EIN `271763970`: Health/welfare benefit plan

The algorithm correctly fetches Schedule A records for both EINs but only indexes records for the first/primary EIN, causing it to miss health indicators in Schedule A records under secondary EINs.

**Root Cause:** When searching by company name, we get multiple Form 5500 records with different EINs (normal), but the classification logic only considers Schedule A records matching the first EIN found.

### Solution #2: Multi-EIN Algorithm Enhancement
This fix modifies the algorithm to:
1. Extract ALL EINs from Form 5500 records for a company
2. Add validation to ensure EINs belong to the same company (exact sponsor name match)
3. Index Schedule A records for ALL company EINs during classification
4. Preserve existing text analysis fallback mechanisms

## Changes

### Change 1: Update `classifyCompany()` Method

**Location:** Lines 59-84 in `SelfFundedClassifierService.js`

```javascript
async classifyCompany(company) {
  const legalEntityName = company.legal_entity_name;
  
  // Get raw Form 5500 and Schedule A data for classification
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
    // Continue with rest of classification...
  } else {
    // Multi-EIN approach with validation
    const allEINs = [...new Set(
      form5500Records.rows
        .filter(record => record.sponsor_name && record.sponsor_name === baseCompanyName) // Exact name match with null check
        .map(record => record.ein)
        .filter(ein => ein && ein.trim() !== '') // Filter out null/empty EINs
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
    const scheduleAIndex = this.buildScheduleAIndex(allScheduleARecords, allEINs);
  }
  
  // Rest of method remains unchanged...
  // Group Form 5500 records by year, classify each year separately, etc.
}
```

### Change 2: Update `testClassifyCompany()` Method

**Location:** Lines 186-204 in `SelfFundedClassifierService.js`

Replace the EIN collection and Schedule A index building logic:

```javascript
// Get EINs and Schedule A data with validation
const baseCompanyName = form5500Records[0].sponsor_name;

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

const eins = [...new Set(
  form5500Records
    .filter(record => record.sponsor_name && record.sponsor_name === baseCompanyName) // Exact name match with null check
    .map(r => r.ein)
    .filter(ein => ein && ein.trim() !== '') // Filter out null/empty EINs
)];

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
    const scheduleAResult = await this.databaseManager.query(
      'SELECT * FROM get_schedule_a_for_classification($1)',
      [ein]
    );
    scheduleARecords.push(...scheduleAResult.rows);
  } catch (error) {
    logger.warn(`Failed to get Schedule A for EIN ${ein} in test:`, error.message);
    // Continue with other EINs instead of failing completely
  }
}

// Build Schedule A index with ALL EINs (not just first one)
const scheduleAIndex = this.buildScheduleAIndex(scheduleARecords, eins);
```

### Change 3: Update `buildScheduleAIndex()` Method

**Location:** Lines 337-395 in `SelfFundedClassifierService.js`

Update method signature and add comprehensive validation:

```javascript
/**
 * Build Schedule A index for efficient lookups with enhanced fallback text analysis
 * @param {Array} scheduleARecords - Raw Schedule A records
 * @param {Array} allEINs - All EINs associated with this company
 * @returns {Object} Indexed Schedule A data
 */
buildScheduleAIndex(scheduleARecords, allEINs) {
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
  
  for (const record of scheduleARecords) {
    if (!record) {
      continue; // Skip null/undefined records
    }
    
    const recordEIN = record.sch_a_ein;
    const planNum = record.sch_a_plan_num;
    const beginYear = this.extractYear(record.sch_a_plan_year_begin_date);
    const endYear = this.extractYear(record.sch_a_plan_year_end_date);
    
    // Skip if record has no EIN or plan number
    if (!recordEIN || !planNum) {
      continue;
    }
    
    // NEW: Skip if this record's EIN is not in our company's EIN list
    // Handle both string and numeric EIN comparisons
    const recordEINStr = recordEIN.toString();
    const isValidEIN = allEINs.some(ein => ein && ein.toString() === recordEINStr);
    if (!isValidEIN) {
      continue;
    }
    
    // Step 1: Try database indicators first (existing logic)
    let hasHealth = record.wlfr_bnft_health_ind === 1;
    let hasStopLoss = record.wlfr_bnft_stop_loss_ind === 1;
    
    // Step 2: FALLBACK - Analyze raw text fields when database indicators are false/missing
    if (!hasHealth && record.wlfr_type_bnft_oth_text) {
      hasHealth = this.isHealthBenefitText(record.wlfr_type_bnft_oth_text);
      if (hasHealth) {
        logger.debug(`Text-based health detection for EIN ${recordEIN}, plan ${planNum}: "${record.wlfr_type_bnft_oth_text}"`);
      }
    }
    
    if (!hasStopLoss && record.wlfr_type_bnft_oth_text) {
      hasStopLoss = this.isStopLossBenefitText(record.wlfr_type_bnft_oth_text);
      if (hasStopLoss) {
        logger.debug(`Text-based stop-loss detection for EIN ${recordEIN}, plan ${planNum}: "${record.wlfr_type_bnft_oth_text}"`);
      }
    }
    
    // Step 3: Apply enhanced indicators to index (preserve existing structure)
    if (beginYear && planNum && recordEIN) {
      const key = `${recordEIN}-${planNum}-${beginYear}`;
      if (!index.byBeginYear.has(key)) {
        index.byBeginYear.set(key, { health: false, stopLoss: false });
      }
      const entry = index.byBeginYear.get(key);
      if (hasHealth) entry.health = true;
      if (hasStopLoss) entry.stopLoss = true;
    }
    
    if (endYear && planNum && recordEIN && endYear !== beginYear) {
      const key = `${recordEIN}-${planNum}-${endYear}`;
      if (!index.byEndYear.has(key)) {
        index.byEndYear.set(key, { health: false, stopLoss: false });
      }
      const entry = index.byEndYear.get(key);
      if (hasHealth) entry.health = true;
      if (hasStopLoss) entry.stopLoss = true;
    }
  }
  
  return index;
}
```

### Bug Fixes Included

The revised implementation addresses these potential issues:

1. **Null/Empty Sponsor Names**: Fallback to single EIN approach when sponsor name is missing
2. **Empty EINs Array**: Return appropriate `no-data` response instead of crashing
3. **Null Schedule A EINs**: Skip records with missing `sch_a_ein` field
4. **String/Numeric EIN Comparison**: Handle both data types consistently
5. **Database Query Failures**: Continue with other EINs if one fails instead of failing completely
6. **Array Validation**: Check that parameters are valid arrays before processing
7. **Graceful Degradation**: Fallback to single EIN approach when multi-EIN logic fails

## Testing and Expected Behavior

### Test Companies

**HealthAxis Group (Multi-EIN Issue):**
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"companyName": "HEALTHAXIS GROUP, LLC"}'
```

**Expected Result:** 
- **Before:** `"self_funded": "no-medical-plans"` (2023, 2024 classified as no-medical-plans)
- **After:** `"self_funded": "insured"` (all years 2022-2024 classified as insured)

**Family Care Center (Text Analysis Issue):**
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"companyName": "FAMILY CARE CENTER, LLC"}'
```

**Expected Result:**
- **Before:** `"self_funded": "no-medical-plans"` (text analysis needed)
- **After:** `"self_funded": "insured"` (text analysis detects health coverage)

### Regression Testing

Test companies that should remain unchanged:

**Medix (Correctly Self-Funded):**
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"companyName": "Medix Staffing Solutions"}'
```

**Expected Result:** Should remain `"self_funded": "self-funded"` (no change)

**Fast Pace (Correctly No Medical Plans):**
```bash
curl -X POST http://localhost:3000/api/testing/self-funded-classification \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"companyName": "FAST PACE MEDICAL CLINICAL, PLLC"}'
```

**Expected Result:** Should remain `"self_funded": "no-medical-plans"` (no change)

### Validation Checks

#### Multi-EIN Validation
Verify that only EINs with identical sponsor names are grouped:
- Check logs for companies with multiple sponsor name variations
- Ensure no accidental cross-company contamination

#### Text Analysis Fallback
Verify text analysis is still working:
- Look for debug logs: `"Text-based health detection for EIN..."`
- Test with companies known to have text-based health indicators

#### Performance Impact
Monitor execution time:
- Multi-EIN approach requires additional Schedule A queries
- Should be minimal impact (< 100ms additional per company)

### Success Criteria

Implementation is successful when:
- ✅ HealthAxis classifies as "insured" in all years (was "no-medical-plans" in 2023/2024)
- ✅ Family Care Center classifies as "insured" (was "no-medical-plans")  
- ✅ Medix remains "self-funded" (no change)
- ✅ Fast Pace remains "no-medical-plans" (no change)
- ✅ No performance degradation (< 100ms additional processing)
- ✅ No false company conflation (exact sponsor name matching)

### Rollback Plan

If issues arise, the changes can be reverted by:
1. Reverting `buildScheduleAIndex()` signature to single EIN parameter
2. Reverting `classifyCompany()` and `testClassifyCompany()` to use single EIN approach
3. Text analysis fallback mechanisms will remain intact

### Files Modified
- `/server/data-extraction/SelfFundedClassifierService.js` - Multi-EIN support with validation