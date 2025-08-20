# Company Names Refactoring: Send Both Original and Legal Entity Names to Client

## Overview

This refactoring enables the system to send both the original company name (from research) and the legal entity name (for Form 5500 matching) to the client, instead of just sending one consolidated name.

## Background

Previously, the system would:
1. Get original company name from first workflow (e.g., "Vet's Best Friend")
2. Get legal entity name from second workflow (e.g., "Lorient Pet Services, LLC")
3. Choose one name to send to client (prioritizing legal name if available)

Now, the system will send **both names** to the client so they can choose which to display.

## Database Schema Changes

### Updated `portfolio_companies` table

**Old Schema:**
```sql
CREATE TABLE portfolio_companies (
    id SERIAL PRIMARY KEY,
    workflow_execution_id INTEGER REFERENCES workflow_executions(id),
    firm_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,  -- Single name field
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workflow_execution_id, company_name)
);
```

**New Schema:**
```sql
CREATE TABLE portfolio_companies (
    id SERIAL PRIMARY KEY,
    workflow_execution_id INTEGER REFERENCES workflow_executions(id),
    firm_name VARCHAR(255) NOT NULL,
    original_company_name VARCHAR(255) NOT NULL,  -- Original research name
    legal_entity_name VARCHAR(255),               -- Legal entity name (nullable)
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workflow_execution_id, original_company_name)
);
```

### Schema Consolidation

- All table definitions are now in `create-tables.sql` (no more separate migration files)
- `migrations/001_add_portfolio_companies.sql` was deleted
- `migrations/002_fix_schedule_a_column_names.sql` kept for reference but marked as unused
- `cleanup-test-data.js` updated to drop tables entirely (they recreate automatically)

## Code Changes Required

### 1. SaveTaskResults.js (First Workflow)

**Location:** `/server/workflow/SaveTaskResults.js` around line 78

**Current:**
```javascript
const companies = portfolioData.companies.filter(c => c && c.trim().length > 0);
await this.databaseManager.savePortfolioCompanies(workflowExecutionId, firmName, companies);
```

**Needs to become:**
```javascript
const companyNames = portfolioData.companies.filter(c => c && c.trim().length > 0);

// Convert company names to object format for consistent structure
const companies = companyNames.map(name => ({
  originalName: name,
  legalName: null // Will be filled in by second workflow
}));

await this.databaseManager.savePortfolioCompanies(workflowExecutionId, firmName, companies);
```

### 2. VerificationResultsConverter.js (Second Workflow)

**Location:** `/server/utils/VerificationResultsConverter.js` around line 188

**Current:**
```javascript
const refinedCompanyName = verificationData.form5500_match?.legal_name || verificationData.company_name;
companies.push(refinedCompanyName);
```

**Already Updated to:**
```javascript
// Extract both original and legal entity names
const originalName = verificationData.company_name;
const legalName = verificationData.form5500_match?.legal_name || verificationData.legal_entity_research?.legal_entity_name;

companies.push({
  originalName,
  legalName: legalName || originalName // fallback to original if no legal name found
});
```

### 3. DatabaseManager.js

**Location:** `/server/data-extraction/DatabaseManager.js`

**A. savePortfolioCompanies method (around line 240):**

**Current:**
```javascript
await this.query(
  'INSERT INTO portfolio_companies (workflow_execution_id, firm_name, company_name) VALUES ($1, $2, $3) ON CONFLICT (workflow_execution_id, company_name) DO NOTHING',
  [workflowExecutionId, firmName, companyName]
);
```

**Already Updated to:**
```javascript
await this.query(
  'INSERT INTO portfolio_companies (workflow_execution_id, firm_name, original_company_name, legal_entity_name) VALUES ($1, $2, $3, $4) ON CONFLICT (workflow_execution_id, original_company_name) DO NOTHING',
  [workflowExecutionId, firmName, company.originalName, company.legalName]
);
```

**B. getPortfolioCompaniesByWorkflowId method (around line 265):**

**Current:**
```javascript
const result = await this.query(
  'SELECT company_name FROM portfolio_companies WHERE workflow_execution_id = $1 ORDER BY company_name',
  [workflowExecutionId]
);

return result.rows.map(row => row.company_name);
```

**Needs to become:**
```javascript
const result = await this.query(
  'SELECT original_company_name, legal_entity_name FROM portfolio_companies WHERE workflow_execution_id = $1 ORDER BY original_company_name',
  [workflowExecutionId]
);

return result.rows.map(row => ({
  originalName: row.original_company_name,
  legalName: row.legal_entity_name
}));
```

### 4. Update Data Extraction Pipeline

The data extraction pipeline will now receive objects instead of strings from `getPortfolioCompaniesByWorkflowId`. Need to update the code that processes these company objects.

**Location:** Likely in `/server/data-extraction/DataExtractionService.js` and related files

### 5. ReportGenerator.js (Final Client Response)

**Location:** `/server/data-extraction/ReportGenerator.js` around line 87

**Current:**
```javascript
companies: searchResults.map(result => ({
  companyName: result.company,
  ein: result.ein || null,
  // ...
}))
```

**Needs to become:**
```javascript
companies: searchResults.map(result => ({
  originalCompanyName: result.originalCompanyName,
  legalEntityName: result.legalEntityName,
  ein: result.ein || null,
  // ...
}))
```

## Data Flow

### Before:
```
PE Research → ["Company A", "Company B"] 
  → Legal Entity Resolution → ["Legal Entity A", "Legal Entity B"]
  → Client receives: [{"companyName": "Legal Entity A"}, {"companyName": "Legal Entity B"}]
```

### After:
```
PE Research → [{"originalName": "Company A", "legalName": null}, {"originalName": "Company B", "legalName": null}]
  → Legal Entity Resolution → [{"originalName": "Company A", "legalName": "Legal Entity A"}, {"originalName": "Company B", "legalName": "Legal Entity B"}]
  → Client receives: [{"originalCompanyName": "Company A", "legalEntityName": "Legal Entity A"}, {"originalCompanyName": "Company B", "legalEntityName": "Legal Entity B"}]
```

## Database Deployment

1. **Drop existing tables:** Run `cleanup-test-data.js` to drop workflow tables
2. **Recreate with new schema:** Tables will automatically recreate with new schema when workflows run
3. **No data migration needed:** Starting fresh as agreed

## Current Status

### ✅ Completed:
- Database schema updated in `create-tables.sql`
- Migration files consolidated
- `VerificationResultsConverter.js` updated for second workflow
- `DatabaseManager.savePortfolioCompanies` updated to handle new format
- `cleanup-test-data.js` updated to drop tables entirely

### ❌ Still Needed:
- Update `SaveTaskResults.js` for first workflow to use object format
- Update `DatabaseManager.getPortfolioCompaniesByWorkflowId` to return both names
- Update data extraction pipeline to handle company objects instead of strings
- Update `ReportGenerator.js` to send both names to client
- Test end-to-end workflow

## Testing Plan

1. Run `cleanup-test-data.js` to drop existing tables
2. Run first workflow to ensure company objects are saved correctly
3. Run second workflow to ensure legal names are added
4. Verify client response includes both `originalCompanyName` and `legalEntityName`
5. Test with companies that have no legal entity match

## Notes

- The unique constraint changed from `(workflow_execution_id, company_name)` to `(workflow_execution_id, original_company_name)`
- Legal entity names can be NULL for companies where no legal entity is found
- For Form 5500 data extraction, use the legal entity name if available, otherwise fall back to original name
- Client can choose which name to display to users