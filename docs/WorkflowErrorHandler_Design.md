# WorkflowErrorHandler Class Design

## Overview

The `WorkflowErrorHandler` class handles API errors during workflow execution with clear database tracking and standardized error responses.

## Class Design

### WorkflowErrorHandler Class Structure

```javascript
class WorkflowErrorHandler {
  constructor(databaseManager, logger)
  
  // Main error handling method
  async handleWorkflowFailure(pipelineId, currentStatus, error, apiName)
  
  // Error recording with clear data entries
  async recordAPIError(pipelineId, errorData)
  
  // Status management
  defineRollbackBehavior(currentStatus)
  getWorkflowName(currentStatus)
  classifyError(error)
  
  // Client response creation
  createClientResponse(responseData)
  
  // Utility methods
  async getErrorHistory(pipelineId)
  async canRetryWorkflow(pipelineId)
  async clearErrorState(pipelineId)
}
```

## 1. Database Schema

Add these columns to the existing `pipelines` table:

```sql
ALTER TABLE pipelines ADD COLUMN error_api VARCHAR(50);
ALTER TABLE pipelines ADD COLUMN error_type VARCHAR(50); 
ALTER TABLE pipelines ADD COLUMN error_message TEXT;
ALTER TABLE pipelines ADD COLUMN error_time TIMESTAMP;
ALTER TABLE pipelines ADD COLUMN previous_status VARCHAR(50);
```

### Error Recording Method
```javascript
async recordAPIError(pipelineId, {
  apiName,           // "Claude API", "Firecrawl API", "Perplexity API" 
  errorMessage,      // The actual error message
  currentWorkflow,   // "research", "legal_resolution", "data_extraction"
  httpStatusCode,    // 429, 500, 403, etc.
  errorType,         // "rate_limit", "credits_exhausted", "server_error"
  rollbackTo         // "pending", "research_complete", etc.
})
```

### Example Database View After Errors
```
pipeline_id | firm_name    | status              | error_api      | error_type          | error_message                | error_time          | previous_status
1          | "Blackstone" | "pending"           | "Claude API"   | "credits_exhausted" | "Insufficient credits"       | 2025-01-15 10:30:00 | "research_running"
2          | "KKR"        | "research_complete" | "Form5500 API" | "server_error"      | "Database connection failed" | 2025-01-15 11:45:00 | "data_extraction_running"
3          | "Apollo"     | "legal_resolution_complete" | "Claude API" | "rate_limit" | "Rate limit exceeded"        | 2025-01-15 12:15:00 | "data_extraction_running"
```

## 2. Error Handler Methods

### Main Error Handling Method
```javascript
async handleWorkflowFailure(pipelineId, currentStatus, error, apiName) {
  
  // 1. Figure out where to roll back to
  const rollbackStatus = this.defineRollbackBehavior(currentStatus);
  
  // 2. Record what happened in clear terms  
  await this.recordAPIError(pipelineId, {
    apiName: apiName,
    errorMessage: error.message,
    currentWorkflow: this.getWorkflowName(currentStatus),
    errorType: this.classifyError(error),
    rollbackTo: rollbackStatus,
    httpStatusCode: error.status || null,
    timestamp: new Date()
  });
  
  // 3. Update pipeline status to rollback state
  await this.databaseManager.updatePipelineStatus(pipelineId, rollbackStatus);
  
  // 4. Tell the application what to do next
  return this.createClientResponse({
    success: false,
    error: {
      type: 'api_error',
      api: apiName,
      message: `${apiName} failed. Pipeline rolled back to ${rollbackStatus}. Please check your credits and try again.`,
      rollbackStatus: rollbackStatus,
      stopPolling: true,
      refreshCard: true,
      showNotification: true
    }
  });
}
```

### Rollback Behavior Rules
```javascript
defineRollbackBehavior(currentStatus) {
  const rules = {
    'research_running': 'pending',                        // Start over
    'legal_resolution_running': 'research_complete',      // Back to previous step
    'data_extraction_running': 'legal_resolution_complete' // Back to previous step
  };
  return rules[currentStatus] || 'pending'; // Default fallback
}
```

### Error Classification
```javascript
classifyError(error) {
  if (error.message.includes('credit') || error.message.includes('insufficient')) {
    return 'credits_exhausted';
  }
  if (error.message.includes('rate limit') || error.status === 429) {
    return 'rate_limit';
  }
  if (error.status >= 500) {
    return 'server_error';
  }
  if (error.status === 403) {
    return 'authorization_failed';
  }
  if (error.message.includes('timeout')) {
    return 'timeout_error';
  }
  return 'unknown_error';
}
```

### Workflow Name Mapping
```javascript
getWorkflowName(currentStatus) {
  const workflowMap = {
    'research_running': 'research',
    'legal_resolution_running': 'legal_resolution', 
    'data_extraction_running': 'data_extraction'
  };
  return workflowMap[currentStatus] || 'unknown_workflow';
}
```

## 3. Integration with Manager.js

### Simple Usage Pattern
```javascript
class Manager {
  constructor() {
    // Initialize error handler
    this.errorHandler = new WorkflowErrorHandler(this.databaseManager, logger);
  }
  
  async runResearch(pipelineId) {
    try {
      await this.databaseManager.updatePipelineStatus(pipelineId, 'research_running');
      
      // Normal workflow execution...
      const result = await this.workflowManager.executeWorkflow('research_workflow', input);
      
      await this.databaseManager.updatePipelineStatus(pipelineId, 'research_complete');
      return { success: true, result };
      
    } catch (error) {
      // One line to handle all API errors
      return await this.errorHandler.handleWorkflowFailure(
        pipelineId, 
        'research_running', 
        error, 
        'Claude API'
      );
    }
  }
  
  async runLegalResolution(pipelineId) {
    try {
      await this.databaseManager.updatePipelineStatus(pipelineId, 'legal_resolution_running');
      
      // Normal workflow execution...
      const result = await this.workflowManager.executeWorkflow('legal_resolution_workflow', input);
      
      await this.databaseManager.updatePipelineStatus(pipelineId, 'legal_resolution_complete');
      return { success: true, result };
      
    } catch (error) {
      return await this.errorHandler.handleWorkflowFailure(
        pipelineId, 
        'legal_resolution_running', 
        error, 
        'Claude API'
      );
    }
  }
  
  async runDataExtraction(pipelineId) {
    try {
      await this.databaseManager.updatePipelineStatus(pipelineId, 'data_extraction_running');
      
      // Normal workflow execution...
      const result = await this.dataExtractionService.extractData(pipeline);
      
      await this.databaseManager.updatePipelineStatus(pipelineId, 'data_extraction_complete');
      return { success: true, result };
      
    } catch (error) {
      return await this.errorHandler.handleWorkflowFailure(
        pipelineId, 
        'data_extraction_running', 
        error, 
        'Form5500 API'
      );
    }
  }
}
```

## 4. Client-Side Response Handling

### Updated PipelinePoller.js
```javascript
async pollPipeline(pipelineId) {
  try {
    const result = await this.api.getPipeline(pipelineId);
    
    if (result.success && result.pipeline) {
      // Normal success case - existing logic
      this.cardManager.updatePipelineCard(pipelineId, result.pipeline);
      
    } else if (result.error?.type === 'api_error') {
      // Handle API error response from WorkflowErrorHandler
      console.log(`API Error: ${result.error.api} - ${result.error.message}`);
      
      // Stop polling as requested
      if (result.error.stopPolling) {
        this.stopPipelinePolling(pipelineId);
      }
      
      // Refresh card to show rollback status
      if (result.error.refreshCard) {
        // Get updated pipeline data to show rollback status
        const updatedResult = await this.api.getPipeline(pipelineId);
        if (updatedResult.success) {
          this.cardManager.updatePipelineCard(pipelineId, updatedResult.pipeline);
        }
      }
      
      // Show notification to user
      if (result.error.showNotification && window.app?.showError) {
        window.app.showError(result.error.message);
      }
    }
    
  } catch (error) {
    // Existing error handling for network issues, etc.
    console.error(`PipelinePoller: Error polling pipeline ${pipelineId}:`, error);
  }
}
```

## 5. Additional Utility Methods

### Error History and Recovery
```javascript
// Get error history for debugging
async getErrorHistory(pipelineId) {
  const query = `
    SELECT error_api, error_type, error_message, error_time, previous_status
    FROM pipelines 
    WHERE pipeline_id = $1 
    AND error_time IS NOT NULL
    ORDER BY error_time DESC`;
    
  return await this.databaseManager.query(query, [pipelineId]);
}

// Check if pipeline can be retried
async canRetryWorkflow(pipelineId) {
  const pipeline = await this.databaseManager.getPipeline(pipelineId);
  
  // Can retry if status is in a "ready" state (not currently running)
  const retryableStatuses = ['pending', 'research_complete', 'legal_resolution_complete'];
  return retryableStatuses.includes(pipeline.status);
}

// Clear error state when user manually retries
async clearErrorState(pipelineId) {
  const query = `
    UPDATE pipelines 
    SET error_api = NULL,
        error_type = NULL,
        error_message = NULL,
        error_time = NULL,
        previous_status = NULL
    WHERE pipeline_id = $1`;
    
  return await this.databaseManager.query(query, [pipelineId]);
}
```


## 7. Implementation Checklist

1. **Create WorkflowErrorHandler.js** in `/server/utils/`
2. **Update database schema** with new columns
3. **Update Manager.js** to use error handler in try/catch blocks
4. **Update PipelinePoller.js** to handle API error responses
5. **Test error scenarios** with each API (Claude, Firecrawl, Form5500)
6. **Add logging** for error tracking and debugging

## 8. Corrected Error Detection Implementation

### Two-Layer Error Detection System

After reviewing the actual codebase, here are the exact locations where error detection should be implemented:

1. **Tool Use Layer**: In **ToolManager.js** `callTool()` method - catches errors from MCP tools (Firecrawl, Perplexity only)
2. **Claude API Layer**: In **TaskExecution.js** where Claude responses are processed - catches Anthropic API errors

### Layer 1: ToolManager.js Error Detection

Update the existing `callTool` method's error handling:

```javascript
// In ToolManager.js - Update the responseHandler in callTool method
const responseHandler = (data) => {
  try {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const message = JSON.parse(line);
        if (message.id === id) {
          process.stdout.removeListener('data', responseHandler);
          if (message.error) {
            // Create standardized error based on which tool failed
            const apiName = this.getAPINameFromTool(toolName, tool.serverName);
            const workflowError = new WorkflowAPIError({
              apiName: apiName,
              originalError: message.error,
              statusCode: message.error.code, // JSON-RPC error code, not HTTP status
              errorType: 'tool_api_error'
            });
            reject(workflowError);
          } else {
            resolve(message.result);
          }
          return;
        }
      }
    }
  } catch (error) {
    // JSON parsing error or other communication issue
    const apiName = this.getAPINameFromTool(toolName, tool.serverName);
    const workflowError = new WorkflowAPIError({
      apiName: apiName,
      originalError: error,
      statusCode: null,
      errorType: 'tool_communication_error'
    });
    reject(workflowError);
  }
};

// Update the existing timeout handler (lines 55-58 in original ToolManager.js)
setTimeout(() => {
  process.stdout.removeListener('data', responseHandler);
  const apiName = this.getAPINameFromTool(toolName, tool.serverName);
  const workflowError = new WorkflowAPIError({
    apiName: apiName,
    originalError: new Error('MCP tool call timeout'),
    statusCode: 408, // HTTP timeout status code for timeouts
    errorType: 'tool_timeout_error'
  });
  reject(workflowError);
}, 60000);

// Add helper method to ToolManager class
getAPINameFromTool(toolName, serverName) {
  const apiMapping = {
    'firecrawl': 'Firecrawl API',
    'perplexity': 'Perplexity API'
    // No form5500 - it's database access, not an MCP server
  };
  
  return apiMapping[serverName] || `${serverName} API`;
}
```

### Layer 2: TaskExecution.js Error Detection

Replace the existing Claude error check (around line 52-54):

```javascript
// In TaskExecution.js - Replace the existing error check
if (!response.success) {
  throw new WorkflowAPIError({
    apiName: 'Claude API',
    originalError: { message: response.error, type: response.errorType },
    statusCode: response.status || response.error?.status, // Anthropic returns HTTP status codes
    errorType: 'llm_api_error'
  });
}
```

### Implementation Notes

- Tool errors use JSON-RPC error codes (`message.error.code`)
- Claude API errors use HTTP status codes (`response.status`)
- MCP servers: firecrawl and perplexity only
- Timeout handler updates existing 60-second timeout in ToolManager.js

## 9. Critical Error Bubbling Fixes Required

WorkflowAPIErrors are currently being caught and converted to text instead of bubbling up to Manager.js.

### Fix 1: TaskExecution.js - Let Tool Errors Bubble Up

**Problem**: In `executeToolCalls()` method (lines 171-180), tool errors get converted to text results instead of propagating:

```javascript
// CURRENT CODE - ❌ Swallows WorkflowAPIErrors
} catch (error) {
  logger.error(`  ✗ ${toolCall.name} failed:`, error.message);
  
  toolResults.push({
    type: 'tool_result',
    tool_use_id: toolCall.id,
    content: `Error: ${error.message}`,  // Error becomes text!
    is_error: true
  });
}
```

**SOLUTION**: Check for WorkflowAPIError and let it bubble up:

```javascript
// NEW CODE - ✅ Lets API errors bubble up
} catch (error) {
  // Check if it's a WorkflowAPIError that should bubble up to Manager.js
  if (error.isWorkflowError) {
    throw error; // Let it bubble up to WorkflowManager, then to Manager.js
  }
  
  // Only convert non-API errors to tool results (programming errors, etc.)
  logger.error(`  ✗ ${toolCall.name} failed:`, error.message);
  toolResults.push({
    type: 'tool_result',
    tool_use_id: toolCall.id,
    content: `Error: ${error.message}`,
    is_error: true
  });
}
```

### Fix 2: WorkflowManager.js - Let Task Errors Bubble Up

**Problem**: In `executeWorkflow()` method (lines 101-104), TaskExecution errors get logged but don't propagate:

```javascript
// CURRENT CODE - ❌ Swallows WorkflowAPIErrors  
} catch (error) {
  logger.error(`💥 Task ${task.id} threw an error: ${error.message}`);
  break;  // Error doesn't bubble up to Manager.js!
}
```

**SOLUTION**: Check for WorkflowAPIError and let it bubble up:

```javascript
// NEW CODE - ✅ Lets API errors bubble up
} catch (error) {
  // Check if it's a WorkflowAPIError that should bubble up to Manager.js
  if (error.isWorkflowError) {
    throw error; // Let it bubble up to Manager.js
  }
  
  // Only log and break for non-API errors (programming errors, etc.)
  logger.error(`💥 Task ${task.id} threw an error: ${error.message}`);
  break;
}
```

### Error Flow After Fixes

1. **ToolManager.callTool()** throws WorkflowAPIError
2. **TaskExecution.executeToolCalls()** catches it → **checks `error.isWorkflowError`** → **re-throws it**
3. **WorkflowManager.executeWorkflow()** catches it → **checks `error.isWorkflowError`** → **re-throws it**
4. **Manager.js workflow methods** catch it → **routes to WorkflowErrorHandler**


## 10. Manager.js WorkflowErrorHandler Integration

### Initialize WorkflowErrorHandler in Constructor

Add WorkflowErrorHandler to the Manager class:

```javascript
// Add to imports at top of Manager.js
const WorkflowErrorHandler = require('./utils/WorkflowErrorHandler');

class Manager {
  constructor() {
    this.taskManager = null;
    this.dataExtractionService = new DataExtractionService();
    this.databaseManager = DatabaseManager.getInstance();
    
    // Add WorkflowErrorHandler initialization
    this.errorHandler = new WorkflowErrorHandler(this.databaseManager, logger);
  }
```

### Update runResearch() Error Handling (Lines 113-122)

Replace the existing generic error handling with WorkflowAPIError detection:

```javascript
// CURRENT CODE - Generic error handling
} catch (error) {
  logger.error(`❌ Research failed for pipeline ${pipelineId}:`, error.message);
  
  await this.databaseManager.updatePipeline(pipelineId, {
    status: PIPELINE_STATUSES.RESEARCH_FAILED
  });
  
  throw error;
}

// NEW CODE - API-aware error handling  
} catch (error) {
  // Check if it's an API error that should trigger rollback and client notification
  if (error.isWorkflowError) {
    return await this.errorHandler.handleWorkflowFailure(
      pipelineId, 
      PIPELINE_STATUSES.RESEARCH_RUNNING, 
      error, 
      error.apiName
    );
  }
  
  // Handle programming/logic errors the same way as before
  logger.error(`❌ Research failed for pipeline ${pipelineId}:`, error.message);
  await this.databaseManager.updatePipeline(pipelineId, {
    status: PIPELINE_STATUSES.RESEARCH_FAILED
  });
  throw error;
}
```

### Update runLegalResolution() Error Handling (Lines 195-204)

```javascript
// NEW CODE - API-aware error handling
} catch (error) {
  if (error.isWorkflowError) {
    return await this.errorHandler.handleWorkflowFailure(
      pipelineId, 
      PIPELINE_STATUSES.LEGAL_RESOLUTION_RUNNING, 
      error, 
      error.apiName
    );
  }
  
  // Handle programming/logic errors the same way as before
  logger.error(`❌ Legal resolution failed for pipeline ${pipelineId}:`, error.message);
  logger.error('Full error details:', error);
  await this.databaseManager.updatePipeline(pipelineId, {
    status: PIPELINE_STATUSES.LEGAL_RESOLUTION_FAILED
  });
  throw error;
}
```

### Update runDataExtraction() Error Handling (Lines 247-255)

```javascript
// NEW CODE - API-aware error handling
} catch (error) {
  if (error.isWorkflowError) {
    return await this.errorHandler.handleWorkflowFailure(
      pipelineId, 
      PIPELINE_STATUSES.DATA_EXTRACTION_RUNNING, 
      error, 
      error.apiName
    );
  }
  
  // Handle programming/logic errors the same way as before
  logger.error(`❌ Data extraction failed for pipeline ${pipelineId}:`, error.message);
  await this.databaseManager.updatePipeline(pipelineId, {
    status: PIPELINE_STATUSES.DATA_EXTRACTION_FAILED
  });
  throw error;
}
```


### Error Flow Summary

**API Errors**: WorkflowAPIError → WorkflowErrorHandler → Pipeline rollback → Client notification → User retry

**Programming Errors**: Regular Error → Existing error handling → Pipeline failed → Manual investigation