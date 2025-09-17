# PipelineStateManager Test Script

Quick testing suite for validating StateManager edge cases without running full workflows.

## Setup

```bash
# Install dependencies (if not already installed)
npm install

# Start the server
npm start
```

### Authentication

The test script automatically loads the authentication password from `./server/.env` file. No manual setup required!

**Fallback:** If `server/.env` is not found, it will use the `AUTH_PASSWORD` environment variable.

## Running Tests

```bash
# Run the complete test suite
npm test

# Or run directly
node test-statemanager.js
```

## Test Categories

### 🌐 Global Operation Blocking
- Verifies only one workflow can run at a time
- Confirms non-workflow operations (create, delete) still work during workflows
- Tests SYSTEM_BUSY error responses

### 🔄 State Validation
- Tests invalid state transitions (e.g., legal resolution on pending pipeline)
- Validates proper INVALID_STATE error responses
- Confirms state machine enforcement

### 🖱️ Button Spam Protection
- Simulates rapid duplicate requests (double-clicking)
- Verifies OPERATION_IN_PROGRESS blocking per pipeline
- Tests concurrent operation prevention

### 🔍 Pipeline Not Found
- Tests operations on non-existent pipelines
- Validates PIPELINE_NOT_FOUND error responses
- Covers all CRUD operations

### 🗑️ Delete Safety
- Prevents deletion of running pipelines
- Tests INVALID_STATE responses for unsafe deletes
- Validates operation state checking

### 🔄 Reset Restrictions
- Only allows reset on failed pipelines (*_failed states)
- Blocks reset on pending/complete/running pipelines
- Tests valid reset transitions

### ⏹️ Cancel Operation
- Tests cancel endpoint (currently returns NOT_IMPLEMENTED)
- Placeholder for future cancellation functionality

### ⏱️ Response Timing
- Validates responses are immediate (< 1000ms)
- Confirms validation doesn't wait for workflow completion
- Tests performance of state checking

## Test Output

```
🧪 PipelineStateManager Test Suite
==================================================

🌐 Testing Global Operation Blocking
✅ Start research on pipeline 1
✅ Global blocking prevents second workflow
✅ Create pipeline during workflow execution
✅ Delete non-running pipeline during workflow

🔄 Testing State Validation
✅ Block legal resolution on pending pipeline
✅ Block data extraction on pending pipeline
✅ Block reset on pending pipeline

🖱️ Testing Button Spam Protection
✅ First research request succeeds
✅ Button spam protection blocks duplicate request

🔍 Testing Pipeline Not Found
✅ Research on non-existent pipeline
✅ Legal resolution on non-existent pipeline
✅ Data extraction on non-existent pipeline
✅ Reset on non-existent pipeline
✅ Delete non-existent pipeline

🗑️ Testing Delete Safety
✅ Start research for delete safety test
✅ Block delete of running pipeline

🔄 Testing Reset Restrictions
✅ Block reset on pending pipeline
✅ Block reset on research_complete pipeline
✅ Block reset on legal_resolution_complete pipeline
✅ Block reset on data_extraction_complete pipeline
✅ Allow reset on failed pipeline

⏹️ Testing Cancel Operation
✅ Cancel operation returns not implemented

⏱️ Testing Response Timing
✅ Validation responses are immediate

🧹 Cleaning up test pipelines...

==================================================
📊 Test Results: 23/23 passed
⏱️ Execution time: 2847ms

✅ All tests passed!
```

## Error Codes Tested

- `SYSTEM_BUSY` - Another workflow already running
- `INVALID_STATE` - Invalid state transition
- `OPERATION_IN_PROGRESS` - Duplicate operation on same pipeline
- `PIPELINE_NOT_FOUND` - Pipeline doesn't exist
- `NOT_IMPLEMENTED` - Feature not yet implemented

## Features Validated

- ✅ Global workflow blocking (one at a time)
- ✅ Per-pipeline operation tracking
- ✅ State transition validation
- ✅ Button spam protection
- ✅ Error response consistency
- ✅ Response timing (immediate validation)
- ✅ Automatic cleanup of test data

## Notes

- Tests run against live server endpoints
- Creates temporary test pipelines (automatically cleaned up)
- Uses direct database updates to simulate failed states
- Designed for quick validation (< 5 seconds total)
- All tests are independent and isolated

The test script validates all StateManager validation logic without requiring long-running workflow execution, making it perfect for rapid development iteration and CI/CD integration.