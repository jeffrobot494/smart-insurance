# Smart Insurance Workflow Engine - Developer Summary

**Date:** July 15, 2025  
**Purpose:** Onboarding document for engineers to understand the codebase and make changes quickly

## Overview

This is a Node.js application that executes AI-powered workflows using Claude (Anthropic's AI) with MCP (Model Context Protocol) servers for tool calling. The system can execute multi-step workflows where each task can make tool calls to external services like web search and crawling.

## Architecture

The application follows a modular architecture with clear separation of concerns:

```
Manager.js → WorkflowTaskManager → TaskExecution → ClaudeManager → Anthropic API
              ↓                     ↓
           SaveTaskResults      ToolManager → MCPServerManager → MCP Servers
```

## Core Components

### 1. Entry Point
- **`Manager.js`** - Main entry point that orchestrates workflow execution
  - Parses command line arguments for workflow filename and user inputs
  - Loads workflow JSON files
  - Creates WorkflowTaskManager and executes workflows
  - Can be used from command line or imported as module for web apps

### 2. Workflow Management
- **`WorkflowTaskManager.js`** - Manages task iteration and execution
  - Loads workflow definitions from JSON files
  - Iterates through tasks in dependency order
  - Manages results passing between tasks
  - Initializes MCP servers and tool management
  - Handles task execution flow and error handling

- **`workflowReader.js`** - Reads workflow JSON files
  - Simple utility to load and parse workflow definitions
  - Supports custom workflow filenames

### 3. Task Execution
- **`TaskExecution.js`** - Executes individual workflow tasks
  - Manages conversation loop with Claude
  - Handles tool calling detection and execution
  - Maintains conversation history
  - Continues conversation until Claude stops making tool calls
  - Returns structured results with success/failure status

### 4. Claude Integration
- **`ClaudeManager.js`** - Handles communication with Anthropic API
  - Sends messages to Claude with tool definitions
  - Supports conversation history, system prompts, and tool calling
  - Returns full response content including tool calls
  - Uses Claude 3.5 Sonnet model by default

### 5. Tool Management
- **`MCPServerManager.js`** - Manages MCP server lifecycle
  - Spawns and initializes Firecrawl and Perplexity MCP servers
  - Handles MCP protocol communication
  - Manages tool discovery and availability
  - Provides server cleanup functionality

- **`ToolManager.js`** - Executes tool calls
  - Focused on tool execution only
  - Takes MCPServerManager as dependency
  - Handles tool call requests and responses
  - Provides timeout and error handling

### 6. Data Management
- **`SaveTaskResults.js`** - Handles result persistence
  - Saves task results to timestamped JSON files
  - Uses environment variables for configuration
  - Incremental saving (saves each task as it completes)
  - Organized by task ID with metadata

### 7. Utilities
- **`CLIInputParser.js`** - Parses command line arguments
  - Extracts workflow filename and user inputs
  - Supports key:value format for inputs
  - Provides usage instructions

- **`load-env.js`** - Loads environment variables from .env file
  - Simple utility to load .env files
  - Required for API keys and configuration

## Workflow Definition Format

Workflows are defined in JSON files in `./server/json/`:

```json
{
  "workflow": {
    "name": "PE Firm Research",
    "description": "Research workflow description",
    "tasks": [
      {
        "id": 1,
        "name": "TaskName",
        "outputKey": "result_key",
        "instructions": "Clear instructions for Claude",
        "inputKeys": ["input1", "input2"],
        "dependencies": ["previous_task_name"]
      }
    ]
  }
}
```

### Key Fields:
- **`id`**: Unique task identifier
- **`name`**: Human-readable task name
- **`outputKey`**: Key used to store results for dependent tasks
- **`instructions`**: Instructions given to Claude (be very specific)
- **`inputKeys`**: Array of input keys this task expects
- **`dependencies`**: Array of task names this task depends on

## MCP Servers

The application uses two MCP servers located in `./server/mcp/`:

### Firecrawl MCP (`./server/mcp/firecrawl/`)
- **Tools**: `firecrawl_search`, `firecrawl_map`, `firecrawl_scrape`
- **Purpose**: Web searching, crawling, and scraping
- **Startup**: `node dist/index.js`

### Perplexity MCP (`./server/mcp/perplexity/`)
- **Tools**: Perplexity search tools
- **Purpose**: AI-powered search
- **Startup**: `python perplexity-search.py`

## Configuration

### Environment Variables
- **`ANTHROPIC_API_KEY`**: Required for Claude API access
- **`WORKFLOW_OUTPUT_DIR`**: Directory for output files (default: `./server/json/output`)
- **`WORKFLOW_NAME`**: Set dynamically by application

### Files
- **`.env`**: Environment variables (not committed to git)
- **`CLAUDE.md`**: Project instructions and procedures

## Usage

### Command Line
```bash
# Basic usage
node server/Manager.js workflow.json

# With user inputs
node server/Manager.js pe_research.json name:"Blackstone Group" location:"New York"
```

### Programmatic (Web App)
```javascript
const { run } = require('./server/Manager');

const userInputs = { name: "Blackstone Group" };
const results = await run('pe_research.json', userInputs);
```

## Data Flow

1. **User Input** → Command line or web app provides workflow file and inputs
2. **Workflow Loading** → WorkflowTaskManager loads JSON workflow definition
3. **MCP Initialization** → MCPServerManager spawns and initializes tool servers
4. **Task Iteration** → For each task in workflow:
   - TaskExecution receives task + inputs from previous tasks
   - Claude analyzes task and makes tool calls as needed
   - ToolManager executes tool calls via MCP servers
   - Conversation continues until Claude provides final answer
   - Results stored and passed to next task
5. **Output** → Results saved to timestamped JSON files

## Output Format

Results are saved to `./server/json/output/` with format:
```
{workflow_name}_results_{timestamp}.json
```

Structure:
```json
{
  "tasks": {
    "1": {
      "success": true,
      "taskId": 1,
      "taskName": "TaskName",
      "outputKey": "result_key",
      "result": "actual result data",
      "conversationHistory": [...],
      "savedAt": "2025-07-15T03:51:48.349Z"
    }
  }
}
```

## Key Design Decisions

### 1. Conversation Loop
TaskExecution continues the conversation with Claude until no more tool calls are made. This allows complex multi-step reasoning.

### 2. Tool Call Detection
Claude's responses are parsed for both text and tool_use content blocks. The full response content is preserved to maintain tool calling information.

### 3. Result Passing
Task results are stored by their `outputKey` and made available as inputs to subsequent tasks based on their `inputKeys`.

### 4. Separation of Concerns
- **MCPServerManager**: Server lifecycle only
- **ToolManager**: Tool execution only  
- **TaskExecution**: Task orchestration only
- **ClaudeManager**: API communication only

### 5. Error Handling
Each component handles errors gracefully and provides structured error responses with detailed information.

## Common Modifications

### Adding New MCP Servers
1. Add server files to `./server/mcp/new_server/`
2. Update `MCPServerManager.js` to spawn new server
3. Update `ToolManager.js` to route tool calls to new server

### Creating New Workflows
1. Create JSON file in `./server/json/`
2. Define tasks with clear instructions
3. Specify input/output keys and dependencies
4. Test with: `node server/Manager.js new_workflow.json`

### Modifying Task Instructions
- Be very specific about expected outputs
- Use phrases like "make a final response" for tool calling tasks
- Specify exact format requirements
- Test thoroughly as small changes can affect AI behavior

## Development Tips

1. **Tool Calling**: Always end task instructions with clear guidance about providing final responses
2. **Debugging**: Check conversation history in output files to understand AI behavior
3. **Dependencies**: Ensure task dependencies match actual `outputKey` names
4. **Testing**: Test workflows with different inputs to ensure robustness
5. **Error Handling**: Check both success and failure paths in task execution

## File Structure
```
server/
├── Manager.js              # Main entry point
├── WorkflowTaskManager.js   # Task iteration and management
├── TaskExecution.js         # Individual task execution
├── ClaudeManager.js         # Claude API communication
├── MCPServerManager.js      # MCP server lifecycle
├── ToolManager.js           # Tool execution
├── SaveTaskResults.js       # Result persistence
├── CLIInputParser.js        # Command line parsing
├── workflowReader.js        # Workflow JSON loading
├── load-env.js              # Environment variable loading
├── json/
│   ├── workflow.json        # Default workflow
│   ├── pe_research.json     # PE research workflow
│   └── output/              # Generated results
└── mcp/
    ├── firecrawl/           # Firecrawl MCP server
    └── perplexity/          # Perplexity MCP server
```

This architecture provides a solid foundation for building AI-powered workflow automation systems with clear separation of concerns and extensibility.