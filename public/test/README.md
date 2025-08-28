# Client-Side Error Handling Test Suite

This directory contains comprehensive tests for the enhanced client-side error handling system.

## Test Files

### `client-error-handling-tests.js`
Core test suite that verifies:
- ✅ **NotificationManager** functionality
- ✅ **ActionButtons** updates (Reset vs Retry)
- ✅ **API Integration** (resetPipeline, getPipelineError)
- ✅ **Error Flow Simulation** (complete user journey)
- ✅ **CSS Integration** (styling and layout)

### `run-client-tests.html`
Interactive browser-based test runner with:
- Real-time test output display
- Individual component testing buttons
- Visual notification testing
- Console output capture

### `run-client-tests.js`
Command-line test runner for headless testing:
- Uses jsdom for DOM simulation
- Automated test execution
- CI/CD integration ready

## Running Tests

### Option 1: Browser Testing (Recommended)
1. Open `run-client-tests.html` in your browser
2. Click "Run All Tests" for comprehensive testing
3. Use individual test buttons for specific components
4. View real-time results in the console output

### Option 2: Command Line Testing
```bash
# From project root
node public/test/run-client-tests.js

# Or if jsdom is not installed:
# npm install jsdom
# node public/test/run-client-tests.js
```

### Option 3: Direct Script Testing
```javascript
// In browser console or as script tag
runClientErrorTests().then(success => {
    console.log('Tests completed:', success ? 'PASSED' : 'FAILED');
});
```

## Test Coverage

### NotificationManager Tests
- ✅ Component creation and initialization
- ✅ Basic notification display
- ✅ Pipeline error notifications with detailed info
- ✅ Notification types (success, error, warning, info)
- ✅ Close button functionality
- ✅ Auto-hide behavior
- ✅ CSS container creation

### ActionButtons Tests
- ✅ Button configuration for different pipeline states
- ✅ Reset button for `research_failed` and `legal_resolution_failed`
- ✅ Delete-only for `data_extraction_failed` (no reset)
- ✅ Start Research button for `pending` pipelines
- ✅ Proper button text and actions
- ✅ Elimination of "Retry" functionality

### API Integration Tests
- ✅ `resetPipeline()` method exists and calls correct endpoint
- ✅ `getPipelineError()` method exists and calls correct endpoint
- ✅ Method signatures and parameter validation
- ✅ Endpoint URL construction

### Error Flow Tests
- ✅ Complete error handling flow simulation
- ✅ Status change detection (`*_failed` statuses)
- ✅ Error detail fetching from server
- ✅ Notification display with rich error info
- ✅ UI updates and pipeline data management
- ✅ Graceful error handling and fallbacks

### CSS Integration Tests
- ✅ Notification container positioning
- ✅ Notification styling and animations
- ✅ Z-index layering for modals
- ✅ Responsive design elements

## Expected Test Results

**Successful Run Should Show:**
```
✅ Passed: ~26 tests
❌ Failed: 0 tests  
📊 Success Rate: 100%
🎉 All client-side error handling tests passed!
```

## Test Environment Requirements

### Browser Testing
- Modern browser with JavaScript enabled
- CSS support for positioning and animations
- DOM manipulation capabilities

### Command Line Testing
- Node.js environment
- jsdom package (npm install jsdom)
- File system access to load components

## Troubleshooting

### Missing Components Error
If you see "Missing required classes" error:
1. Ensure all script files are loaded in correct order
2. Check file paths in HTML includes
3. Verify component scripts are properly exported to window object

### CSS Styling Issues
If notifications don't display correctly:
1. Check that app.css is properly loaded
2. Verify notification container is created
3. Test CSS positioning with browser developer tools

### API Integration Issues
If API methods are not found:
1. Ensure PipelineAPI class is loaded
2. Check that resetPipeline and getPipelineError methods exist
3. Verify method signatures match expected parameters

## Integration with Main Application

These tests verify the error handling system works correctly when integrated with:
- SmartInsuranceApp main orchestrator
- PipelinePoller status change notifications
- PipelineCardManager UI updates
- Real API endpoints for error recovery

The test suite provides confidence that the error handling system will work correctly in the production environment.