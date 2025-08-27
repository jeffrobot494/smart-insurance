# Smart Insurance Client - Simple Testing Plan

## Overview

This testing plan provides simple, practical tests for each implementation phase. Tests are designed to be run manually in the browser with minimal setup, focusing on ensuring functionality works as intended.

## Testing Strategy

### 1. Browser Console Testing
- Use `console.log()` for debugging
- Test functions directly in browser console
- Verify data flow with simple assertions

### 2. Visual Testing
- Compare against mockups pixel by pixel
- Test responsive behavior
- Verify all interactive elements work

### 3. API Integration Testing
- Test with real backend endpoints
- Verify error handling
- Check data persistence

### 4. Manual User Workflow Testing
- Complete end-to-end user scenarios
- Test edge cases and error conditions
- Verify all buttons and forms work

## Phase-by-Phase Test Plans

### Phase 1: Foundation Testing

#### Test 1.1: Basic App Initialization
```javascript
// In browser console after loading page:
console.log('App instance:', window.app);
console.log('API instance:', window.app.api);
console.log('Tab controller:', window.app.tabs);

// Expected: All objects should exist and be properly initialized
```

**Manual Checks:**
- [ ] Page loads without errors
- [ ] Console shows no error messages
- [ ] All JavaScript files load successfully

#### Test 1.2: API Class Basic Functionality
```javascript
// Test API endpoint construction
console.log('Base URL:', app.api.baseURL);

// Test basic fetch capability (should fail gracefully if server not running)
app.api.getAllPipelines().then(result => {
    console.log('API test result:', result);
}).catch(error => {
    console.log('Expected error (server not running):', error.message);
});
```

**Manual Checks:**
- [ ] API class instantiates correctly
- [ ] Network requests are attempted
- [ ] Error handling works when server unavailable

#### Test 1.3: Tab Switching
```javascript
// Test tab switching functionality
app.tabs.switchTab('work');
console.log('Current tab:', app.tabs.currentTab); // Should be 'work'

app.tabs.switchTab('saved');  
console.log('Current tab:', app.tabs.currentTab); // Should be 'saved'
```

**Visual Checks:**
- [ ] Work tab activates and shows content
- [ ] Saved tab activates and hides work content
- [ ] Tab buttons highlight correctly
- [ ] Content areas show/hide properly

### Phase 2: Work Tab Testing

#### Test 2.1: Firm Input Handling
```javascript
// Test firm name parsing
const testInput = "American Discovery Capital, NexPhase Capital, Revelstoke Capital";
const result = app.handleFirmInput(testInput);
console.log('Parsed firms:', result); 
// Expected: Array of 3 firm names
```

**Manual Checks:**
- [ ] Text input field accepts firm names
- [ ] Comma separation works correctly
- [ ] File upload area responds to clicks
- [ ] Auto-complete checkbox toggles

#### Test 2.2: Pipeline Card Creation
```javascript
// Test pipeline card rendering with mock data
const mockPipeline = {
    pipeline_id: 1,
    firm_name: "Test Firm",
    status: "research_complete",
    companies: [
        { name: "Test Company", legal_entity_name: "TEST COMPANY LLC", city: "Austin", state: "TX", exited: false }
    ],
    created_at: new Date().toISOString()
};

app.cards.createPipelineCard(mockPipeline);
console.log('Pipeline cards count:', document.querySelectorAll('.pipeline-card').length);
```

**Visual Checks:**
- [ ] Pipeline card renders correctly
- [ ] Status badge shows correct color/text
- [ ] Company list displays properly
- [ ] Stats row shows correct information

#### Test 2.3: Company Expansion
```javascript
// Test company details expansion
const companyHeaders = document.querySelectorAll('.company-header');
if (companyHeaders.length > 0) {
    companyHeaders[0].click();
    console.log('Company expanded:', companyHeaders[0].nextElementSibling.classList.contains('expanded'));
}
```

**Visual Checks:**
- [ ] Company items expand when clicked
- [ ] Expand icon rotates correctly
- [ ] Company details show all fields
- [ ] Edit fields are functional

### Phase 3: Interactivity Testing

#### Test 3.1: Company Editing
```javascript
// Test company edit functionality
const pipelineId = 1;
const companyIndex = 0;
const newData = { name: "Updated Company Name", exited: true };

app.companies.startEdit(pipelineId, companyIndex);
console.log('Edit mode activated');

// Simulate data entry and save
app.companies.saveEdit(pipelineId, companyIndex, newData);
console.log('Company data saved');
```

**Manual Checks:**
- [ ] Edit mode activates input fields
- [ ] Input fields contain current data
- [ ] Save button updates data
- [ ] Cancel button reverts changes
- [ ] Checkbox states persist

#### Test 3.2: Add Company Functionality
```javascript
// Test add company form
const pipelineId = 1;
app.companies.showAddForm(pipelineId);

const addForm = document.querySelector(`#add-form-${pipelineId}`);
console.log('Add form visible:', addForm && addForm.classList.contains('show'));

// Test adding company
const newCompanyData = { name: "New Test Company", exited: false };
app.companies.addCompany(pipelineId, newCompanyData);
```

**Manual Checks:**
- [ ] Add Company button shows form
- [ ] Form has all required fields
- [ ] Add Company saves and hides form
- [ ] Cancel button hides form without saving
- [ ] New company appears in list

#### Test 3.3: Pipeline Actions
```javascript
// Test pipeline action buttons
app.cards.handleProceedClick(1);
app.cards.handleEditClick(1);
app.cards.handleRetryClick(1);
console.log('Pipeline actions tested');
```

**Manual Checks:**
- [ ] Proceed button triggers next step
- [ ] Edit button enables editing mode
- [ ] Retry button restarts failed pipelines
- [ ] All buttons show appropriate feedback

### Phase 4: Saved Tab Testing

#### Test 4.1: Saved Pipeline Loading
```javascript
// Test saved tab loading
app.tabs.loadSavedTab(1, 10);
console.log('Loading saved pipelines...');

// Check if pipelines load
setTimeout(() => {
    const savedCards = document.querySelectorAll('#savedTab .pipeline-card');
    console.log('Saved pipeline cards loaded:', savedCards.length);
}, 1000);
```

**Manual Checks:**
- [ ] Saved tab loads pipeline history
- [ ] Pagination works correctly  
- [ ] Pipeline cards show completion dates
- [ ] Status badges reflect final states

#### Test 4.2: Pipeline Expansion in Saved Tab
```javascript
// Test saved pipeline expansion
const savedHeaders = document.querySelectorAll('#savedTab .pipeline-header');
if (savedHeaders.length > 0) {
    savedHeaders[0].click();
    console.log('Saved pipeline expanded');
}
```

**Visual Checks:**
- [ ] Saved pipelines expand to show company details
- [ ] Company data displays correctly
- [ ] Form 5500 data shows when available
- [ ] Expansion state persists during session

#### Test 4.3: Load More Functionality
```javascript
// Test pagination
const loadMoreBtn = document.querySelector('.load-more a');
if (loadMoreBtn) {
    loadMoreBtn.click();
    console.log('Load more clicked');
}
```

**Manual Checks:**
- [ ] Load more button appears when needed
- [ ] Clicking loads additional pipelines
- [ ] Button disappears when all loaded
- [ ] Loading state shows during fetch

### Phase 5: Polish Testing

#### Test 5.1: Report Configuration
```javascript
// Test report manager
app.reports.showReportConfig(1);
const reportConfig = document.getElementById('reportConfig');
console.log('Report config visible:', !reportConfig.classList.contains('hidden'));

// Test report generation
const config = {
    format: 'excel',
    includeCompanyInfo: true,
    includeInsurance: true,
    excludeExited: false
};
app.reports.generateReport(config);
```

**Manual Checks:**
- [ ] Report config modal shows correctly
- [ ] All format options work
- [ ] Include/exclude checkboxes function
- [ ] Generate button creates report
- [ ] Cancel button closes modal

#### Test 5.2: Error Handling
```javascript
// Test error scenarios
// 1. Invalid firm names
app.handleFirmInput("");
app.handleFirmInput("!@#$%");

// 2. Network failure simulation
app.api.baseURL = "http://invalid-url";
app.api.getAllPipelines().catch(error => {
    console.log('Network error handled:', error.message);
});

// 3. Invalid company data
app.companies.addCompany(1, { name: "" });
```

**Manual Checks:**
- [ ] Empty input shows appropriate message
- [ ] Invalid input is rejected gracefully
- [ ] Network failures show user-friendly errors
- [ ] Form validation prevents invalid submissions
- [ ] All errors are recoverable

#### Test 5.3: Loading States
```javascript
// Test loading indicators
app.startPipeline(["Test Firm"]);
console.log('Pipeline starting, check for loading indicators');
```

**Visual Checks:**
- [ ] Loading spinners appear during operations
- [ ] Buttons show loading states
- [ ] Cards show progress indicators
- [ ] Loading states clear when complete

## Complete End-to-End Testing

### Workflow Test 1: Complete Pipeline Creation
```
1. Enter firm name: "KKR & Co"
2. Check auto-complete workflow
3. Click Start button
4. Verify pipeline card appears
5. Wait for research completion
6. Expand company list
7. Edit a company name
8. Click Proceed to Legal Resolution
9. Wait for legal resolution
10. Edit legal entity names
11. Click Proceed to Data Extraction
12. Wait for completion
13. Click Generate Report
14. Configure report options
15. Generate and download report
```

**Success Criteria:**
- [ ] All steps complete without errors
- [ ] Data persists between steps
- [ ] Final report contains expected data

### Workflow Test 2: Saved Pipeline Management
```
1. Switch to Saved tab
2. Verify completed pipeline appears
3. Click pipeline to expand
4. Verify company details show
5. Click Edit button
6. Modify company data
7. Save changes
8. Generate new report
9. Delete a pipeline
10. Confirm deletion works
```

**Success Criteria:**
- [ ] All saved operations work correctly
- [ ] Data modifications persist
- [ ] Deletion removes pipeline completely

## Browser Compatibility Testing

### Quick Browser Test Checklist
**Chrome:**
- [ ] All functionality works
- [ ] Console shows no errors
- [ ] Performance is acceptable

**Firefox:**
- [ ] All functionality works  
- [ ] No browser-specific issues
- [ ] File upload works

**Safari:**
- [ ] Basic functionality works
- [ ] No major visual issues
- [ ] Mobile responsive

**Edge:**
- [ ] All functionality works
- [ ] No compatibility errors

## Performance Testing

### Simple Performance Checks
```javascript
// Test initial load time
console.time('Page Load');
// ... after page fully loads
console.timeEnd('Page Load'); // Should be < 2 seconds

// Test pipeline card rendering
console.time('Card Rendering');
app.cards.createPipelineCard(mockPipeline);
console.timeEnd('Card Rendering'); // Should be < 100ms

// Test tab switching speed  
console.time('Tab Switch');
app.tabs.switchTab('saved');
console.timeEnd('Tab Switch'); // Should be < 50ms
```

## Test Data Setup

### Mock Pipeline Data for Testing
```javascript
const testPipelines = [
    {
        pipeline_id: 1,
        firm_name: "Test Firm Alpha",
        status: "data_extraction_complete",
        companies: [
            { name: "Alpha Corp", legal_entity_name: "ALPHA CORP LLC", city: "Austin", state: "TX", exited: false }
        ]
    },
    {
        pipeline_id: 2, 
        firm_name: "Test Firm Beta",
        status: "research_running",
        companies: []
    },
    {
        pipeline_id: 3,
        firm_name: "Test Firm Gamma", 
        status: "failed",
        companies: []
    }
];

// Load test data
window.testData = testPipelines;
```

## Testing Checklist Summary

### Phase 1 Tests
- [ ] App initialization
- [ ] API class setup
- [ ] Tab switching

### Phase 2 Tests  
- [ ] Firm input parsing
- [ ] Pipeline card creation
- [ ] Company expansion

### Phase 3 Tests
- [ ] Company editing
- [ ] Add company functionality  
- [ ] Pipeline actions

### Phase 4 Tests
- [ ] Saved pipeline loading
- [ ] Pipeline expansion
- [ ] Load more functionality

### Phase 5 Tests
- [ ] Report configuration
- [ ] Error handling
- [ ] Loading states

### Integration Tests
- [ ] Complete workflow test
- [ ] Saved pipeline management
- [ ] Cross-browser compatibility
- [ ] Performance benchmarks

This testing approach ensures each phase works correctly before moving to the next, preventing compound issues and making debugging much easier.