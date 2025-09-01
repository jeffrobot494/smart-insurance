# Self-Funded Classification - Client-Side Integration Plan

## Overview

This document outlines the minimal changes needed to integrate the server-side self-funded classification results into the client-side PDF report generation system. The template already has a "Funding" column that currently shows "-" for all companies. We need to populate this column with the actual self-funded classification data.

## Current Data Flow

1. **Server-Side**: `DataExtractionService` produces companies with `form5500_data.self_funded` property
2. **Client-Side**: `DataProcessingService.processCompanyData()` extracts data from `company.form5500_data` 
3. **Template**: `HTMLReportService.generateCompanyRow()` creates HTML rows with funding column hardcoded to "-"
4. **PDF**: Final PDF shows "-" in the Funding column for all companies

## Required Changes

### 1. Update DataProcessingService.js

**File**: `/public/js/services/DataProcessingService.js`  
**Method**: `processCompanyData()` (around line 93-146)

**Current Code**:
```javascript
// Get form5500_data wrapper object
const form5500_data = company.form5500_data || {};
```

**Add After Line 97**:
```javascript
// Extract self-funded classification
const selfFundedClassification = form5500_data.self_funded || 'unknown';
```

**Current Return Object** (around line 136):
```javascript
return {
    company_name: companyName,
    data_year: preferredYear,
    has_data: hasData,
    total_premiums: aggregatedData.total_premiums,
    total_brokerage_fees: aggregatedData.total_brokerage_fees,
    total_people_covered: aggregatedData.total_people_covered,
    total_participants: totalParticipants,
    plans: aggregatedData.plans
};
```

**Updated Return Object**:
```javascript
return {
    company_name: companyName,
    data_year: preferredYear,
    has_data: hasData,
    self_funded_classification: selfFundedClassification, // NEW FIELD
    total_premiums: aggregatedData.total_premiums,
    total_brokerage_fees: aggregatedData.total_brokerage_fees,
    total_people_covered: aggregatedData.total_people_covered,
    total_participants: totalParticipants,
    plans: aggregatedData.plans
};
```

### 2. Update HTMLReportService.js

**File**: `/public/js/services/HTMLReportService.js`  
**Method**: `generateCompanyRow()` (around line 77-94)

**Current Code** (line 89):
```javascript
<td class="funding">-</td>
```

**Updated Code**:
```javascript
<td class="funding">${this.formatFundingStatus(company.self_funded_classification || 'unknown')}</td>
```

**Add New Helper Method** (after line 36):
```javascript
/**
 * Format self-funded classification for display in template
 */
static formatFundingStatus(classification) {
    const statusMap = {
        'self-funded': 'Self-Funded',
        'insured': 'Insured', 
        'partially-self-funded': 'Partially Self-Funded',
        'indeterminate': 'Unknown',
        'no-medical-plans': 'No Medical Plans',
        'no-data': 'No Data',
        'error': 'Error',
        'unknown': 'Unknown'
    };
    
    return statusMap[classification] || 'Unknown';
}
```

## Server-Side Property Values

The `form5500_data.self_funded` property from the server can have these values:

- `"self-funded"` - Company uses self-funded health plans
- `"insured"` - Company uses insured health plans  
- `"partially-self-funded"` - Company has mix of insured and self-funded plans
- `"indeterminate"` - Cannot determine classification from available data
- `"no-medical-plans"` - No medical/health plans found
- `"no-data"` - No Form 5500 data available
- `"error"` - Classification failed due to error

## Template Display

The existing template already has the "Funding" column:

```html
<th>Funding</th>
```

After our changes, this column will show:
- "Self-Funded" for companies classified as self-funded
- "Insured" for companies with insured plans
- "Partially Self-Funded" for mixed arrangements
- "Unknown" for indeterminate/error cases

## Testing Plan

### 1. Data Verification
- Verify server returns `form5500_data.self_funded` property
- Check that `DataProcessingService` correctly extracts the classification
- Ensure `HTMLReportService` displays the formatted status

### 2. Visual Testing  
- Generate PDF for a pipeline with known self-funded classifications
- Verify the "Funding" column shows correct values instead of "-"
- Test with different classification types (self-funded, insured, mixed)

### 3. Edge Cases
- Test with companies that have no Form 5500 data (`"no-data"`)
- Test with classification errors (`"error"`)
- Test with old pipeline data that doesn't have classification yet

## Implementation Steps

1. **Update DataProcessingService.js**
   - Extract `self_funded` from `form5500_data`
   - Add to returned company object
   
2. **Update HTMLReportService.js** 
   - Add `formatFundingStatus()` helper method
   - Update `generateCompanyRow()` to use classification instead of "-"

3. **Test Integration**
   - Generate test pipeline with known companies
   - Run data extraction with self-funded classification enabled
   - Generate PDF report and verify "Funding" column populated

## Files Modified

- `/public/js/services/DataProcessingService.js` - Extract classification from server data
- `/public/js/services/HTMLReportService.js` - Display classification in template

## Backward Compatibility

- Companies without `self_funded` property will show "Unknown" 
- Existing pipelines work unchanged - they'll show "Unknown" until re-extracted
- No breaking changes to existing functionality

## Expected Result

After implementation, PDF reports will show meaningful funding status in the "Funding" column:

| Company | Revenue | Employees Covered | **Funding** | Brokers | Total Premiums | Total Brokerage Fees |
|---------|---------|-------------------|-------------|---------|----------------|---------------------|
| Microsoft Corp | - | 50,000 | **Self-Funded** | Aon | $15,000,000 | $750,000 |
| Startup Inc | - | 25 | **Insured** | Local Broker | $125,000 | $12,500 |
| Mid Corp | - | 500 | **Partially Self-Funded** | Marsh | $2,500,000 | $125,000 |

This provides PE firms with immediate visibility into their portfolio companies' health insurance funding strategies directly in the PDF reports.