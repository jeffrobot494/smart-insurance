# WorkflowErrorHandler Class Design

## Overview

The `WorkflowErrorHandler` class handles API errors during workflow execution with clear database tracking and standardized error responses.

## 1. Class Design

### WorkflowErrorHandler Class Structure

```javascript
class WorkflowErrorHandler {
  constructor(databaseManager, logger)
  
  // Main error handling method
  async handleWorkflowFailure(pipelineId, currentStatus, error, apiName)
  
  // Error recording with clear data entries
  async recordAPIError(pipelineId, errorData)
  
  // Status management
  defineResetBehavior(currentStatus)
  getWorkflowName(currentStatus)
  classifyError(error)
  
  // Utility methods
  async getErrorHistory(pipelineId)
  async canRetryWorkflow(pipelineId)
  async clearErrorState(pipelineId)
}
```

### Standardized Error Class

```javascript
class WorkflowAPIError extends Error {
  constructor({ apiName, originalError, statusCode, errorType }) {
    super(originalError.message);
    this.apiName = apiName;
    this.originalError = originalError;
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.isWorkflowError = true; // Flag for easy detection in Manager.js
  }
}
```

## 2. Database Schema

Add this column to the existing `pipelines` table:

```sql
ALTER TABLE pipelines ADD COLUMN error JSONB;
```

The error object structure:
```javascript
error: {
    api: "Claude API" | "Firecrawl API" | "Perplexity API",
    type: "credits_exhausted" | "rate_limit" | "server_error" | "authorization_failed" | "timeout_error",
    message: "Specific error message from the API",
    time: "2025-01-15T10:30:00Z",
    state: "research_running" | "legal_resolution_running" | "data_extraction_running"
}
```

### Error Recording Method
```javascript
async recordAPIError(pipelineId, errorData) {
  const errorObject = {
    api: errorData.apiName,
    type: errorData.errorType,
    message: errorData.errorMessage,
    time: new Date().toISOString(),
    state: errorData.currentState
  };
  
  await this.databaseManager.updatePipeline(pipelineId, {
    status: `${errorData.currentState.split('_')[0]}_failed`,
    error: JSON.stringify(errorObject)
  });
}
```

### Example Database View After Errors
```
pipeline_id | firm_name    | status              | error
1          | "Blackstone" | "research_failed"   | {"api":"Claude API","type":"credits_exhausted","message":"Insufficient credits","time":"2025-01-15T10:30:00Z","state":"research_running"}
2          | "KKR"        | "legal_resolution_failed" | {"api":"Perplexity API","type":"server_error","message":"Service temporarily unavailable","time":"2025-01-15T11:45:00Z","state":"legal_resolution_running"}
3          | "Apollo"     | "legal_resolution_failed" | {"api":"Perplexity API","type":"rate_limit","message":"Rate limit exceeded","time":"2025-01-15T12:15:00Z","state":"legal_resolution_running"}
```

## 3. Error Handler Methods

### Main Error Handling Method
```javascript
async handleWorkflowFailure(pipelineId, currentStatus, error, apiName) {
  
  // 1. Record error in database (set status to *_failed)
  await this.recordAPIError(pipelineId, {
    apiName: apiName,
    errorMessage: error.message,
    currentWorkflow: this.getWorkflowName(currentStatus),
    errorType: this.classifyError(error),
    currentState: currentStatus,
    httpStatusCode: error.status || null,
    timestamp: new Date()
  });
  
  // 2. Set cancellation flag to stop all workflow processes immediately
  const cancellationManager = WorkflowCancellationManager.getInstance();
  await cancellationManager.cancelPipeline(pipelineId, 'api_error');
  
  // 3. Done - client will learn of failure via polling
  //    Reset happens later when user clicks Reset button
}
```

### Reset Behavior Rules
```javascript
defineResetBehavior(currentStatus) {
  const rules = {
    'research_running': 'pending',                        // Start over
    'research_failed': 'pending',                         // Reset to start over
    'legal_resolution_running': 'research_complete',      // Back to previous step
    'legal_resolution_failed': 'research_complete'        // Reset to previous step
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

### Reset Pipeline Server Endpoint

The reset endpoint handles user-initiated pipeline resets after API failures:

```javascript
// Add to routes/pipeline.js
router.post('/:id/reset', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    const result = await manager.resetPipeline(pipelineId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        pipeline: result.pipeline
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
    
  } catch (error) {
    logger.error('Failed to reset pipeline:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset pipeline' 
    });
  }
});
```

Add corresponding method to Manager.js:

```javascript
async resetPipeline(pipelineId) {
  try {
    // Get current pipeline
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }
    
    // Determine reset target status
    const resetToStatus = this.errorHandler.defineResetBehavior(pipeline.status);
    
    // Reset pipeline data based on target status
    const updatedData = { ...pipeline };
    
    switch (resetToStatus) {
      case 'pending':
        // Remove all companies and data - start fresh
        updatedData.companies = [];
        break;
        
      case 'research_complete':
        // Remove legal resolution data, keep research companies
        updatedData.companies = updatedData.companies.map(company => ({
          name: company.name,
          confidence_level: company.confidence_level,
          // Remove legal_entity_name, city, state added in legal resolution
        }));
        break;
        
      // legal_resolution_complete case removed - data extraction errors don't get reset functionality
        
      default:
        return { success: false, error: `Cannot reset from status: ${pipeline.status}` };
    }
    
    // Clear error data and update status
    await this.databaseManager.updatePipeline(pipelineId, {
      status: resetToStatus,
      error: null,  // Clear error JSONB column
      companies: updatedData.companies
    });
    
    // Clear cancellation flag
    this.cancellationManager.clearCancellation(pipelineId);
    
    // Return updated pipeline
    const updatedPipeline = await this.databaseManager.getPipeline(pipelineId);
    return {
      success: true,
      message: `Pipeline reset to ${resetToStatus}`,
      pipeline: updatedPipeline
    };
    
  } catch (error) {
    logger.error('Failed to reset pipeline:', error);
    return { success: false, error: 'Failed to reset pipeline' };
  }
}
```

## 4. Error Detection Strategy

### Two-Layer Error Detection System

Error detection happens at two critical checkpoints:

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
    // Only external APIs that can fail, not database access
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

## 5. Error Bubbling Fixes Required

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

## 6. Manager.js WorkflowErrorHandler Integration

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
  // Check if it's an API error that should trigger error recording and cancellation
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
// Data extraction errors are programming/database errors, not API errors
} catch (error) {
  // All data extraction errors are treated as programming/logic errors
  logger.error(`❌ Data extraction failed for pipeline ${pipelineId}:`, error.message);
  await this.databaseManager.updatePipeline(pipelineId, {
    status: PIPELINE_STATUSES.DATA_EXTRACTION_FAILED
  });
  throw error;
}
```

## 7. Client-Side Error Handling

### NotificationManager Component

Create a persistent, non-blocking notification component for displaying detailed error information:

```javascript
// public/js/components/NotificationManager.js
class NotificationManager {
    constructor() {
        this.notifications = new Map(); // notificationId -> notification element
        this.nextId = 1;
        this.container = null;
        this.init();
    }
    
    init() {
        // Create notification container if it doesn't exist
        this.container = document.getElementById('notification-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }
    }
    
    /**
     * Show an error notification with detailed pipeline error info
     */
    showPipelineError(pipelineId, failureStatus, pipeline, errorDetails) {
        const workflowName = this.getWorkflowName(failureStatus);
        const title = `${workflowName} Failed`;
        
        let content = `Pipeline: ${pipeline.firm_name}\n`;
        
        if (errorDetails) {
            content += [
                `API: ${errorDetails.api}`,
                `Error: ${errorDetails.message}`,
                `Time: ${new Date(errorDetails.time).toLocaleString()}`,
                `\nSuggestion: ${this.getSuggestedAction(errorDetails.type)}`
            ].join('\n');
        } else {
            content += 'An error occurred. Please check the pipeline and try again.';
        }
        
        return this.show({
            type: 'error',
            title: title,
            content: content,
            persistent: true
        });
    }
    
    /**
     * Show a notification
     */
    show(options = {}) {
        const {
            type = 'info',
            title = 'Notification',
            content = '',
            duration = null, // null = persistent
            persistent = false
        } = options;
        
        const notificationId = this.nextId++;
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.dataset.notificationId = notificationId;
        
        notification.innerHTML = `
            <div class="notification-header">
                <span class="notification-title">${title}</span>
                <button class="notification-close" aria-label="Close">&times;</button>
            </div>
            <div class="notification-content">${content.replace(/\n/g, '<br>')}</div>
        `;
        
        // Add close button event listener
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => this.hide(notificationId));
        
        // Add to container
        this.container.appendChild(notification);
        this.notifications.set(notificationId, notification);
        
        // Auto-hide if not persistent
        if (!persistent && duration) {
            setTimeout(() => this.hide(notificationId), duration);
        }
        
        // Animate in
        requestAnimationFrame(() => {
            notification.classList.add('notification-show');
        });
        
        return notificationId;
    }
    
    /**
     * Hide a notification
     */
    hide(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (notification) {
            notification.classList.remove('notification-show');
            notification.classList.add('notification-hide');
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                this.notifications.delete(notificationId);
            }, 300);
        }
    }
    
    /**
     * Hide all notifications
     */
    hideAll() {
        this.notifications.forEach((notification, id) => {
            this.hide(id);
        });
    }
    
    // Helper methods
    getWorkflowName(failureStatus) {
        const workflowMap = {
            'research_failed': 'Research',
            'legal_resolution_failed': 'Legal Resolution'
            // data_extraction_failed not included - programming errors don't use notifications
        };
        return workflowMap[failureStatus] || 'Workflow';
    }
    
    getSuggestedAction(errorType) {
        const suggestions = {
            'credits_exhausted': 'Please check your API credits and add more if needed.',
            'rate_limit': 'Please wait a few minutes before retrying.',
            'server_error': 'This appears to be a temporary server issue. Please try again.',
            'authorization_failed': 'Please check your API keys in settings.',
            'timeout_error': 'The request timed out. Please check your connection and try again.'
        };
        return suggestions[errorType] || 'Please check your API configuration and try again.';
    }
}

// Create global instance
window.notificationManager = new NotificationManager();
```

### NotificationManager CSS

```css
/* Add to public/css/app.css */
.notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    max-width: 400px;
    pointer-events: none;
}

.notification {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin-bottom: 12px;
    overflow: hidden;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s ease;
    pointer-events: auto;
    border-left: 4px solid #007bff;
}

.notification-error {
    border-left-color: #dc3545;
}

.notification-success {
    border-left-color: #28a745;
}

.notification-warning {
    border-left-color: #ffc107;
}

.notification-show {
    transform: translateX(0);
    opacity: 1;
}

.notification-hide {
    transform: translateX(100%);
    opacity: 0;
}

.notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px 8px;
    border-bottom: 1px solid #eee;
}

.notification-title {
    font-weight: 600;
    font-size: 14px;
    color: #333;
}

.notification-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.notification-close:hover {
    color: #333;
}

.notification-content {
    padding: 8px 16px 12px;
    font-size: 13px;
    line-height: 1.4;
    color: #666;
    white-space: pre-line;
}
```

### ActionButtons Component Update

Update the ActionButtons component to use "Reset" instead of "Retry" for failed pipeline statuses:

```javascript
// In ActionButtons.js - Change failed status button handling
case 'research_failed':
case 'legal_resolution_failed':
    buttons.push(`<button class="btn btn-primary" data-action="reset">Reset</button>`);
    buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
    break;

case 'data_extraction_failed':
    // Programming errors need developer intervention, not user reset
    buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
    break;

// Update loading state text
case 'reset':
    button.innerHTML = '<span class="spinner"></span> Resetting...';
    break;

// Update success state text  
case 'reset':
    button.innerHTML = '✓ Reset Complete';
    break;

// Update button handler
case 'reset':
    if (window.app && window.app.handleResetPipeline) {
        await window.app.handleResetPipeline(pipelineId);
    }
    break;
```

### Reset vs Retry Functionality

- **Reset**: Clears error state and resets pipeline status to previous successful step (e.g., `pending`, `research_complete`)
- **No Auto-Retry**: Users must manually restart workflows after reset using existing action buttons
- **Reset Handler**: `handleResetPipeline()` method calls `/api/pipeline/:id/reset` endpoint and updates UI

### PipelinePoller Updates (Proper Separation of Concerns)

Remove UI update responsibility from PipelinePoller - it should only poll and notify:

```javascript
// In PipelinePoller.js - Remove UI updates from pollPipeline method
async pollPipeline(pipelineId) {
    try {
        const result = await this.api.getPipeline(pipelineId);
        
        if (result.success && result.pipeline) {
            const pipeline = result.pipeline;
            const currentStatus = pipeline.status;
            
            // ❌ REMOVE - Poller shouldn't update UI
            // this.cardManager.updatePipelineCard(pipelineId, pipeline);
            
            console.log(`PipelinePoller: Pipeline ${pipelineId} status: ${currentStatus}`);
            
            // ✅ ONLY notify orchestrator - let orchestrator handle UI
            if (this.onStatusChange) {
                this.onStatusChange(pipelineId, currentStatus, pipeline);
            }
            
            // Stop polling if pipeline has reached a final state
            if (this.isPollingComplete(currentStatus)) {
                console.log(`PipelinePoller: Pipeline ${pipelineId} reached final state: ${currentStatus}`);
                this.stopPipelinePolling(pipelineId);
            }
            
        } else {
            console.warn(`PipelinePoller: Failed to get pipeline ${pipelineId}:`, result.error);
        }
        
    } catch (error) {
        console.error(`PipelinePoller: Error polling pipeline ${pipelineId}:`, error);
    }
}
```

### SmartInsuranceApp Updates

Update the main orchestrator to handle the three error responsibilities:

```javascript
// In SmartInsuranceApp (app.js) - Updated handlePipelineStatusChange method
handlePipelineStatusChange(pipelineId, status, pipeline) {
    console.log(`Pipeline ${pipelineId} status changed to: ${status}`);
    
    // Update local pipeline data
    this.activePipelines.set(pipelineId, pipeline);
    
    // ✅ Orchestrator handles UI updates (not PipelinePoller)
    this.cards.updatePipelineCard(pipelineId, pipeline);
    
    // ✅ Handle failed statuses with error responsibilities
    if (status.endsWith('_failed')) {
        this.handlePipelineError(pipelineId, status, pipeline);
        return; // Don't continue with auto-complete logic for failed pipelines
    }
    
    // Existing auto-complete logic for successful statuses...
    if (this.autoCompletePipelines.has(pipelineId)) {
        if (status === 'research_complete') {
            console.log('Auto-complete: Starting legal resolution');
            this.handleProceedToStep(pipelineId, 'legal-resolution');
        }
        else if (status === 'legal_resolution_complete') {
            console.log('Auto-complete: Starting data extraction');
            this.handleProceedToStep(pipelineId, 'data-extraction');
        }
        else if (status === 'data_extraction_complete') {
            console.log('Auto-complete: Workflow completed');
            this.autoCompletePipelines.delete(pipelineId);
        }
    }
}

// ✅ NEW - Handle the three error responsibilities
async handlePipelineError(pipelineId, failureStatus, pipeline) {
    console.log(`Handling pipeline error for ${pipelineId}: ${failureStatus}`);
    
    try {
        // 1. ✅ Stop polling - Already handled by PipelinePoller.isPollingComplete()
        
        // 2. ✅ Fetch detailed error information from server
        const errorDetails = await this.fetchPipelineErrorDetails(pipelineId);
        
        // 3. ✅ Show persistent notification with detailed error information
        window.notificationManager.showPipelineError(pipelineId, failureStatus, pipeline, errorDetails);
        
        console.log(`Pipeline ${pipelineId} error handling complete`);
        
    } catch (error) {
        console.error('Error handling pipeline failure:', error);
        // Fallback notification
        window.notificationManager.show({
            type: 'error',
            title: 'Pipeline Error',
            content: `${this.getWorkflowName(failureStatus)} failed. Please check the pipeline and try again.`,
            persistent: true
        });
    }
}

// ✅ NEW - Fetch detailed error info
async fetchPipelineErrorDetails(pipelineId) {
    try {
        const response = await fetch(`/api/pipeline/${pipelineId}/error`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return data.error; // { api, type, message, time, state }
    } catch (error) {
        console.error('Failed to fetch pipeline error details:', error);
        return null; // Graceful degradation
    }
}

// Corresponding server endpoint - add to routes/pipeline.js:
router.get('/:id/error', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    const pipeline = await databaseManager.getPipeline(pipelineId);
    
    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Pipeline not found' });
    }
    
    res.json({
      success: true,
      error: pipeline.error ? JSON.parse(pipeline.error) : null
    });
    
  } catch (error) {
    logger.error('Failed to fetch pipeline error details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch error details' 
    });
  }
});

// ✅ NEW - Reset pipeline (called by ActionButtons reset button)
async handleResetPipeline(pipelineId) {
    console.log(`Resetting pipeline ${pipelineId}`);
    
    try {
        Utils.showLoading('Resetting pipeline...');
        
        const response = await fetch(`/api/pipeline/${pipelineId}/reset`, { 
            method: 'POST' 
        });
        
        Utils.hideLoading();
        
        if (response.ok) {
            this.showSuccess('Pipeline reset successfully. You can now start the workflow again.');
            // Refresh the pipeline to show updated status
            await this.refreshSinglePipeline(pipelineId);
        } else {
            this.showError('Failed to reset pipeline. Please try again.');
        }
        
    } catch (error) {
        Utils.hideLoading();
        console.error('Error resetting pipeline:', error);
        this.showError('Failed to reset pipeline: ' + error.message);
    }
}

// ✅ NEW - Helper methods
getWorkflowName(failureStatus) {
    const workflowMap = {
        'research_failed': 'Research',
        'legal_resolution_failed': 'Legal Resolution'
        // data_extraction_failed not included - programming errors don't use client error handling
    };
    return workflowMap[failureStatus] || 'Workflow';
}
```

## 8. Additional Utility Methods

### Error History and Recovery
```javascript
// Get error history for debugging
async getErrorHistory(pipelineId) {
  const query = `
    SELECT error
    FROM pipelines 
    WHERE pipeline_id = $1 
    AND error IS NOT NULL
    ORDER BY updated_at DESC`;
    
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
    SET error = NULL
    WHERE pipeline_id = $1`;
    
  return await this.databaseManager.query(query, [pipelineId]);
}
```

## 9. Workflow Cancellation System

### WorkflowCancellationManager Singleton Class

Create a shared cancellation manager that all workflow components can use:

```javascript
// server/utils/WorkflowCancellationManager.js
class WorkflowCancellationManager {
  static instance = null;
  
  static getInstance() {
    if (!WorkflowCancellationManager.instance) {
      WorkflowCancellationManager.instance = new WorkflowCancellationManager();
    }
    return WorkflowCancellationManager.instance;
  }
  
  constructor() {
    this.cancelledPipelines = new Set();
    this.cancellationCallbacks = new Map();
  }
  
  async cancelPipeline(pipelineId, reason = 'api_error') {
    this.cancelledPipelines.add(pipelineId);
    
    // Execute cleanup if registered
    const cleanup = this.cancellationCallbacks.get(pipelineId);
    if (cleanup) {
      await cleanup();
      this.cancellationCallbacks.delete(pipelineId);
    }
  }
  
  isCancelled(pipelineId) {
    return this.cancelledPipelines.has(pipelineId);
  }
  
  clearCancellation(pipelineId) {
    this.cancelledPipelines.delete(pipelineId);
    this.cancellationCallbacks.delete(pipelineId);
  }
  
  registerCleanup(pipelineId, cleanupFn) {
    this.cancellationCallbacks.set(pipelineId, cleanupFn);
  }
}

module.exports = WorkflowCancellationManager;
```

### Four Strategic Cancellation Checks

#### Check 1: Manager.js - Legal Resolution Company Loop

**Location**: Before processing each company in `runLegalResolution()` method (line 153)

```javascript
// Add to imports
const WorkflowCancellationManager = require('./utils/WorkflowCancellationManager');

class Manager {
  constructor() {
    this.taskManager = null;
    this.dataExtractionService = new DataExtractionService();
    this.databaseManager = DatabaseManager.getInstance();
    
    // Add cancellation manager
    this.cancellationManager = WorkflowCancellationManager.getInstance();
  }

  async runLegalResolution(pipelineId) {
    await this.initializeTaskManager();
    
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== PIPELINE_STATUSES.RESEARCH_COMPLETE) {
      throw new Error(`Legal resolution requires research to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`🏢 Starting legal entity resolution for ${pipeline.companies.length} companies`);
    
    try {
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: PIPELINE_STATUSES.LEGAL_RESOLUTION_RUNNING 
      });

      const enrichedCompanies = [];
      
      for (const company of pipeline.companies) {
        // CANCELLATION CHECK 1 - Before each company
        if (this.cancellationManager.isCancelled(pipelineId)) {
          throw new Error('Pipeline cancelled during legal resolution');
        }
        
        const legalResolutionInput = `Firm: ${pipeline.firm_name}, Company: ${company.name}`;
        
        const workflowData = readWorkflow('portfolio_company_verification.json');
        const result = await this.taskManager.executeWorkflow(workflowData, { 
          input: legalResolutionInput
        }, pipelineId);

        // ... rest of existing company processing logic ...
      }

      // ... rest of existing method ...
    } catch (error) {
      // ... existing error handling ...
    }
  }
}
```

#### Check 2: WorkflowManager.js - Task Execution Loop

**Location**: Inside the try block before each task execution (line 67)

```javascript
// Add to imports
const WorkflowCancellationManager = require('../utils/WorkflowCancellationManager');

class WorkflowManager {
  constructor(toolManager) {
    this.currentIndex = 0;
    this.toolManager = toolManager;
    
    // Add cancellation manager
    this.cancellationManager = WorkflowCancellationManager.getInstance();
  }

  async executeWorkflow(workflowData, userInput, pipelineId = null) {
    this.workflowData = workflowData;
    if (!this.workflowData) {
      throw new Error('workflowData must be provided to WorkflowManager');
    }

    if (!this.toolManager) {
      throw new Error('ToolManager must be provided to WorkflowManager');
    }
    
    this.tasks = workflowData.workflow.tasks;

    const currentInput = userInput.input;
    if (!currentInput) {
      throw new Error('input is required');
    }
    
    logger.info(`📋 Processing single input: ${currentInput}`);
    
    this.reset();
    
    const itemInputs = { input: currentInput };
    const taskResults = {};
    let output = null;
    
    while (this.hasMoreTasks()) {
      const task = this.getNextTask();
      
      logger.info(`🎯 Executing Task ${task.id}: ${task.name}`);
      
      const inputs = {};
      task.inputKeys.forEach(key => {
        if (itemInputs[key]) {
          inputs[key] = itemInputs[key];
          logger.info(`📥 Input ${key}: ${itemInputs[key]}`);
        }
      });
      
      try {
        // CANCELLATION CHECK 2 - Before each task execution
        if (pipelineId && this.cancellationManager.isCancelled(pipelineId)) {
          throw new Error('Pipeline cancelled during workflow execution');
        }
        
        const execution = new TaskExecution(task);
        execution.setToolManager(this.toolManager);
        execution.setPipelineId(pipelineId); // Pass pipelineId for cancellation checks
        const result = await execution.run(inputs);
        
        if (result.success) {
          logger.info(`✅ Task ${task.id} completed successfully`);
          logger.info(`📤 Output (${task.outputKey}): ${result.result}`);
          itemInputs[task.outputKey] = result.result;
          taskResults[task.id] = result;
          
          if (!this.hasMoreTasks()) {
            output = result.result;
          }
        } else {
          logger.error(`❌ Task ${task.id} failed: ${result.error}`);
          taskResults[task.id] = result;
          break;
        }
      } catch (error) {
        // Check if it's a WorkflowAPIError that should bubble up to Manager.js
        if (error.isWorkflowError) {
          throw error; // Let it bubble up to Manager.js
        }
        
        // Only log and break for non-API errors (programming errors, etc.)
        logger.error(`💥 Task ${task.id} threw an error: ${error.message}`);
        break;
      }
      
      logger.info('');
    }
    
    const result = {
      workflow_name: workflowData.workflow.name,
      input: currentInput,
      output: output,
      tasks: taskResults,
      pipelineId: pipelineId || null
    };
    
    logger.info('🏁 Workflow execution completed');
    
    return result;
  }
}
```

#### Check 3: TaskExecution.js - Conversation Loop

**Location**: Inside the conversation while loop before each iteration (line 39)

```javascript
// Add to imports
const WorkflowCancellationManager = require('../utils/WorkflowCancellationManager');

class TaskExecution {
  constructor(task) {
    this.task = task;
    this.allowedTools = task.allowed_tools || null;
    this.claudeManager = new ClaudeManager();
    this.conversationHistory = [];
    this.status = 'pending';
    this.maxIterations = 10;
    this.pipelineId = null;
    
    // Add cancellation manager
    this.cancellationManager = WorkflowCancellationManager.getInstance();
  }

  setPipelineId(pipelineId) {
    this.pipelineId = pipelineId;
  }

  async run(inputs = {}) {
    try {
      this.status = 'running';
      
      let initialPrompt = this.task.instructions;
      
      if (Object.keys(inputs).length > 0) {
        initialPrompt += '\n\nInputs:\n';
        for (const [key, value] of Object.entries(inputs)) {
          initialPrompt += `${key}: ${value}\n`;
        }
      }

      this.conversationHistory.push({
        role: 'user',
        content: initialPrompt
      });

      let iterations = 0;
      let consecutiveFailures = 0;
      const maxRetries = 3;
      
      while (iterations < this.maxIterations) {
        // CANCELLATION CHECK 3 - Before each conversation iteration
        if (this.pipelineId && this.cancellationManager.isCancelled(this.pipelineId)) {
          throw new Error('Pipeline cancelled during task execution');
        }
        
        try {
          tempLogger.info(`🚀 PROMPT TO CLAUDE:\n${JSON.stringify(this.conversationHistory, null, 2)}`);
          
          const response = await this.claudeManager.sendMessage('', {
            conversationHistory: this.conversationHistory,
            maxTokens: 2048,
            temperature: 0.3,
            tools: this.getAvailableTools()
          });

          if (!response.success) {
            throw new Error(`Claude API error: ${response.error}`);
          }

          consecutiveFailures = 0;

          const { responseText, toolCalls } = this.parseClaudeResponse(response.content);

          this.conversationHistory.push({
            role: 'assistant',
            content: response.content
          });

          if (toolCalls.length === 0) {
            this.status = 'completed';
            return {
              success: true,
              taskId: this.task.id,
              taskName: this.task.name,
              outputKey: this.task.outputKey,
              result: responseText,
              conversationHistory: this.conversationHistory
            };
          }

          const toolResults = await this.executeToolCalls(toolCalls);
          
          this.conversationHistory.push({
            role: 'user',
            content: toolResults
          });

        } catch (error) {
          consecutiveFailures++;
          logger.info(`⚠️ API call failed (attempt ${consecutiveFailures}/${maxRetries + 1}): ${error.message}`);
          
          if (consecutiveFailures > maxRetries) {
            throw error;
          }
          
          const delay = Math.pow(2, consecutiveFailures - 1) * 1000;
          logger.info(`🔄 Retrying in ${delay}ms...`);
          await this.sleep(delay);
          
          continue;
        }

        iterations++;
      }

      this.status = 'failed';
      return {
        success: false,
        taskId: this.task.id,
        error: 'Maximum iterations reached',
        errorType: 'max_iterations'
      };

    } catch (error) {
      this.status = 'failed';
      return {
        success: false,
        taskId: this.task.id,
        error: error.message,
        errorType: 'execution_error'
      };
    }
  }

  // ... rest of existing methods ...
}
```

#### Check 4: TaskExecution.js - Tool Call Loop

**Location**: Inside the tool call for loop before each tool execution (line 157)

```javascript
// In TaskExecution.js - Update executeToolCalls method
async executeToolCalls(toolCalls) {
  const toolResults = [];

  for (const toolCall of toolCalls) {
    // CANCELLATION CHECK 4 - Before each tool call
    if (this.pipelineId && this.cancellationManager.isCancelled(this.pipelineId)) {
      throw new Error('Pipeline cancelled during tool execution');
    }
    
    try {
      logger.info(`  🔧 Executing ${toolCall.name}...`);
      
      const result = await this.executeTool(toolCall.name, toolCall.input);
      
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: JSON.stringify(result, null, 2)
      });
      
      logger.info(`  ✓ ${toolCall.name} completed`);
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
  }

  return toolResults;
}
```

### Integration with WorkflowErrorHandler

Update the error handler to trigger cancellation when API errors occur:

```javascript
// In WorkflowErrorHandler.js - UPDATED VERSION (replaces old inconsistent version)
async handleWorkflowFailure(pipelineId, currentStatus, error, apiName) {
  
  // 1. Record error in database (set status to *_failed)
  await this.recordAPIError(pipelineId, {
    apiName: apiName,
    errorMessage: error.message,
    currentWorkflow: this.getWorkflowName(currentStatus),
    errorType: this.classifyError(error),
    currentState: currentStatus,
    httpStatusCode: error.status || null,
    timestamp: new Date()
  });
  
  // 2. Set cancellation flag to stop all workflow processes immediately
  const cancellationManager = WorkflowCancellationManager.getInstance();
  await cancellationManager.cancelPipeline(pipelineId, 'api_error');
  
  // 3. Done - client will learn of failure via polling
  //    Reset happens later when user clicks Reset button
}
```

### Cancellation Flow Summary

1. **API Error occurs** → bubbles to WorkflowErrorHandler
2. **WorkflowErrorHandler.handleWorkflowFailure()** called:
   - Sets cancellation flag immediately
   - Updates database with rollback status
   - Returns client response (stop polling, show notification)
3. **Meanwhile, other workflow components hit cancellation checks**:
   - Manager.js company loop check
   - WorkflowManager.js task loop check  
   - TaskExecution.js conversation loop check
   - TaskExecution.js tool call loop check
4. **Cancellation checks throw errors** → terminate execution immediately
5. **Cancellation errors bubble up** → but are ignored since work is already done

The result is immediate workflow termination with proper cleanup, database updates, and user notification.

## 10. Implementation Checklist

1. **Create WorkflowAPIError class** in `/server/utils/`
2. **Create WorkflowErrorHandler.js** in `/server/utils/`
3. **Create WorkflowCancellationManager.js** in `/server/utils/`
4. **Update database schema** with new column
5. **Update ToolManager.js** with error detection in callTool()
6. **Update TaskExecution.js** with Claude API error detection
7. **Update TaskExecution.js** with error bubbling fix in executeToolCalls()
8. **Update WorkflowManager.js** with error bubbling fix in executeWorkflow()
9. **Add four cancellation checks** to Manager.js, WorkflowManager.js, TaskExecution.js
10. **Update Manager.js** to catch WorkflowAPIError and route to ErrorHandler
11. **Update WorkflowErrorHandler** to trigger cancellation on API errors
12. **Update PipelinePoller.js** to handle API error responses
13. **Test error scenarios** with each API (Claude, Firecrawl, Perplexity)
14. **Test cancellation scenarios** at each of the four check points
15. **Add logging** for error tracking and debugging

## Error Flow Summary

### API Error → Recovery Flow

This is the complete user experience flow from API error to manual recovery:

#### 1. Normal Workflow Start
- **Status**: `pending`
- **Client**: User clicks "Start Research" button
- **Status**: `research_running` 
- **Server**: Workflow begins executing (research, legal resolution, etc.)

#### 2. API Error Occurs During Execution
- **Server**: API error occurs (Claude API, Firecrawl API, Perplexity API)
- **WorkflowErrorHandler**:
  - Sets cancellation flag → stops all workflow processes immediately
  - Updates database: `status: research_failed` (or appropriate `*_failed` status)
  - Records error details (API name, error message, timestamp) in database
- **Background Processes**: All cancellation checks detect flag and terminate execution

#### 3. Client Error Detection
- **Client Poller**: Detects `research_failed` status during regular polling
- **Client Response**:
  - Stops polling immediately  
  - Shows error notification to user: "Research failed due to Claude API error. Please check your credits."
  - Updates UI to show failed state with error details
  - Shows "Reset & Try Again" button

#### 4. User Acknowledges and Resets
- **User Action**: Reviews error, checks API credits, clicks "Reset & Try Again"
- **Client**: Makes API call `POST /pipeline/:id/reset`
- **Server**:
  - Clears cancellation flag for pipeline
  - Clears error data in database
  - Updates status: `pending`
- **Client**: Updates UI to show ready state

#### 5. Ready for Manual Retry
- **Status**: `pending`
- **Client**: User can click "Start Research" again when ready
- **User Control**: Full manual control over retry timing and decision

### Key Principles

- **Immediate Termination**: API errors stop workflow execution immediately via cancellation system
- **Clear Communication**: Client gets specific error details (which API failed, suggested actions)
- **Manual Recovery**: User must acknowledge error and manually reset - no automatic retries
- **Clean State**: After reset, pipeline returns to clean `pending` state for fresh retry
- **User Control**: Users decide when to retry after checking credits/API status

### Error Types

**API Errors**: WorkflowAPIError → WorkflowErrorHandler → Pipeline `*_failed` status + Cancellation → Client notification → Manual user reset → User retry

**Programming Errors**: Regular Error → Existing error handling → Pipeline `*_failed` status → Manual investigation