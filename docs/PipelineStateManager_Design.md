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
     * Validates: firm name is valid, not duplicate active pipeline for firm
     */
    async createPipeline(firmName) {
        // 1. Validate firm name format
        // 2. Check for existing active pipelines for same firm
        // 3. Validate system capacity/limits
        // 4. Call Manager.createPipeline() if valid
        // 5. Return consistent result format
    }

    /**
     * Start research workflow for a pipeline
     * Validates: pipeline exists, status is 'pending', not already running
     */
    async startResearch(pipelineId) {
        // 1. Validate current state
        // 2. Check for concurrent operations
        // 3. Call Manager.runResearch() if valid
        // 4. Handle errors gracefully
    }

    /**
     * Start legal resolution workflow
     * Validates: pipeline exists, status is 'research_complete'
     */
    async startLegalResolution(pipelineId) {
        // 1. Validate pipeline exists
        // 2. Validate status is 'research_complete'
        // 3. Check for concurrent operations
        // 4. Call Manager.runLegalResolution() if valid
    }

    /**
     * Start data extraction workflow
     * Validates: pipeline exists, status is 'legal_resolution_complete'
     */
    async startDataExtraction(pipelineId) {
        // 1. Validate pipeline exists
        // 2. Validate status is 'legal_resolution_complete'
        // 3. Check for concurrent operations
        // 4. Call Manager.runDataExtraction() if valid
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
     * Reset a failed/cancelled pipeline
     * Validates: pipeline exists, status allows reset
     */
    async resetPipeline(pipelineId) {
        // 1. Validate pipeline exists
        // 2. Validate status allows reset (failed/cancelled)
        // 3. Call existing Manager.resetPipeline() if valid
    }

    /**
     * Delete a pipeline
     * Validates: pipeline exists, safe to delete
     */
    async deletePipeline(pipelineId) {
        // 1. Validate pipeline exists
        // 2. Cancel if currently running
        // 3. Call database delete if safe
        // 4. Clean up any related resources
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
     * Prevent concurrent operations on same pipeline
     */
    isOperationInProgress(pipelineId) {
        // Track in-flight operations to prevent button spam
        // Return: boolean
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

**Add Import and Initialize StateManager:**
```javascript
// ADD at top with other imports
const PipelineStateManager = require('../utils/PipelineStateManager');

// ADD after manager initialization
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

**Remove Entire resetPipeline Method (Lines 348-408):**
```javascript
// REMOVE ENTIRE METHOD - PipelineStateManager handles this
async resetPipeline(pipelineId) {
  // ... entire method removed
}
```

**Update Exports (Line 421):**
```javascript
// BEFORE:
const resetPipeline = (pipelineId) => manager.resetPipeline(pipelineId);

// AFTER:
// Remove this line - resetPipeline no longer exists in Manager
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
- `/server/routes/pipeline.js` - 7 method calls changed + 1 new cancel route
- `/server/Manager.js` - 10 status update removals + 1 method deletion + exports cleanup

**MEDIUM IMPACT:**
- Create `/server/utils/PipelineStateManager.js` - New comprehensive class

**LOW IMPACT:**
- All other files remain unchanged

**Total Changes:** ~25 code modifications across 3 files, with primary complexity in implementing the new PipelineStateManager class and refactoring existing route handlers to use validation-first architecture.

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