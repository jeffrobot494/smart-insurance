# Name Refinement Workflow Solution

## Problem Statement

The current `Manager.js` `run()` function tightly couples workflow execution with data extraction. Specifically:

1. The `run()` function completes a workflow, assumes the output is a list of portfolio company names
2. It then directly calls the data extraction method to pull Form 5500 database results for companies with those exact names
3. This approach misses data because portfolio company names from workflows don't always match the legal entity names stored in the database

## Proposed Solution

Add a second workflow (legal entity name resolution) between the initial portfolio company research and data extraction:

**Flow**: Portfolio Research → **Name Refinement** → Data Extraction

## Implementation

### Code Changes to Manager.js

Add the following code at line 99 (where the `//second workflow starts here` comment is located):

```javascript
// Second workflow - Legal entity name resolution
logger.info('🔍 Starting legal entity name resolution workflow');
const entityResolutionResults = [];

// Extract portfolio company names from first workflow results
const portfolioCompanyNames = [];
for (const result of results) {
  // Extract the company names from the task results
  const taskResults = result.tasks;
  for (const taskId in taskResults) {
    const taskResult = taskResults[taskId];
    if (taskResult.success && taskResult.result) {
      // Parse the result to extract company names (assuming comma-separated list)
      const companies = taskResult.result.split(',').map(name => name.trim()).filter(name => name);
      portfolioCompanyNames.push(...companies);
    }
  }
}

if (portfolioCompanyNames.length > 0) {
  logger.info(`🏢 Found ${portfolioCompanyNames.length} portfolio companies to resolve: ${portfolioCompanyNames.join(', ')}`);
  
  // Load the legal entity resolution workflow
  const entityWorkflowData = readWorkflow('get_legal_entities.json'); // or whatever your workflow filename is
  
  // Prepare inputs for entity resolution workflow
  const entityUserInputs = {
    input: portfolioCompanyNames
  };
  
  // Execute the legal entity resolution workflow
  const entityResults = await this.taskManager.executeWorkflow(entityWorkflowData, entityUserInputs);
  logger.info('✅ Legal entity resolution workflow completed');
  
  // Store the refined entity names for data extraction
  for (let i = 0; i < results.length; i++) {
    if (entityResults[i] && entityResults[i].tasks) {
      entityResolutionResults.push({
        workflowExecutionId: results[i].workflowExecutionId,
        originalCompanies: portfolioCompanyNames,
        resolvedEntities: entityResults[i]
      });
    }
  }
} else {
  logger.info('⚠️ No portfolio company names found from first workflow, skipping entity resolution');
  // Fall back to original behavior
  for (const result of results) {
    entityResolutionResults.push({
      workflowExecutionId: result.workflowExecutionId,
      originalCompanies: [],
      resolvedEntities: null
    });
  }
}
```

### Additional Changes Required

1. **Data Extraction Loop**: Modify the data extraction loop (starting around line 105) to use the resolved entity names from `entityResolutionResults` instead of the original workflow results

2. **Workflow Configuration**: Ensure the legal entity resolution workflow file (`get_legal_entities.json`) exists and is properly configured

3. **Error Handling**: Add proper error handling for cases where the entity resolution workflow fails

## Benefits

1. **Improved Data Quality**: Better matching between portfolio company names and database legal entity names
2. **Higher Data Extraction Success Rate**: More accurate company name matching leads to more successful database queries  
3. **Maintains Existing Architecture**: Minimal changes to current codebase structure
4. **Backward Compatibility**: Falls back to original behavior if name resolution fails

## Testing Approach

The solution can be tested using the existing testing framework in `/server/routes/testing.js`, which already demonstrates isolated workflow execution patterns that this solution follows.