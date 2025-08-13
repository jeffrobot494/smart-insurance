# Manager.js Name Refinement Implementation Guide

## Overview

This guide details the implementation of name refinement workflow in the Manager.js `run()` function to improve Form 5500 data extraction accuracy.

## Current Flow
1. User submits multiple PE firms
2. WorkflowManager executes portfolio research workflow for each firm
3. Results contain `workflow_execution_id` for each firm
4. `extractData()` uses `workflow_execution_id` to lookup portfolio companies and extract Form 5500 data

## New Flow with Name Refinement
1. User submits multiple PE firms (unchanged)
2. WorkflowManager executes portfolio research workflow (unchanged)
3. **NEW**: For each `workflow_execution_id`, get portfolio companies from database and run refinement workflow
4. **NEW**: Refinement workflow creates new `workflow_execution_id`s with refined company names
5. `extractData()` uses refined `workflow_execution_id`s instead of original ones

## Implementation

### Step 1: Add Name Refinement Code

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
        const entityWorkflowData = readWorkflow('portfolio_company_verification.json');
        
        // Prepare inputs for entity resolution workflow
        const entityUserInputs = {
          input: portfolioCompanies
        };
        
        // Execute the legal entity resolution workflow (creates new workflow execution IDs)
        const entityResults = await this.taskManager.executeWorkflow(entityWorkflowData, entityUserInputs);
        
        // Extract the new workflow execution IDs from the refinement results
        for (const entityResult of entityResults) {
          if (entityResult.workflowExecutionId) {
            refinedWorkflowExecutionIds.push(entityResult.workflowExecutionId);
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

### Step 2: Modify Data Extraction Loop

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

1. **Workflow File**: Ensure `portfolio_company_verification.json` exists and is properly configured
2. **Database Method**: Confirm `this.databaseManager.getPortfolioCompaniesByWorkflowId()` method is available
3. **Error Handling**: The implementation includes try-catch blocks for robust error handling

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