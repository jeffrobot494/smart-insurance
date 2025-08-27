# Manager.js Name Refinement Implementation Guide

## Overview

This guide details the implementation of name refinement workflow in the Manager.js `run()` function to improve Form 5500 data extraction accuracy.

## Current Flow
1. User submits multiple PE firms
2. WorkflowManager executes portfolio research workflow for each firm
3. WorkflowManager saves results automatically via SaveTaskResults
4. Results contain `workflow_execution_id` for each firm
5. `extractData()` uses `workflow_execution_id` to lookup portfolio companies and extract Form 5500 data

## New Flow with Name Refinement
1. User submits multiple PE firms (unchanged)
2. WorkflowManager executes portfolio research workflow (returns results without saving)
3. **NEW**: Manager.run() saves first workflow results in original format
4. **NEW**: For each `workflow_execution_id`, get portfolio companies from database and run refinement workflow
5. **NEW**: Manager.run() converts refinement results to portfolio format and saves them
6. **NEW**: Refinement workflow creates new `workflow_execution_id`s with refined company names
7. `extractData()` uses refined `workflow_execution_id`s instead of original ones

## Architecture Changes Required

### 1. Remove Auto-Saving from WorkflowManager
Remove the automatic saving from `WorkflowManager.executeWorkflow()` (around line 157-158):
```javascript
// Remove this line:
// await this.resultsSaver.saveBatchResults(allResults);
```

### 2. Move Saving Control to Manager.run()
Manager.run() will now control when and how results are saved, allowing for conversion of the second workflow results.

## Implementation

### Step 1: Add Required Imports to Manager.js

Add these imports at the top of Manager.js:
```javascript
const VerificationResultsConverter = require('./utils/VerificationResultsConverter');
const SaveTaskResults = require('./workflow/SaveTaskResults');
```

### Step 2: Add Result Saving After First Workflow

Add this code right after line 97 (`logger.info('✅ First workflow completed');`):

```javascript
// Save first workflow results in original format
const resultsSaver = new SaveTaskResults();
await resultsSaver.saveBatchResults(results);
logger.info('💾 First workflow results saved to database');
```

### Step 3: Add Name Refinement Code

Add the following code at line 99 in Manager.js (where the `//second workflow starts here` comment is located):

```javascript
// Second workflow - Legal entity name resolution
logger.info('🔍 Starting legal entity name resolution workflow');
const refinedWorkflowExecutionIds = [];

for (const result of results) {
  if (result.workflowExecutionId) {
    try {
      // Get portfolio company names from database using original workflow execution ID
      const portfolioCompanies = await this.databaseManager.getPortfolioCompaniesByWorkflowId(result.workflowExecutionId);
      
      if (portfolioCompanies.length > 0) {
        logger.info(`🏢 Found ${portfolioCompanies.length} portfolio companies for workflow ${result.workflowExecutionId}: ${portfolioCompanies.join(', ')}`);
        
        // Load the legal entity resolution workflow
        const { readWorkflow } = require('./utils/workflowReader');
        const entityWorkflowData = readWorkflow('portfolio_company_verification.json');
        
        // Get firm name from original result for input formatting
        const firmName = result.input?.match(/Firm:\s*([^,]+)/)?.[1] || 'Unknown Firm';
        
        // Prepare inputs for entity resolution workflow (format: "Firm: X, Company: Y")
        const formattedInputs = portfolioCompanies.map(company => `Firm: ${firmName}, Company: ${company}`);
        const entityUserInputs = {
          input: formattedInputs
        };
        
        // Execute the legal entity resolution workflow (WorkflowManager no longer saves automatically)
        const entityResults = await this.taskManager.executeWorkflow(entityWorkflowData, entityUserInputs);
        
        // Convert verification results to portfolio format before saving
        const convertedResults = VerificationResultsConverter.consolidateByFirm(entityResults);
        
        // Save converted results to database in portfolio format
        await resultsSaver.saveBatchResults(convertedResults);
        logger.info('💾 Refined workflow results saved to database');
        
        // Extract the new workflow execution IDs from the converted results
        for (const convertedResult of convertedResults) {
          if (convertedResult.workflowExecutionId) {
            refinedWorkflowExecutionIds.push(convertedResult.workflowExecutionId);
          }
        }
        
        logger.info(`✅ Legal entity resolution completed for workflow ${result.workflowExecutionId}`);
      } else {
        logger.info(`⚠️ No portfolio companies found for workflow ${result.workflowExecutionId}, skipping refinement`);
      }
    } catch (error) {
      logger.error(`❌ Failed to refine names for workflow ${result.workflowExecutionId}:`, error.message);
    }
  }
}

logger.info(`🔍 Name refinement completed. Generated ${refinedWorkflowExecutionIds.length} refined workflow execution IDs`);
```

### Step 4: Modify Data Extraction Loop

Replace the existing data extraction loop (around line 105) to use the refined workflow execution IDs:

**Before:**
```javascript
for (const result of results) {
  if (result.workflowExecutionId) {
    // ... extract data using result.workflowExecutionId
  }
}
```

**After:**
```javascript
for (const refinedWorkflowExecutionId of refinedWorkflowExecutionIds) {
  try {
    logger.info(`📊 Extracting data for refined workflow execution ID: ${refinedWorkflowExecutionId}`);
    const extractionResult = await this.extractPortfolioCompanyData(refinedWorkflowExecutionId);
    extractionResults.push({
      workflowExecutionId: refinedWorkflowExecutionId,
      extraction: extractionResult
    });
  } catch (error) {
    logger.error(`❌ Data extraction failed for refined workflow ID ${refinedWorkflowExecutionId}:`, error.message);
    extractionResults.push({
      workflowExecutionId: refinedWorkflowExecutionId,
      extraction: { success: false, error: error.message }
    });
  }
}
```

## Prerequisites

1. **WorkflowManager Changes**: Remove automatic saving from `WorkflowManager.executeWorkflow()` method
2. **Workflow File**: Ensure `portfolio_company_verification.json` exists and is properly configured
3. **Database Method**: Confirm `this.databaseManager.getPortfolioCompaniesByWorkflowId()` method is available
4. **Converter Utility**: Ensure `VerificationResultsConverter.js` exists in `./utils/` directory
5. **Import Dependencies**: Add imports for `VerificationResultsConverter`, `SaveTaskResults`, and `readWorkflow`
6. **Error Handling**: The implementation includes try-catch blocks for robust error handling

## Benefits

1. **Improved Accuracy**: Portfolio company names are refined to better match Form 5500 database entries
2. **Higher Success Rate**: More accurate name matching leads to better Form 5500 data extraction
3. **Maintains Architecture**: Uses existing workflow execution pattern
4. **Error Resilience**: Graceful handling of refinement failures

## Testing

Test the implementation by:
1. Running a portfolio research workflow with multiple PE firms
2. Verifying refined workflow execution IDs are created in the database
3. Confirming Form 5500 data extraction uses refined names
4. Checking that error cases are handled properly