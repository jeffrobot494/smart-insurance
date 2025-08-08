# Smart Insurance Application Architecture

## Overview

The Smart Insurance application is a Node.js-based workflow automation system designed to research private equity (PE) firms, extract portfolio company information, and match companies to their legal entity names in Department of Labor Form 5500 filings. The system uses AI (Claude) with Model Context Protocol (MCP) servers to perform complex research and data extraction tasks.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Express API   │    │   PostgreSQL    │
│   (Website)     │◄──►│     Server      │◄──►│    Database     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Workflow Engine│
                    │   (Manager.js)  │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ MCP Server      │
                    │   Manager       │
                    └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼         ▼         ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │Firecrawl │ │Perplexity│ │Form 5500 │
            │   MCP    │ │   MCP    │ │   MCP    │
            │ Server   │ │ Server   │ │ Server   │
            └──────────┘ └──────────┘ └──────────┘
```

## Core Components

### 1. Express API Server (`server/server.js`)

**Purpose**: HTTP API endpoint handling
**Port**: 3000 (default)
**Key Features**:
- REST API endpoints for workflow execution
- Health checks and monitoring
- Static file serving
- Request/response handling

**Main Routes**:
- `POST /api/workflow` - Start workflow execution
- `GET /api/workflow/:id/results` - Get workflow results
- `GET /api/workflow/results` - Get all workflow results
- `GET /api/health` - Health check endpoint
- `GET /api/polling/:id` - Workflow status polling

### 2. Workflow Engine (`server/Manager.js`)

**Purpose**: Central orchestrator for workflow execution
**Key Responsibilities**:
- Load and parse workflow JSON definitions
- Execute tasks sequentially
- Manage inputs/outputs between tasks
- Interface with MCP servers via ToolManager
- Save results to database

**Workflow Flow**:
1. Parse workflow JSON file
2. Initialize MCP servers
3. Execute tasks in sequence
4. Pass outputs from one task as inputs to next
5. Save final results to PostgreSQL

### 3. MCP (Model Context Protocol) Architecture

#### MCP Server Manager (`server/mcp/MCPServerManager.js`)

**Purpose**: Manage multiple MCP servers as child processes
**Architecture**: Refactored array-based approach (75% code reduction)

```javascript
this.servers = [
  { name: 'firecrawl', command: 'node', args: ['dist/index.js'], dir: 'firecrawl' },
  { name: 'perplexity', command: 'python', args: ['perplexity-search.py'], dir: 'perplexity' },
  { name: 'form5500', command: 'node', args: ['index.js'], dir: 'form5500' }
];
```

**Communication Protocol**:
- JSON-RPC 2.0 over stdin/stdout
- Spawns servers as child processes
- Handles tool discovery and execution
- Error handling and process cleanup

#### Individual MCP Servers

##### Firecrawl MCP Server (`server/mcp/firecrawl/`)
- **Purpose**: Web scraping and content extraction
- **Technology**: Node.js
- **Tools Provided**: 
  - `firecrawl_search` - Search web content
  - `firecrawl_map` - Map website structure
  - `firecrawl_scrape` - Extract content from URLs

##### Perplexity MCP Server (`server/mcp/perplexity/`)
- **Purpose**: AI-powered web research and fact-checking
- **Technology**: Python
- **Tools Provided**:
  - `perplexity_search` - General web research
  - `research_legal_entity` - Legal entity research (Stage 3)

##### Form 5500 MCP Server (`server/mcp/form5500/`)
- **Purpose**: Query Department of Labor Form 5500 database
- **Technology**: Node.js
- **Database**: PostgreSQL (`form_5500_records` table)
- **Tools Provided**:
  - `form5500_name_test` - Test company names against Form 5500 data

**Database Schema**:
```sql
form_5500_records:
  - sponsor_dfe_name (company name)
  - spons_dfe_ein (employer ID number)
  - spons_dfe_mail_us_city, spons_dfe_mail_us_state, spons_dfe_mail_us_zip (location)
  - year (plan year)
  - plan_name, business_code, etc.
```

### 4. Tool Manager (`server/workflow/ToolManager.js`)

**Purpose**: Interface between workflow engine and MCP servers
**Key Functions**:
- Discover available tools from all MCP servers
- Route tool calls to appropriate MCP server
- Handle tool execution and response parsing
- Manage tool timeouts and error handling

### 5. Database Layer

#### Database Manager (`server/data-extraction/DatabaseManager.js`)
- **Pattern**: Singleton
- **Database**: PostgreSQL
- **Connection**: Environment-based configuration

#### Key Tables:
- `form_5500_records` - Department of Labor Form 5500 filings (~500k records)
- `portfolio_companies` - Extracted portfolio companies from PE research
- `workflow_executions` - Workflow execution tracking and results
- `schedule_a_records` - Additional Form 5500 schedule data

### 6. Workflow System

#### Workflow Definitions (`server/json/`)
JSON files defining workflow steps and AI instructions:

- `pe_firm_research.json` - Research PE firm websites for portfolio companies
- `test_name_resolution.json` - Stage 1 testing workflow
- `resolve_legal_entities.json` - Stage 3 comprehensive resolution (planned)

#### Workflow Structure:
```json
{
  "workflow": {
    "name": "Workflow Name",
    "description": "Description",
    "tasks": [
      {
        "id": 1,
        "name": "TaskName",
        "outputKey": "output_key",
        "inputKeys": ["input"],
        "instructions": "Detailed AI instructions..."
      }
    ]
  }
}
```

#### Task Execution (`server/workflow/TaskExecution.js`)
- Communicates with Claude AI
- Provides available tools context
- Executes AI instructions with tool access
- Parses and validates responses

## Data Flow

### Typical Workflow Execution:

1. **HTTP Request** → Express server receives POST to `/api/workflow`
2. **Workflow Loading** → Manager.js loads workflow JSON definition
3. **MCP Initialization** → Start/verify MCP servers are running
4. **Task Execution Loop**:
   - Load task definition and instructions
   - Send to Claude AI with available tools
   - Claude calls MCP tools as needed
   - Collect and validate task results
   - Pass outputs to next task
5. **Result Storage** → Save final results to PostgreSQL
6. **Response** → Return execution ID for polling

### MCP Tool Call Flow:

1. **Claude Decision** → AI decides to use a tool
2. **Tool Manager** → Routes tool call to appropriate MCP server
3. **MCP Communication** → JSON-RPC call over stdin/stdout
4. **Tool Execution** → MCP server processes request (database query, web search, etc.)
5. **Response Path** → Result flows back through MCP → Tool Manager → Claude
6. **AI Processing** → Claude incorporates tool result into workflow

## Legal Entity Resolution System (3-Stage Implementation)

### Stage 1: Core Testing Infrastructure ✅
- **Purpose**: Test individual company names against Form 5500 database
- **Components**: Form 5500 MCP server, basic testing workflow
- **Status**: Implemented and tested with real database

### Stage 2: Name Variation Generation (Planned)
- **Purpose**: Generate and test systematic name variations
- **Components**: Name variation generator, enhanced testing workflow
- **Techniques**: Legal suffixes, abbreviations, punctuation handling

### Stage 3: External Research & Verification (Planned)  
- **Purpose**: Use AI research for unmatched companies
- **Components**: Enhanced Perplexity MCP, location verification
- **Features**: Confidence scoring, manual review flagging

## Configuration and Environment

### Environment Variables (`.env`)
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432  
POSTGRES_DB=railway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=xxx

LOG_SERVICES=mcp,server,workflow,manager,database,files,parsing
NODE_ENV=development
```

### Logging System (`server/utils/logger.js`)
- **Framework**: Winston
- **Outputs**: Console (development) + log files
- **Services**: Configurable service-based filtering
- **Files**: `logs/combined.log`, `logs/error.log`

## Security and Error Handling

### Security Features:
- Environment-based configuration
- No hardcoded credentials
- Input validation on API endpoints
- SQL parameterized queries

### Error Handling:
- Global Express error middleware
- MCP server process monitoring
- Database connection recovery
- Workflow execution error tracking

## Performance Characteristics

### Database:
- **Records**: ~500,538 Form 5500 records
- **Queries**: Optimized with DISTINCT and window functions
- **Connection**: Singleton pattern with connection pooling

### MCP Servers:
- **Communication**: Asynchronous via child processes
- **Concurrency**: Multiple servers can run simultaneously
- **Recovery**: Automatic restart on failure

### Workflow Execution:
- **Pattern**: Sequential task execution
- **Persistence**: Results saved at each step
- **Polling**: Status updates via dedicated endpoint

## Development and Testing

### Project Structure:
```
server/
├── data-extraction/     # Database and extraction services
├── json/               # Workflow definitions
├── logs/               # Application logs  
├── mcp/               # MCP servers
│   ├── firecrawl/
│   ├── perplexity/
│   └── form5500/
├── routes/            # Express route handlers
├── utils/             # Utilities and helpers
└── workflow/          # Workflow execution engine
```

### Testing Approach:
- Direct MCP server testing
- Workflow-level integration testing
- Database query validation
- End-to-end API testing

## Integration Points

### External Services:
- **Firecrawl**: Web scraping service
- **Perplexity**: AI research service  
- **Claude AI**: Task execution and reasoning
- **Department of Labor**: Form 5500 data source

### Internal Integration:
- MCP servers communicate via JSON-RPC
- Database queries use parameterized statements
- Workflow results are JSON-serialized
- Frontend polls for workflow completion

This architecture provides a scalable, AI-powered system for complex business research and data matching tasks while maintaining clear separation of concerns and robust error handling.