# Sequential Auto-Complete Refactor Plan

## Problem Statement

The current auto-complete system starts all pipelines simultaneously when multiple firms are entered with auto-complete checked. This causes:
- API overload from concurrent workflows
- Rate limiting issues with Claude API, Firecrawl API, and Perplexity API  
- Resource contention on shared MCP server processes
- Difficult error isolation when multiple workflows fail

## Solution Overview

Implement sequential processing where pipelines complete one at a time:
1. Decouple pipeline creation from workflow starting
2. When auto-complete is enabled and any pipeline completes fully (`data_extraction_complete`), automatically start the next incomplete pipeline
3. Remove the `autoCompletePipelines` Set and use checkbox state directly

---

## New User Experience Flow

### Current UI Flow (What We're Changing)
1. User enters firm names
2. User checks "Auto-complete workflow" checkbox  
3. User clicks "Start" button
4. **Result**: Pipelines are created AND research starts automatically on all pipelines

### New UI Flow (What We Want)

#### Phase 1: Pipeline Creation Only
1. User enters firm names
2. User clicks **"Create Pipelines"** button (renamed from "Start")
3. **Result**: Pipelines are created with `pending` status, but NO workflows start

#### Phase 2: Starting Workflows (Two Paths)

**Path A: Auto-Complete Mode**
1. User checks "Auto-complete workflow" checkbox
2. User clicks **"Start Research"** on any pipeline card
3. **Result**: That pipeline starts, and when it completes, sequential auto-complete processing automatically continues with the next incomplete pipeline

**Path B: Manual Mode**  
1. User leaves "Auto-complete workflow" checkbox unchecked
2. User clicks individual **"Start Research"** buttons on each pipeline card as desired
3. **Result**: Each pipeline runs independently - no automatic progression

### UI Element Changes

**Current**:
```
[Firm Input Field]
[Auto-complete checkbox] ☑ Auto-complete workflow
[Start] [Clear]
```

**New**:
```
[Firm Input Field]
[Auto-complete checkbox] ☑ Auto-complete workflow
[Create Pipelines] [Clear]
```

### Logic Flow Examples

**Example 1: Auto-Complete User**
1. Enter "Firm A, Firm B, Firm C"
2. Click **"Create Pipelines"** → 3 pipeline cards appear, all `pending`
3. Check "Auto-complete workflow"
4. Click **"Start Research"** on any pipeline (let's say Firm A)
5. **Result**: Firm A completes fully, then Firm B starts automatically, then Firm C starts automatically

**Example 2: Manual User**
1. Enter "Firm A, Firm B, Firm C" 
2. Click **"Create Pipelines"** → 3 pipeline cards appear, all `pending`
3. Leave "Auto-complete workflow" unchecked
4. Click **"Start Research"** on individual cards as desired
5. **Result**: Only the pipelines you manually start will run

**Example 3: Mixed Mode User**
1. Enter "Firm A, Firm B, Firm C"
2. Click **"Create Pipelines"** → 3 pipeline cards appear
3. Manually click **"Start Research"** on Firm A (no auto-complete)
4. While Firm A is running, check "Auto-complete workflow"
5. **Result**: When Firm A completes, Firm B automatically starts, then Firm C

---

## Workflow Sequencing Refactor

### Problem
Currently there are three different methods to start pipeline workflows:
- `handleStartPipeline()` - Creates pipelines and starts workflows automatically
- `handleStartResearch()` - Starts research workflow specifically  
- `handleProceedToStep()` - Advances to a specified workflow step

This creates duplication, confusion, and inconsistent polling behavior.

### Solution
Consolidate all workflow starting into a single status-driven method that:
1. Determines the next step based on current pipeline status
2. Starts polling automatically if not already active
3. Executes the appropriate API call for the next workflow step

### Implementation

#### New Consolidated Method
**File**: `/public/js/app.js`  
**Add this new method**:

```javascript
async proceedToNextStep(pipelineId) {
    console.log(`SmartInsuranceApp: Proceeding to next step for pipeline ${pipelineId}`);
    
    try {
        // Get current pipeline status
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            this.showError('Pipeline not found');
            return;
        }
        
        // Start polling (always start - should be idempotent)
        this.pipelinePoller.startPipelinePolling(pipelineId);
        
        // Determine next step based on current status
        let apiCall, loadingMessage, successMessage;
        
        switch (pipeline.status) {
            case 'pending':
                apiCall = () => this.api.runResearch(pipelineId);
                loadingMessage = 'Starting research...';
                successMessage = 'Research started successfully';
                break;
                
            case 'research_complete':
                apiCall = () => this.api.runLegalResolution(pipelineId);
                loadingMessage = 'Starting legal resolution...';
                successMessage = 'Legal resolution started successfully';
                break;
                
            case 'legal_resolution_complete':
                apiCall = () => this.api.runDataExtraction(pipelineId);
                loadingMessage = 'Starting data extraction...';
                successMessage = 'Data extraction started successfully';
                break;
                
            case 'data_extraction_complete':
                this.showWarning('Pipeline is already complete');
                return;
                
            default:
                if (pipeline.status.includes('_failed')) {
                    this.showError('Cannot proceed - pipeline has failed. Please reset or delete.');
                } else if (pipeline.status.includes('_running')) {
                    this.showWarning('Pipeline is already running');
                } else {
                    this.showError(`Unknown pipeline status: ${pipeline.status}`);
                }
                return;
        }
        
        // Execute the appropriate API call
        Utils.showLoading(loadingMessage);
        const result = await apiCall();
        Utils.hideLoading();
        
        if (result.success) {
            this.showSuccess(successMessage);
        } else {
            this.showError(`Failed to proceed: ${result.error}`);
        }
        
    } catch (error) {
        Utils.hideLoading();
        console.error(`SmartInsuranceApp: Error proceeding with pipeline ${pipelineId}:`, error);
        this.showError('Failed to proceed: ' + error.message);
    }
}
```

#### Update ActionButtons Component
**File**: `/public/js/components/pipeline/ActionButtons.js`  
**Lines**: 176-190

**Replace this**:
```javascript
        switch (action) {
            case 'start-research':
                if (window.app && window.app.handleStartResearch) {
                    await window.app.handleStartResearch(pipelineId);
                }
                break;
            case 'proceed-legal':
                if (window.app && window.app.handleProceedToStep) {
                    await window.app.handleProceedToStep(pipelineId, 'legal-resolution');
                }
                break;
            case 'proceed-data':
                if (window.app && window.app.handleProceedToStep) {
                    await window.app.handleProceedToStep(pipelineId, 'data-extraction');
                }
                break;
```

**With this**:
```javascript
        switch (action) {
            case 'start-research':
            case 'proceed-legal':
            case 'proceed-data':
                if (window.app && window.app.proceedToNextStep) {
                    await window.app.proceedToNextStep(pipelineId);
                }
                break;
```

#### Method Call Replacements (Phase 1 Only)

**Phase 1 includes only these specific call site updates:**

##### File: `/public/js/pipeline-cards.js`
**Line 117**: Start research call
```javascript
// OLD:
window.app?.handleStartResearch?.(pipelineId);

// NEW:
window.app?.proceedToNextStep?.(pipelineId);
```

**Line 125**: Proceed with step call
```javascript
// OLD:
window.app?.handleProceedToStep?.(pipelineId, step);

// NEW:
window.app?.proceedToNextStep?.(pipelineId);
```

**NOTE**: `/public/js/components/pipeline/ActionButtons.js` changes are already covered in the ActionButtons Component update above.

#### Remove Old Methods (Phase 1)
**File**: `/public/js/app.js`  
**Methods to remove in Phase 1**:
- `handleStartResearch()` (around line 398) - **Delete completely**  
- `handleProceedToStep()` (around line 462) - **Delete completely**

**Method to leave unchanged in Phase 1**:
- `handleStartPipeline()` (around line 129) - **Leave as-is until Phase 2**

#### Parameter Compatibility Analysis

**✅ Safe Replacements:**
- `handleStartResearch(pipelineId)` → `proceedToNextStep(pipelineId)` - ✓ Compatible
- Event listener calls (no parameters) - ✓ Compatible with new method names

**⚠️ Parameter Changes Required:**
- `handleProceedToStep(pipelineId, step)` → `proceedToNextStep(pipelineId)` 
  - **Impact**: The `step` parameter (`'legal-resolution'`, `'data-extraction'`) is removed
  - **Mitigation**: New method determines step automatically from pipeline status
  - **Risk**: None - behavior is equivalent but more intelligent

**🔍 Validation Required:**
- **MISSING METHOD**: `this.pipelinePoller.isPipelineBeingPolled(pipelineId)` does not exist in PipelinePoller
  - **Solution**: Either add this method or remove the polling check (always start polling)
  - **Recommendation**: Remove check and always call `startPipelinePolling()` (it should be idempotent)
- Verify pipeline status values match the expected cases in the switch statement  
- Test that auto-complete logic works correctly with the simplified calls

**🔧 Required PipelinePoller Method Addition:**
```javascript
// Add to PipelinePoller.js
isPipelineBeingPolled(pipelineId) {
    return this.activePollers.has(pipelineId);
}
```
**OR** update `proceedToNextStep()` to always start polling:
```javascript
// Always start polling (simpler approach)
this.pipelinePoller.startPipelinePolling(pipelineId);
```

### Benefits
- **Single workflow entry point**: All workflow starting goes through one method
- **Status-driven logic**: Automatically determines correct next step
- **Automatic polling**: Starts polling when workflows begin
- **Cleaner ActionButtons**: All workflow actions use same handler
- **Error handling**: Consistent error handling for all workflow steps
- **Reduced complexity**: Eliminates method duplication and confusion
- **Parameter safety**: Removes step parameter mismatches and errors

---

## Sequential Auto-Complete Implementation

The following code changes implement the sequential processing where auto-complete runs pipelines one at a time instead of simultaneously.

### Change 1: Remove autoCompletePipelines Set Management
**File**: `/public/js/app.js`  
**Lines**: 177-189  

**Replace this**:
```javascript
                // Render pipeline cards and start polling/auto-complete
                result.results.forEach(item => {
                    if (item.success && item.pipeline) {
                        this.cards.createPipelineCard(item.pipeline);
                        this.pipelinePoller.startPipelinePolling(item.pipeline.pipeline_id);
                        
                        // Auto-complete: mark pipeline and start first workflow
                        if (autoComplete) {
                            this.autoCompletePipelines.add(item.pipeline.pipeline_id);
                            console.log(`Auto-complete: Starting research for pipeline ${item.pipeline.pipeline_id}`);
                            this.api.runResearch(item.pipeline.pipeline_id);
                        }
                    }
                });
```

**With this**:
```javascript
                // Render pipeline cards and start polling
                result.results.forEach(item => {
                    if (item.success && item.pipeline) {
                        this.cards.createPipelineCard(item.pipeline);
                        this.pipelinePoller.startPipelinePolling(item.pipeline.pipeline_id);
                    }
                });
                
                // Start first incomplete pipeline if auto-complete is enabled
                if (autoComplete) {
                    console.log('Auto-complete enabled: starting first incomplete pipeline');
                    this.startNextPendingPipeline();
                }
```

### Change 2: Replace Set-Based Auto-Complete Logic
**File**: `/public/js/app.js`  
**Lines**: 669-682

**Replace this**:
```javascript
        // Auto-complete logic for successful statuses
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
```

**With this**:
```javascript
        // Auto-complete logic for successful statuses
        if (this.isAutoCompleteEnabled()) {
            if (status === 'research_complete') {
                console.log('Auto-complete: Starting legal resolution');
                this.api.runLegalResolution(pipelineId);
            }
            else if (status === 'legal_resolution_complete') {
                console.log('Auto-complete: Starting data extraction');
                this.api.runDataExtraction(pipelineId);
            }
            else if (status === 'data_extraction_complete') {
                console.log('Auto-complete: Pipeline completed, starting next');
                this.startNextPendingPipeline();
            }
        }
```

### Change 3: Add New Helper Methods
**File**: `/public/js/app.js`  
**After line**: 683 (after `handlePipelineStatusChange` method)

**Add these methods**:
```javascript
    /**
     * Check if auto-complete is currently enabled
     */
    isAutoCompleteEnabled() {
        return Utils.findElement('#auto-complete-checkbox')?.checked || false;
    }

    /**
     * Start next incomplete pipeline for auto-complete sequential processing
     */
    startNextPendingPipeline() {
        // Find first pipeline that isn't fully completed
        for (const [pipelineId, pipeline] of this.activePipelines.entries()) {
            if (pipeline.status !== 'data_extraction_complete') {
                console.log(`Starting next incomplete pipeline: ${pipeline.firm_name} (status: ${pipeline.status})`);
                
                // Start the appropriate next step based on current status
                if (pipeline.status === 'pending') {
                    this.api.runResearch(pipelineId);
                } else if (pipeline.status === 'research_complete') {
                    this.api.runLegalResolution(pipelineId);
                } else if (pipeline.status === 'legal_resolution_complete') {
                    this.api.runDataExtraction(pipelineId);
                }
                // Skip failed statuses - let user handle those manually
                
                return; // Only start one
            }
        }
        console.log('All pipelines completed');
    }
```

---

## Implementation Phases

This refactor should be implemented in three phases to minimize complexity and ensure stability:

### **Phase 1: Consolidate Workflow Sequencing Methods**

**Goal**: Replace two workflow methods with one unified method (keeping pipeline creation separate).

**Changes**:
1. **Add** `proceedToNextStep(pipelineId)` method to `/public/js/app.js` (auto-complete independent version)
2. **Update** ActionButtons component to use single method for all workflow actions  
3. **Update** specific method call sites:
   - `/public/js/pipeline-cards.js`: Action handlers (lines 117, 125) 
   - `/public/js/components/pipeline/ActionButtons.js`: Button clicks (covered in ActionButtons update)
4. **Remove** old workflow methods:
   - `handleStartResearch()` - Delete completely
   - `handleProceedToStep()` - Delete completely
5. **Leave unchanged** until later phases:
   - `handleStartPipeline()` - Keep as-is (Phase 2 change)
   - Auto-complete logic in `handlePipelineStatusChange()` - Keep as-is (Phase 3 change)
   - Event listeners and button IDs - Keep as-is (Phase 2 change)

**Dependencies**: None (completely independent)

**Testing**: 
- Verify individual "Start Research", "Proceed to Legal", "Proceed to Data" buttons work identically
- Verify auto-complete still works exactly as before (using old logic)
- Verify "Start" button still creates and auto-starts pipelines as before

### **Phase 2: Decouple Pipeline Creation from Workflow Starting**

**Goal**: Separate pipeline creation from automatic workflow starting.

**Changes**:
1. **Rename** "Start" button to "Create Pipelines" in `/public/index.html`
2. **Replace** `handleStartPipeline()` with `handleCreatePipelines()` method
3. **Remove** polling and auto-start logic from pipeline creation
4. **Update** event listeners to bind to new button and method:
   ```javascript
   // OLD:
   startBtn.addEventListener('click', () => this.handleStartPipeline());
   
   // NEW: 
   createPipelinesBtn.addEventListener('click', () => this.handleCreatePipelines());
   ```

**Dependencies**: Requires Phase 1's `proceedToNextStep()` method for individual pipeline starting

**Testing**: 
- Verify "Create Pipelines" only creates cards (no workflows start)
- Verify individual "Start Research" buttons work via `proceedToNextStep()`

### **Phase 3: Implement Sequential Auto-Complete**

**Goal**: Make auto-complete process pipelines one-at-a-time instead of simultaneously.

**Changes**:
1. **Remove** `autoCompletePipelines` Set management from pipeline creation
2. **Add** `isAutoCompleteEnabled()` helper method
3. **Add** `startNextPendingPipeline()` method for sequential processing
4. **Update** `handlePipelineStatusChange()` to use checkbox state instead of Set
5. **Update** auto-complete logic calls (lines 672, 676):
   ```javascript
   // OLD:
   this.handleProceedToStep(pipelineId, 'legal-resolution');
   this.handleProceedToStep(pipelineId, 'data-extraction');
   
   // NEW:
   this.proceedToNextStep(pipelineId);
   this.proceedToNextStep(pipelineId);
   ```
6. **Update** `startNextPendingPipeline()` to call `proceedToNextStep()` for next pipeline

**Dependencies**: Requires Phase 1's `proceedToNextStep()` method and Phase 2's decoupled creation

**Testing**:
- Create multiple pipelines with auto-complete checked
- Start one pipeline manually
- Verify sequential processing (next pipeline starts only after current completes)

### **Phase Implementation Benefits**

1. **Incremental Testing**: Each phase can be tested independently
2. **Risk Management**: Complex auto-complete changes come last after foundation is solid
3. **Rollback Safety**: Any phase can be reverted without affecting others
4. **Clear Dependencies**: Each phase builds on previous phases cleanly

### **Rollback Strategy**

If issues arise:
- **Phase 1 Rollback**: Restore original three methods and call sites
- **Phase 2 Rollback**: Restore original button name and auto-start logic  
- **Phase 3 Rollback**: Restore `autoCompletePipelines` Set and original auto-complete logic

Each phase can be rolled back independently without affecting other phases.