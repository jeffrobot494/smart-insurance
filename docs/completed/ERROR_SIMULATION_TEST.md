# Error Simulation Testing Guide

## 🧪 Simple Credit Balance Error Testing

This guide shows how to test the complete client/server error handling system using a simple error simulation.

## Setup

### Enable Error Simulation
Set the environment variable to trigger the error:
```bash
export ERROR_SIMULATION=true
```

### Disable Error Simulation (Normal Operation)
```bash
export ERROR_SIMULATION=false
# or
unset ERROR_SIMULATION
```

## Test Procedure

### 1. Start the Server with Error Simulation
```bash
export ERROR_SIMULATION=true
npm start
# or however you normally start your server
```

### 2. Start Research on Any Pipeline
- Open the Smart Insurance web interface
- Create a new pipeline with any firm name
- Click "Start Research"

### 3. Expected Behavior

#### Server Side:
- TaskExecution.js throws WorkflowAPIError immediately
- Error gets recorded in database with JSONB data:
  ```json
  {
    "api": "Claude API",
    "type": "balance_low", 
    "message": "credit balance low",
    "time": "2024-01-01T12:00:00.000Z",
    "state": "research_running"
  }
  ```
- Pipeline status changes to `research_failed`
- Cancellation flag is set

#### Client Side:
- Polling detects `research_failed` status
- Error details fetched from `/api/pipeline/:id/error` 
- Persistent notification shows:
  - **Title**: "Research Failed"
  - **Content**: 
    ```
    Pipeline: [Firm Name]
    API: Claude API
    Error: credit balance low
    Time: [timestamp]
    
    Suggestion: Please check your API credits and add more if needed.
    ```
- Reset button appears (no retry button)
- Pipeline card shows failed state

### 4. Test Reset Functionality
- Click the "Reset" button on the failed pipeline
- Pipeline should reset to `pending` status
- Error should be cleared from database
- Cancellation flag should be cleared
- Ready to start research again

## Verification Checklist

✅ **Server Error Handling:**
- [ ] Error thrown by TaskExecution.js
- [ ] WorkflowAPIError created with correct properties
- [ ] Error recorded in database JSONB column
- [ ] Pipeline status set to `research_failed`
- [ ] Cancellation flag set

✅ **Client Error Detection:**
- [ ] Polling detects failed status
- [ ] Error details fetched from API
- [ ] Notification displayed with correct content
- [ ] Reset button appears (not retry)
- [ ] Pipeline UI shows failed state

✅ **Reset Functionality:**
- [ ] Reset API call succeeds
- [ ] Pipeline status returns to `pending`
- [ ] Error data cleared from database
- [ ] Cancellation flag cleared
- [ ] UI updated to pending state

## Disable Testing

When finished testing, disable error simulation:
```bash
unset ERROR_SIMULATION
# Restart server for normal operation
```

## Error Details

- **Simulated Error**: "credit balance low"
- **Error Type**: "balance_low"
- **API**: "Claude API" 
- **Status Code**: 402
- **Trigger**: Any research start when `ERROR_SIMULATION=true`

This simple test verifies the complete error handling flow from server detection through client notification and reset recovery.