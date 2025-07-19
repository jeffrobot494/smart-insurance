# Frontend Development Context

This document contains all the context needed for building the frontend client for the Smart Insurance PE Research system.

## System Overview

The Smart Insurance system discovers portfolio companies of private equity firms and extracts their Form 5500 insurance data. The workflow is:

1. **PE Research Workflow** - Input PE firm names → Discover portfolio companies → Save to database
2. **Form 5500 Data Extraction** - Query portfolio companies → Extract insurance data → Generate reports
3. **Frontend Display** - Show structured insurance data to users

## Current API Endpoints

### Existing Endpoints (Working)
```
POST /api/workflow
- Body: { "workflowname": "pe_firm_research", "input": ["American Discovery Capital"] }
- Response: { "success": true, "message": "Workflow execution started", "status": "started" }
- Behavior: Fire-and-forget, starts PE research workflow

GET /api/workflow/3/:workflowExecutionId
- Example: GET /api/workflow/3/123
- Response: { "success": true, "message": "Portfolio company data extraction started" }
- Behavior: Fire-and-forget, starts Form 5500 extraction for workflow execution ID
```

### New Polling Endpoints (Just Created - Console Log Only)
```
GET /api/polling/:workflowId
- Example: GET /api/polling/123
- Current: Just console logs and basic response
- Purpose: Check workflow status (pending, running, completed, failed)

GET /api/workflow/:workflowId/results
- Example: GET /api/workflow/123/results
- Current: Just console logs and basic response
- Purpose: Get final structured results when workflow is completed
```

## Database Schema

### workflow_executions Table
```sql
CREATE TABLE workflow_executions (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(255) NOT NULL,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'running',
    created_at TIMESTAMP DEFAULT NOW()
);
```

### portfolio_companies Table
```sql
CREATE TABLE portfolio_companies (
    id SERIAL PRIMARY KEY,
    workflow_execution_id INTEGER REFERENCES workflow_executions(id),
    firm_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workflow_execution_id, company_name)
);
```

## Current Data Flow

1. User triggers PE research: `POST /api/workflow` with firm names
2. System creates `workflow_executions` record, discovers portfolio companies
3. Portfolio companies saved to `portfolio_companies` table
4. User can trigger Form 5500 extraction: `GET /api/workflow/3/:workflowExecutionId`
5. System processes each portfolio company through database-backed Form 5500 and Schedule A searches
6. Results currently output to console with detailed tables

## Expected Form 5500 Data Structure

The system currently generates console output like:
```
📊 COMPREHENSIVE RESEARCH SUMMARY
Company Name | EIN | Form 5500 Years | SCH_A Records by Year
American Pain Consortium | 123456789 | 2022, 2023 | 2022:2, 2023:3
GreenSlate | 987654321 | 2023 | 2023:4
```

And detailed Schedule A tables with:
- Carrier Name (Aetna, Blue Cross, etc.)
- Persons Covered (number of employees)
- Broker Commission (dollar amounts)
- Benefit Type (healthcare, dental, etc.)
- Total Charges (insurance costs)

## Frontend Requirements

### User Interface Flow
1. **Input Form** - User enters PE firm names (American Discovery Capital, KKR, etc.)
2. **Submit & Poll** - Start PE research, poll for completion status
3. **Green Button** - When PE research complete, show "Extract Form 5500 Data" button
4. **Results Display** - Show structured insurance data in tables/charts

### Polling Architecture
- Fire-and-forget POST to start workflows
- Poll GET endpoints for status updates
- Button states: Gray (processing) → Green (ready) → Display results

### Expected API Response Format (To Be Implemented)
```json
{
  "success": true,
  "workflowId": 123,
  "firmName": "American Discovery Capital",
  "summary": {
    "totalCompanies": 7,
    "companiesWithForm5500": 5,
    "companiesWithScheduleA": 4,
    "totalInsuranceCharges": 8500000
  },
  "companies": [
    {
      "companyName": "American Pain Consortium",
      "ein": "123456789",
      "form5500": {
        "years": ["2022", "2023"],
        "recordCount": 5
      },
      "scheduleA": {
        "totalRecords": 8,
        "carriers": ["Aetna", "Blue Cross"],
        "totalCharges": 1250000,
        "personsCovered": 450,
        "recordsByYear": {
          "2022": 2,
          "2023": 3
        }
      }
    }
  ]
}
```

## Technical Stack

### Backend
- Node.js/Express server running on port 3000
- PostgreSQL database with Railway hosting
- Database-backed Form 5500 and Schedule A search (replaces CSV files)
- Workflow system with JSON-based task definitions

### Frontend (To Be Built)
- Technology: TBD (React, Vue, vanilla JS, etc.)
- Must handle polling and async operations
- Display tables/charts of insurance data
- Responsive design for insurance professionals

## Key Business Context

This system helps private equity firms analyze the insurance costs and coverage of their portfolio companies. The data comes from:
- **Form 5500**: Filed by companies with employee benefit plans
- **Schedule A**: Details about insurance carriers, costs, and coverage

Insurance professionals can use this to:
- Benchmark insurance costs across portfolio companies
- Identify opportunities for group purchasing
- Analyze carrier relationships and broker commissions
- Understand employee benefit trends

## Development Status

### What's Working
- PE firm research workflow (discovers portfolio companies)
- Database storage of portfolio companies
- Form 5500 data extraction with detailed console output
- Schedule A reporting with carrier details and costs
- Basic API endpoints for triggering workflows

### What Needs To Be Built
- Polling endpoint implementation (status checking)
- Results endpoint implementation (structured JSON responses)
- Complete frontend application
- Data visualization/table components
- Error handling and user feedback

## Environment

- Development server: `npm start` in `/server` directory
- Database: Railway PostgreSQL (connection via DATABASE_PUBLIC_URL)
- API Base URL: `http://localhost:3000/api`

## Next Steps for Frontend Development

1. **Implement polling endpoints** - Add real status checking and results formatting
2. **Build frontend skeleton** - Choose framework and set up basic structure
3. **Implement polling UI** - Forms, buttons, status indicators
4. **Add results display** - Tables, charts, data visualization
5. **Testing & refinement** - Polish UX and handle edge cases