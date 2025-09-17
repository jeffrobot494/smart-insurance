# Cancel Status Refactor Plan

## Overview
Replace the current approach where cancellation sets pipelines to `*_failed` status with new dedicated `*_cancelled` statuses. This eliminates the root cause of duplicate error notifications by clearly distinguishing user cancellations from actual workflow failures.

## New Status Set
**Current Statuses:**
- `pending`, `research_running`, `research_complete`, `research_failed`
- `legal_resolution_running`, `legal_resolution_complete`, `legal_resolution_failed`
- `data_extraction_running`, `data_extraction_complete`, `data_extraction_failed`

**Add New Statuses:**
- `research_cancelled`
- `legal_resolution_cancelled`
- `data_extraction_cancelled`

## Files Requiring Changes

### 1. Server-Side Constants & Status Management

**File: `/server/Manager.js`**
- Add new constants:
```javascript
const PIPELINE_STATUSES = {
  // ... existing statuses ...
  RESEARCH_CANCELLED: 'research_cancelled',
  LEGAL_RESOLUTION_CANCELLED: 'legal_resolution_cancelled',
  DATA_EXTRACTION_CANCELLED: 'data_extraction_cancelled'
};
```

**File: `/server/utils/PipelineStateManager.js`**
- Update `cancelPipeline()` method to use `*_cancelled` instead of `*_failed`:
```javascript
// Change failedStatus mapping:
case 'research_running': failedStatus = 'research_cancelled';
case 'legal_resolution_running': failedStatus = 'legal_resolution_cancelled';
case 'data_extraction_running': failedStatus = 'data_extraction_cancelled';
```

- Update `getValidTransitions()` to include cancelled states:
```javascript
'research_running': ['research_complete', 'research_failed', 'research_cancelled'],
'legal_resolution_running': ['legal_resolution_complete', 'legal_resolution_failed', 'legal_resolution_cancelled'],
'data_extraction_running': ['data_extraction_complete', 'data_extraction_failed', 'data_extraction_cancelled'],
// Reset transitions:
'research_cancelled': ['pending'],
'legal_resolution_cancelled': ['research_complete'],
'data_extraction_cancelled': ['legal_resolution_complete']
```

- Update operation requirements to include cancelled states:
```javascript
'reset': ['research_failed', 'legal_resolution_failed', 'data_extraction_failed', 'research_cancelled', 'legal_resolution_cancelled', 'data_extraction_cancelled'],
'delete': [...existing..., 'research_cancelled', 'legal_resolution_cancelled', 'data_extraction_cancelled']
```

- Update resetable statuses validation:
```javascript
const resetableStatuses = ['research_failed', 'legal_resolution_failed', 'data_extraction_failed', 'research_cancelled', 'legal_resolution_cancelled', 'data_extraction_cancelled'];
```

### 2. Client-Side Status Handling

**File: `/public/js/components/pipeline/ActionButtons.js`**
- Add cancelled state button configurations:
```javascript
case 'research_cancelled':
case 'legal_resolution_cancelled':
    buttons.push(`<button class="btn btn-primary" data-action="reset">Reset</button>`);
    buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
    break;

case 'data_extraction_cancelled':
    buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
    break;
```

- Remove confirmation dialog from cancel button:
```javascript
case 'cancel':
    if (window.app && window.app.handleCancelPipeline) {
        await window.app.handleCancelPipeline(pipelineId);
    }
    break;
```

**File: `/public/js/services/PipelinePoller.js`**
- Add cancelled statuses to `stopPollingStatuses`:
```javascript
this.stopPollingStatuses = [
    // ... existing statuses ...
    'research_cancelled',
    'legal_resolution_cancelled',
    'data_extraction_cancelled'
];
```

**File: `/public/js/app.js`**
- Update `getFailedStatusFromRunning()` method:
```javascript
getFailedStatusFromRunning(runningStatus) {
    switch (runningStatus) {
        case 'research_running': return 'research_cancelled';
        case 'legal_resolution_running': return 'legal_resolution_cancelled';
        case 'data_extraction_running': return 'data_extraction_cancelled';
        default: return 'research_cancelled';
    }
}
```

- Update `handlePipelineStatusChange()` to handle cancelled states differently:
```javascript
// Don't treat cancelled states as errors - skip error notification
if (status.endsWith('_cancelled')) {
    // Silent update - user already got notification from cancel action
    return;
}

// Only show error notifications for actual _failed statuses
if (status.endsWith('_failed')) {
    this.handlePipelineError(pipelineId, status, pipeline);
    return;
}
```

### 3. Database Schema (Optional Enhancement)
No required changes, but could add for better analytics:
```sql
-- Optional: Add cancellation tracking
ALTER TABLE pipelines
ADD COLUMN cancelled_at TIMESTAMP NULL,
ADD COLUMN cancelled_by VARCHAR(255) NULL;
```

### 4. Documentation & Testing Updates

**Files to update:**
- `/docs/Cancel_Button_Implementation.md` - Update all references from `*_failed` to `*_cancelled`
- `/test-statemanager.js` - Update test expectations
- `/create-test-pipelines.sh` - Add cancelled status test pipelines
- `/public/test/client-error-handling-tests.js` - Update test cases
- `/server/test/error-handling-tests.js` - Update test expectations

### 5. UI Status Display Updates

**Files needing status display updates:**
- `/public/js/components/pipeline/PipelineHeader.js` - Status badge display
- `/public/js/components/NotificationManager.js` - Add cancelled-specific message formatting
- `/public/js/utils.js` - Status formatting utilities if any

## Implementation Order

### Phase 1: Server-Side Core (30 minutes)
1. Add new status constants to `Manager.js`
2. Update `PipelineStateManager.js` cancelPipeline method
3. Update state transitions and operation requirements
4. Test cancellation creates `*_cancelled` status

### Phase 2: Client-Side Updates (20 minutes)
1. Update `ActionButtons.js` for cancelled state buttons
2. Update `PipelinePoller.js` stop conditions
3. Update `app.js` status change handling and failed status mapping
4. Test UI shows correct buttons for cancelled pipelines

### Phase 3: Testing & Verification (15 minutes)
1. Update test files and documentation
2. Verify no duplicate error notifications
3. Verify cancelled pipelines can be reset properly
4. Test reset workflow from cancelled states

## Benefits

### 1. Eliminates Duplicate Notifications
- Cancelled pipelines no longer trigger error notifications
- Clear distinction between user actions and system failures
- `handlePipelineError()` only called for actual failures

### 2. Better Status Semantics
- `*_failed` = actual workflow/API errors requiring investigation
- `*_cancelled` = user-initiated termination, can be resumed
- Clear audit trail of user vs system actions

### 3. Improved User Experience
- No confusing "Research Failed" notifications after user cancellation
- Clear status indicators in UI
- Appropriate button configurations for each state

### 4. Maintains Backward Compatibility
- Reset functionality works identically for both failed and cancelled states
- Delete functionality unchanged
- No breaking changes to existing workflows

## Risk Assessment

### Low Risk Changes:
- Server status constants and mapping
- Client status handling logic
- Test file updates

### Medium Risk Changes:
- State transition updates (need careful testing)
- Pipeline poller logic (verify no polling edge cases)

### Zero Risk:
- Database schema (no required changes)
- API endpoints (no changes needed)

## Testing Strategy

```javascript
// Verify cancellation flow:
1. Start research → Cancel → Verify status = 'research_cancelled'
2. Start legal → Cancel → Verify status = 'legal_resolution_cancelled'
3. Start data → Cancel → Verify status = 'data_extraction_cancelled'

// Verify no error notifications:
1. Cancel pipeline → Verify only success notification
2. Verify no "Research Failed" error appears
3. Verify reset button appears correctly

// Verify reset functionality:
1. Cancel research → Reset → Verify status = 'pending'
2. Cancel legal → Reset → Verify status = 'research_complete'
3. Cancel data → Reset → Verify status = 'legal_resolution_complete'
```

## State Machine Diagram

### Before Refactor:
```
research_running → [cancel] → research_failed → [reset] → pending
legal_resolution_running → [cancel] → legal_resolution_failed → [reset] → research_complete
data_extraction_running → [cancel] → data_extraction_failed → [reset] → legal_resolution_complete
```

### After Refactor:
```
research_running → [cancel] → research_cancelled → [reset] → pending
legal_resolution_running → [cancel] → legal_resolution_cancelled → [reset] → research_complete
data_extraction_running → [cancel] → data_extraction_cancelled → [reset] → legal_resolution_complete
```

## Potential Issues and Fixes

### 1. Reset Validation Update
**Issue**: PipelineStateManager reset validation only checks for `*_failed` statuses
**Location**: `/server/utils/PipelineStateManager.js` in `resetPipeline()` method
**Fix**: Update the resetable statuses array:
```javascript
// Change this line:
const resetableStatuses = ['research_failed', 'legal_resolution_failed', 'data_extraction_failed'];

// To this:
const resetableStatuses = ['research_failed', 'legal_resolution_failed', 'data_extraction_failed', 'research_cancelled', 'legal_resolution_cancelled', 'data_extraction_cancelled'];

// Also update error message:
error: `Cannot reset pipeline with status: ${pipeline.status}. Only failed or cancelled pipelines can be reset.`,
```

### 2. Status Display Handling
**Issue**: UI may not know how to display cancelled statuses
**Test First**: Check if cancelled statuses display correctly or show as "Unknown"
**Fix Only If Needed**: Add to Utils.js if status display breaks:
```javascript
// Only add if status badges show as "Unknown" for cancelled states
getStatusDisplay(status) {
    const statusMap = {
        // ... existing statuses ...
        'research_cancelled': { class: 'status-cancelled', text: 'Research Cancelled' },
        'legal_resolution_cancelled': { class: 'status-cancelled', text: 'Legal Resolution Cancelled' },
        'data_extraction_cancelled': { class: 'status-cancelled', text: 'Data Extraction Cancelled' }
    };
    return statusMap[status] || { class: 'status-unknown', text: 'Unknown' };
}
```

### 3. CSS Status Styling
**Issue**: Cancelled statuses may not have appropriate styling
**Test First**: Check if cancelled status badges look reasonable
**Fix Only If Needed**: Add CSS if styling breaks:
```css
.status-cancelled {
    background-color: #ffc107;
    color: #212529;
    border: 1px solid #ffc107;
}
```

### 4. Hardcoded Status References
**Issue**: Other files may have hardcoded `*_failed` status strings
**Search Strategy**: Check only files being modified:
```bash
# Search files we're changing for status references:
grep -n "_failed\|_cancelled" server/Manager.js server/utils/PipelineStateManager.js public/js/components/pipeline/ActionButtons.js public/js/app.js public/js/services/PipelinePoller.js
```

### 5. Test File Updates
**Issue**: Test files expect `*_failed` statuses after cancellation
**Files to Update**:
- `/test-statemanager.js` - Update expected status after cancel
- `/public/test/client-error-handling-tests.js` - Update test expectations
- `/server/test/error-handling-tests.js` - Update cancellation test cases

## Pre-Implementation Checklist

### Required Changes (Must Do):
- [ ] Add 3 new status constants to `Manager.js`
- [ ] Update `PipelineStateManager.js` cancel method to use `*_cancelled`
- [ ] Update `PipelineStateManager.js` reset validation to include cancelled statuses
- [ ] Add cancelled status button configs to `ActionButtons.js`
- [ ] Remove cancel button confirmation dialog
- [ ] Add cancelled statuses to `PipelinePoller.js` stop conditions
- [ ] Update `app.js` failed status mapping method
- [ ] Update `app.js` status change handler for silent cancelled updates

### Test-First Changes (Do If Broken):
- [ ] Test status display - add Utils method only if needed
- [ ] Test status styling - add CSS only if needed
- [ ] Search for hardcoded statuses - update only what breaks

### Post-Implementation:
- [ ] Update test files to expect `*_cancelled` statuses
- [ ] Update documentation references

## Summary

This refactor provides a clean, semantic solution that eliminates the root cause of the duplicate notifications while maintaining all existing functionality. The new `*_cancelled` statuses clearly distinguish user-initiated terminations from actual workflow failures, resulting in a better user experience and cleaner system architecture.

**Key Benefits:**
- No duplicate error notifications after user cancellation
- Clear semantic distinction between failures and cancellations
- Maintains all existing reset/delete functionality
- Minimal code changes focused only on essential modifications