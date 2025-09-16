# PipelineStateManager Design Document

## Overview

The PipelineStateManager is a new architectural component that serves as a **gatekeeper** for all pipeline state transitions and operations. It validates requests, prevents invalid state changes, and coordinates with existing Manager methods to ensure data integrity and prevent race conditions.

## Problem Statement

Currently, pipeline operations are called directly through routes → Manager methods. This creates several issues:

1. **No validation of state transitions** - Users can attempt invalid operations
2. **Button spam vulnerability** - Multiple rapid clicks can cause race conditions
3. **Inconsistent error handling** - Different methods handle validation differently
4. **Direct Manager access** - Routes bypass any centralized validation logic

## Solution Architecture

### Core Concept
**All pipeline operations must flow through PipelineStateManager first.** It acts as a validation and coordination layer before calling existing Manager methods.

```
Client Request → Route → PipelineStateManager → Manager (if valid)
```

## High-Level Class Design

```javascript
class PipelineStateManager {

    constructor() {
        // Initialize dependencies
        this.databaseManager = DatabaseManager.getInstance();
        this.manager = new Manager();
        this.operations = new Map(); // Track in-progress operations
        this.cancellationManager = WorkflowCancellationManager.getInstance();
    }

    // ============================================
    // CORE STATE VALIDATION & COORDINATION
    // ============================================

    /**
     * Create a new pipeline
     */
    async createPipeline(firmName) {
        try {
            // Call Manager.createPipeline() directly
            const pipeline = await this.manager.createPipeline(firmName);

            // Return consistent result format
            return {
                success: true,
                pipeline: pipeline,
                operation: 'create',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Start research workflow for a pipeline
     * Validates: pipeline exists, status is 'pending', not already running
     */
    async startResearch(pipelineId) {
        try {
            // 1. Check if ANY operation is in progress (global blocking)
            if (this.hasAnyOperationInProgress()) {
                return {
                    success: false,
                    error: 'Another pipeline operation is already running. Please wait for it to complete.',
                    code: 'SYSTEM_BUSY',
                    pipeline_id: pipelineId
                };
            }

            // 2. Check if THIS pipeline has operation in progress (button spam protection)
            if (this.isOperationInProgress(pipelineId)) {
                return {
                    success: false,
                    error: 'Operation already in progress',
                    code: 'OPERATION_IN_PROGRESS',
                    pipeline_id: pipelineId
                };
            }

            // 3. Validate pipeline exists and state
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            if (pipeline.status !== 'pending') {
                return {
                    success: false,
                    error: `Cannot start research. Status: ${pipeline.status}`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 4. Mark operation in progress & set running status
            this.markOperationStarted(pipelineId, 'research');
            await this.databaseManager.updatePipeline(pipelineId, {
                status: 'research_running'
            });

            // 5. Call Manager method asynchronously
            this.manager.runResearch(pipelineId)
                .finally(() => {
                    this.markOperationCompleted(pipelineId, 'research');
                });

            // 6. Return immediate success (like current routes)
            return {
                success: true,
                message: 'Research started',
                pipeline_id: pipelineId,
                operation: 'start-research',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.markOperationCompleted(pipelineId, 'research');
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Start legal resolution workflow
     * Validates: pipeline exists, status is 'research_complete'
     */
    async startLegalResolution(pipelineId) {
        // Follows same pattern as startResearch:
        // 1. Check if ANY operation is in progress (global blocking)
        // 2. Check if THIS pipeline has operation in progress (button spam protection)
        // 3. Validate pipeline exists and status is 'research_complete'
        // 4. Mark operation started & set 'legal_resolution_running' status
        // 5. Call this.manager.runLegalResolution(pipelineId) asynchronously
        // 6. Return immediate success response
        // 7. Handle errors with consistent format
    }

    /**
     * Start data extraction workflow
     * Validates: pipeline exists, status is 'legal_resolution_complete'
     */
    async startDataExtraction(pipelineId) {
        // Follows same pattern as startResearch:
        // 1. Check if ANY operation is in progress (global blocking)
        // 2. Check if THIS pipeline has operation in progress (button spam protection)
        // 3. Validate pipeline exists and status is 'legal_resolution_complete'
        // 4. Mark operation started & set 'data_extraction_running' status
        // 5. Call this.manager.runDataExtraction(pipelineId) asynchronously
        // 6. Return immediate success response
        // 7. Handle errors with consistent format
    }

    /**
     * Cancel a running pipeline
     * Validates: pipeline exists, status is '*_running', not already cancelled
     */
    async cancelPipeline(pipelineId, reason = 'user_requested') {
        // 1. Validate pipeline exists
        // 2. Validate pipeline can be cancelled (is running)
        // 3. Check not already cancelled
        // 4. Use existing WorkflowCancellationManager
        // 5. Update status to cancelled
    }

    /**
     * Reset a failed pipeline
     * Validates: pipeline exists, status is '*_failed'
     */
    async resetPipeline(pipelineId) {
        try {
            // 1. Validate pipeline exists
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            // 2. Validate status allows reset (only failed states)
            const resetableStatuses = ['research_failed', 'legal_resolution_failed', 'data_extraction_failed'];
            if (!resetableStatuses.includes(pipeline.status)) {
                return {
                    success: false,
                    error: `Cannot reset pipeline with status: ${pipeline.status}. Only failed pipelines can be reset.`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 3. Use existing Manager resetPipeline logic
            const result = await this.manager.resetPipeline(pipelineId);

            if (!result.success) {
                return {
                    success: false,
                    error: result.error,
                    code: 'RESET_FAILED',
                    pipeline_id: pipelineId
                };
            }

            // 4. Clear any operation tracking
            this.clearOperationTracking(pipelineId);

            // 5. Return success with updated pipeline
            return {
                success: true,
                message: result.message,
                pipeline: result.pipeline,
                pipeline_id: pipelineId,
                operation: 'reset',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Delete a pipeline
     * Validates: pipeline exists, safe to delete
     */
    async deletePipeline(pipelineId) {
        try {
            // 1. Validate pipeline exists
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            // 2. Check pipeline is not currently running
            const runningStatuses = ['research_running', 'legal_resolution_running', 'data_extraction_running'];
            if (runningStatuses.includes(pipeline.status)) {
                return {
                    success: false,
                    error: `Cannot delete pipeline while ${pipeline.status.replace('_', ' ')}`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 3. Call database delete
            await this.databaseManager.deletePipeline(pipelineId);

            // 4. Clear any operation tracking
            this.clearOperationTracking(pipelineId);

            // 5. Return success
            return {
                success: true,
                message: 'Pipeline deleted successfully',
                pipeline_id: pipelineId,
                operation: 'delete',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR',
                timestamp: new Date().toISOString()
            };
        }
    }

    // ============================================
    // VALIDATION HELPERS
    // ============================================

    /**
     * Check if operation is valid for current pipeline state
     */
    async validateOperation(pipelineId, operation) {
        // 1. Pipeline exists?
        // 2. Current status allows operation?
        // 3. No concurrent operations?
        // 4. System ready?
        // Return: { valid: boolean, error?: string }
    }

    /**
     * Check if ANY operation is in progress across all pipelines
     */
    hasAnyOperationInProgress() {
        // Check if this.operations Map has any entries
        // Return: boolean
        return this.operations.size > 0;
    }

    /**
     * Check if operation is in progress for specific pipeline
     */
    isOperationInProgress(pipelineId) {
        // Track in-flight operations to prevent button spam
        // Return: boolean
        return this.operations.has(String(pipelineId));
    }

    /**
     * Get allowed operations for current pipeline state
     */
    getAllowedOperations(currentStatus) {
        // Return: ['start-legal', 'cancel', 'delete'] etc.
        // Used by client to show/hide buttons
    }

    /**
     * Validate firm name for pipeline creation
     */
    validateFirmName(firmName) {
        // 1. Not empty/null
        // 2. Length constraints
        // 3. Character validation
        // 4. Not reserved words
        // Return: { valid: boolean, error?: string }
    }

    /**
     * Check for duplicate active pipelines
     */
    async checkDuplicatePipeline(firmName) {
        // 1. Query for existing active pipelines with same firm name
        // 2. Return boolean indicating if duplicate exists
    }

    // ============================================
    // OPERATION TRACKING
    // ============================================

    /**
     * Mark operation as started (prevent duplicates)
     */
    markOperationStarted(pipelineId, operation) {
        // Add to in-progress set: this.operations.set(pipelineId, operation)
    }

    /**
     * Mark operation as completed
     */
    markOperationCompleted(pipelineId, operation) {
        // Remove from in-progress set: this.operations.delete(pipelineId)
    }

    /**
     * Clear operation tracking (cleanup)
     */
    clearOperationTracking(pipelineId) {
        // Remove all tracking for pipeline (used on delete/error)
    }

    // ============================================
    // STATE MACHINE DEFINITIONS
    // ============================================

    /**
     * Define valid state transitions
     */
    getValidTransitions() {
        return {
            'pending': ['research_running'],
            'research_running': ['research_complete', 'research_failed', 'research_cancelled'],
            'research_complete': ['legal_resolution_running'],
            'legal_resolution_running': ['legal_resolution_complete', 'legal_resolution_failed', 'legal_resolution_cancelled'],
            'legal_resolution_complete': ['data_extraction_running'],
            'data_extraction_running': ['data_extraction_complete', 'data_extraction_failed', 'data_extraction_cancelled'],
            // Reset transitions
            'research_failed': ['pending'],
            'research_cancelled': ['pending'],
            'legal_resolution_failed': ['research_complete'],
            'legal_resolution_cancelled': ['research_complete'],
            'data_extraction_failed': ['legal_resolution_complete'],
            'data_extraction_cancelled': ['legal_resolution_complete']
        };
    }

    /**
     * Map operations to required status
     */
    getOperationRequirements() {
        return {
            'start-research': 'pending',
            'start-legal': 'research_complete',
            'start-data': 'legal_resolution_complete',
            'cancel': ['research_running', 'legal_resolution_running', 'data_extraction_running'],
            'reset': ['research_failed', 'research_cancelled', 'legal_resolution_failed', 'legal_resolution_cancelled', 'data_extraction_failed', 'data_extraction_cancelled'],
            'delete': ['pending', 'research_complete', 'legal_resolution_complete', 'data_extraction_complete', 'research_failed', 'research_cancelled', 'legal_resolution_failed', 'legal_resolution_cancelled', 'data_extraction_failed', 'data_extraction_cancelled']
        };
    }
}
```

## Key Benefits

### 1. **Single Entry Point**
All pipeline operations flow through one validation layer:
```javascript
// Routes call StateManager, not Manager directly
router.post('/:id/research', async (req, res) => {
    const result = await stateManager.startResearch(pipelineId);
    // StateManager handles all validation + calls Manager if valid
});
```

### 2. **Button Spam Protection**
```javascript
async startResearch(pipelineId) {
    if (this.isOperationInProgress(pipelineId)) {
        throw new Error('Operation already in progress');
    }
    // Proceed...
}
```

### 3. **State Validation**
```javascript
async startLegalResolution(pipelineId) {
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (pipeline.status !== 'research_complete') {
        throw new Error(`Cannot start legal resolution. Status: ${pipeline.status}`);
    }
    // Proceed...
}
```

### 4. **Consistent Error Handling**
All operations return standardized result format:
```javascript
// Success
{ success: true, pipeline: updatedPipeline }

// Error
{ success: false, error: 'Invalid state transition', code: 'INVALID_STATE' }
```

### 5. **Prevents Invalid Operations**
- No starting research on completed pipelines
- No starting data extraction before legal resolution
- No cancelling already completed pipelines
- No creating duplicate pipelines for same firm

## Implementation Strategy

### Phase 1: Create PipelineStateManager
1. Create `/server/utils/PipelineStateManager.js`
2. Implement validation methods
3. Implement operation tracking
4. Add comprehensive error handling

### Phase 2: Update Routes
1. Modify `/server/routes/pipeline.js` to call StateManager
2. Remove direct Manager calls from routes
3. Update error responses to use consistent format

### Phase 3: Integration
1. Manager methods remain unchanged (become "internal" operations)
2. Add StateManager to dependency injection
3. Update client-side error handling if needed

### Phase 4: Testing
1. Test all state transitions
2. Test concurrent operation prevention
3. Test invalid operation rejection
4. Verify existing functionality still works

## File Structure

```
/server/utils/PipelineStateManager.js    (new)
/server/routes/pipeline.js               (modified)
/server/Manager.js                       (unchanged)
/docs/PipelineStateManager_Design.md     (this document)
```

## Dependencies

- `DatabaseManager` - for pipeline queries
- `Manager` - for calling existing workflow methods
- `WorkflowCancellationManager` - for cancellation logic
- `Logger` - for operation logging

## Error Codes

Standardized error codes for consistent client handling:

- `PIPELINE_NOT_FOUND` - Pipeline doesn't exist
- `INVALID_STATE` - Current status doesn't allow operation
- `OPERATION_IN_PROGRESS` - Concurrent operation detected
- `DUPLICATE_PIPELINE` - Pipeline already exists for firm
- `INVALID_FIRM_NAME` - Firm name validation failed
- `SYSTEM_ERROR` - Internal server error
- `SYSTEM_BUSY` - Another pipeline operation is already running

## Success Response Format

```javascript
{
    success: true,
    pipeline: {
        pipeline_id: 123,
        firm_name: "Example Firm",
        status: "research_running",
        // ... full pipeline object
    },
    operation: "start-research",
    timestamp: "2024-01-15T10:30:00Z"
}
```

## Error Response Format

```javascript
{
    success: false,
    error: "Cannot start legal resolution. Status: pending",
    code: "INVALID_STATE",
    pipeline_id: 123,
    current_status: "pending",
    allowed_operations: ["start-research", "delete"],
    timestamp: "2024-01-15T10:30:00Z"
}
```

This comprehensive design ensures robust pipeline state management while maintaining compatibility with existing code.

## Complete Implementation Code Changes

### Files Requiring Changes

#### 1. `/server/routes/pipeline.js` - MAJOR REFACTOR

**Remove Manager Import and Add StateManager:**
```javascript
// REMOVE these lines:
const { Manager } = require('../Manager');
const manager = new Manager();

// ADD instead:
const PipelineStateManager = require('../utils/PipelineStateManager');
const stateManager = new PipelineStateManager();
```

**Line 20 - CREATE PIPELINE:**
```javascript
// BEFORE:
const pipeline = await manager.createPipeline(firm_name);

// AFTER:
const result = await stateManager.createPipeline(firm_name);
if (!result.success) {
  return res.status(400).json(result);
}
const pipeline = result.pipeline;
```

**Line 137 - START RESEARCH:**
```javascript
// BEFORE:
const updatedPipeline = await manager.runResearch(pipelineId);

// AFTER:
const result = await stateManager.startResearch(pipelineId);
if (!result.success) {
  return res.status(400).json(result);
}
```

**Line 170 - START LEGAL RESOLUTION:**
```javascript
// BEFORE:
const updatedPipeline = await manager.runLegalResolution(pipelineId);

// AFTER:
const result = await stateManager.startLegalResolution(pipelineId);
if (!result.success) {
  return res.status(400).json(result);
}
```

**Line 203 - START DATA EXTRACTION:**
```javascript
// BEFORE:
const updatedPipeline = await manager.runDataExtraction(pipelineId);

// AFTER:
const result = await stateManager.startDataExtraction(pipelineId);
if (!result.success) {
  return res.status(400).json(result);
}
```

**Line 362 - RESET PIPELINE:**
```javascript
// BEFORE:
const result = await manager.resetPipeline(pipelineId);

// AFTER:
const result = await stateManager.resetPipeline(pipelineId);
```

**Line 442 - DELETE PIPELINE:**
```javascript
// BEFORE:
await manager.databaseManager.deletePipeline(pipelineId);

// AFTER:
const result = await stateManager.deletePipeline(pipelineId);
if (!result.success) {
  return res.status(400).json(result);
}
```

**ADD NEW CANCEL ROUTE (after line 456):**
```javascript
// POST cancel pipeline
router.post('/:id/cancel', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    const { reason = 'user_requested' } = req.body;

    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    const result = await stateManager.cancelPipeline(pipelineId, reason);

    if (result.success) {
      logger.info(`✅ Pipeline ${pipelineId} cancelled: ${result.message}`);
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    logger.error('Cancel pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

#### 2. `/server/Manager.js` - REMOVE ONLY STARTING STATUS UPDATES

**CRITICAL FIX:** Only remove "RUNNING" status updates. Keep SUCCESS/FAILURE status updates and all data updates.

**Remove Lines 91-93 (runResearch starting status):**
```javascript
// REMOVE - StateManager handles starting status:
await this.databaseManager.updatePipeline(pipelineId, {
  status: PIPELINE_STATUSES.RESEARCH_RUNNING
});
```

**KEEP Lines 109-113 (runResearch success) - MODIFIED:**
```javascript
// KEEP - Manager handles success status and data:
await this.databaseManager.updatePipeline(pipelineId, {
  companies: JSON.stringify(companyObjects),        // KEEP DATA UPDATE
  status: PIPELINE_STATUSES.RESEARCH_COMPLETE,      // KEEP SUCCESS STATUS
  research_completed_at: new Date()                 // KEEP TIMESTAMP
});
```

**KEEP Lines 133-135 (runResearch failure):**
```javascript
// KEEP - Manager handles failure status:
await this.databaseManager.updatePipeline(pipelineId, {
  status: PIPELINE_STATUSES.RESEARCH_FAILED
});
```

**Remove Lines 161-163 (runLegalResolution starting status):**
```javascript
// REMOVE - StateManager handles starting status:
await this.databaseManager.updatePipeline(pipelineId, {
  status: PIPELINE_STATUSES.LEGAL_RESOLUTION_RUNNING
});
```

**KEEP Lines 200-204 (runLegalResolution success) - MODIFIED:**
```javascript
// KEEP - Manager handles success status and data:
await this.databaseManager.updatePipeline(pipelineId, {
  companies: JSON.stringify(enrichedCompanies),             // KEEP DATA UPDATE
  status: PIPELINE_STATUSES.LEGAL_RESOLUTION_COMPLETE,      // KEEP SUCCESS STATUS
  legal_resolution_completed_at: new Date()                 // KEEP TIMESTAMP
});
```

**KEEP Lines 226-228 (runLegalResolution failure):**
```javascript
// KEEP - Manager handles failure status:
await this.databaseManager.updatePipeline(pipelineId, {
  status: PIPELINE_STATUSES.LEGAL_RESOLUTION_FAILED
});
```

**Remove Lines 252-254 (runDataExtraction starting status):**
```javascript
// REMOVE - StateManager handles starting status:
await this.databaseManager.updatePipeline(pipelineId, {
  status: PIPELINE_STATUSES.DATA_EXTRACTION_RUNNING
});
```

**KEEP Lines 263-267 (runDataExtraction success) - MODIFIED:**
```javascript
// KEEP - Manager handles success status and data:
await this.databaseManager.updatePipeline(pipelineId, {
  companies: JSON.stringify(companiesWithForm5500),         // KEEP DATA UPDATE
  status: PIPELINE_STATUSES.DATA_EXTRACTION_COMPLETE,       // KEEP SUCCESS STATUS
  data_extraction_completed_at: new Date()                  // KEEP TIMESTAMP
});
```

**KEEP Lines 276-278 (runDataExtraction failure):**
```javascript
// KEEP - Manager handles failure status:
await this.databaseManager.updatePipeline(pipelineId, {
  status: PIPELINE_STATUSES.DATA_EXTRACTION_FAILED
});
```

**Keep resetPipeline Method (Lines 348-408) - INTERNAL USE ONLY:**
```javascript
// KEEP METHOD - StateManager will call this internally
async resetPipeline(pipelineId) {
  // ... keep entire method as-is for internal use
}
```

**Remove resetPipeline from Exports (Line 421):**
```javascript
// REMOVE - no longer exposed externally:
const resetPipeline = (pipelineId) => manager.resetPipeline(pipelineId);
```

**Update Module Exports (Line 431):**
```javascript
// BEFORE:
module.exports = {
  createPipeline,
  runResearch,
  runLegalResolution,
  runDataExtraction,
  runCompletePipeline,
  retryStep,
  resetPipeline,        // REMOVE THIS
  getAllPipelines,
  Manager,
  PIPELINE_STATUSES
};

// AFTER:
module.exports = {
  createPipeline,
  runResearch,
  runLegalResolution,
  runDataExtraction,
  runCompletePipeline,
  retryStep,
  getAllPipelines,
  Manager,
  PIPELINE_STATUSES
};
```

#### 3. NEW FILE: `/server/utils/PipelineStateManager.js`

**Create Complete Implementation (300+ lines):**
- Full class from design document
- All validation methods
- Operation tracking
- Manager integration
- Error handling

#### 4. Files NOT Requiring Changes

- `/server/routes/healthcheck.js` - No pipeline operations
- `/server/routes/polling.js` - No pipeline operations
- `/server/routes/auth.js` - No pipeline operations
- `/server/routes/testing.js` - Independent testing routes

### Summary by Impact

**HIGH IMPACT:**
- `/server/routes/pipeline.js` - Remove Manager import/instance + 7 method calls changed + 1 new cancel route
- `/server/Manager.js` - 3 starting status update removals + exports cleanup (keep resetPipeline method as internal)

**MEDIUM IMPACT:**
- Create `/server/utils/PipelineStateManager.js` - New comprehensive class

**LOW IMPACT:**
- All other files remain unchanged

**Total Changes:** ~20 code modifications across 3 files, with primary complexity in implementing the new PipelineStateManager class and refactoring existing route handlers to use validation-first architecture.

## Critical Issues Fixed

### 🚨 Issue #1: Status Update Responsibility (FIXED)
**Problem:** Original design removed ALL status updates from Manager, which would break success/failure tracking.

**Solution:** Clear separation of responsibilities:
- **StateManager:** Sets "RUNNING" status before calling Manager
- **Manager:** Sets "COMPLETE/FAILED" status after doing work
- **Data Updates:** Always handled by Manager (companies, timestamps)

### 🚨 Issue #2: Missing Dependencies (FIXED)
**Problem:** StateManager needs access to DatabaseManager and Manager instances.

**Solution:** Added constructor with proper dependency injection:
```javascript
constructor() {
  this.databaseManager = DatabaseManager.getInstance();
  this.manager = new Manager();
  this.operations = new Map();
  this.cancellationManager = WorkflowCancellationManager.getInstance();
}
```

### 🚨 Issue #3: Data Loss Prevention (FIXED)
**Problem:** Original design would remove essential data updates (companies, timestamps).

**Solution:** Manager methods keep ALL data updates and completion status updates. Only remove starting status updates that StateManager now handles.

## Implementation Flow

1. **StateManager receives request** → validates state and operation
2. **StateManager sets RUNNING status** → marks operation in progress
3. **StateManager calls Manager method** → if validation passes
4. **Manager does business logic** → workflows, data processing
5. **Manager sets final status** → COMPLETE/FAILED with data updates
6. **StateManager clears operation tracking** → allows next operation

This ensures data integrity while preventing race conditions and invalid state transitions.

### 🚨 Issue #4: Manager Instance Duplication (FIXED)
**Problem:** Having both routes create Manager instances AND StateManager create Manager instances leads to confusion and potential inconsistencies.

**Solution:**
- **Remove Manager import/instantiation from pipeline.js routes**
- **StateManager owns and manages its internal Manager instance**
- **Routes only interact with StateManager**
- **Clean architecture:** Routes → StateManager → Manager (internal)

This eliminates duplicate Manager instances and ensures all pipeline operations flow through the validation layer.

## Quick Testing Strategy

After implementation, create a test script to validate StateManager edge cases without running full workflows:

### **Test Categories:**
1. **Global Operation Blocking** - Start workflow, verify other workflows blocked but CRUD operations allowed
2. **State Validation** - Test invalid transitions (legal resolution on pending pipeline, etc.)
3. **Button Spam Protection** - Rapid-fire same operation requests
4. **Pipeline Not Found** - Operations on non-existent pipelines
5. **Delete Safety** - Try deleting running pipelines
6. **Reset Restrictions** - Reset attempts on non-failed pipelines

### **Mock Data Setup:**
- Create test pipelines in various states
- Manually set pipeline status to failed states for reset testing
- Use database queries to simulate edge cases quickly

### **Automated Validation:**
- Fire rapid concurrent requests
- Validate specific error codes (SYSTEM_BUSY, INVALID_STATE, etc.)
- Test response timing (should be immediate, not workflow-dependent)
- Clean up test data automatically

This approach validates all validation logic and edge cases in seconds rather than waiting for full workflow execution.