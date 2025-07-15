# Claude-Playwright CLI

A Node.js CLI tool that enables conversational interaction with Claude while integrating the Playwright MCP server for web automation capabilities.

This project provides a command-line interface to chat with Claude while having access to browser automation tools through the Playwright MCP (Model Context Protocol) server.

## Features

- **Persistent Conversation Context**: Maintains full conversation history across sessions
- **Playwright MCP Integration**: Connects to the Playwright MCP server for web automation
- **Interactive CLI**: Clean command-line interface with readline support
- **History Management**: View, clear, and persist conversation history
- **Error Handling**: Robust error handling for API calls and MCP server connection

## Prerequisites

1. **Node.js** (version 14 or higher)
2. **Anthropic API Key** - Set as environment variable
3. **Playwright MCP Server** - Available at the specified path

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Or on Windows:
```cmd
set ANTHROPIC_API_KEY=your-api-key-here
```

## Usage

Start the CLI:
```bash
node claude-cli.js
```

Or use the npm script:
```bash
npm start
```

### Available Commands

- **Normal conversation**: Just type your message and press Enter
- **`history`**: Display the full conversation history
- **`clear`**: Clear the conversation history
- **`exit`**: Exit the CLI

## Configuration

The script uses these configuration constants:

- `MCP_SERVER_PATH`: Path to the Playwright MCP server
- `CONVERSATION_HISTORY_FILE`: Where conversation history is stored

## How It Works

1. **Initialization**: 
   - Loads conversation history from JSON file
   - Starts the Playwright MCP server as a subprocess
   - Initializes the Anthropic API client

2. **Conversation Loop**:
   - User types messages in the CLI
   - Messages are sent to Claude via the Anthropic API
   - Full conversation history is included for context
   - Responses are displayed and saved to history

3. **MCP Integration**:
   - The MCP server runs in the background
   - Claude is informed about the server's availability
   - Can be used for web automation tasks with Playwright

## File Structure

- `claude-cli.js`: Main CLI script
- `package.json`: Node.js dependencies
- `conversation_history.json`: Persistent conversation storage (auto-created)

## Error Handling

The script handles various error scenarios:
- Missing API key
- MCP server startup failures
- API call failures
- File system errors

## Example Usage

```
🤖 Claude CLI with Playwright MCP Server
============================================================
This CLI maintains full conversation context.
Playwright MCP server is integrated for web automation.
Type "exit" to quit, "history" to see conversation history.
Type "clear" to clear conversation history.
============================================================

You: Can you help me scrape some data from a website?
Claude is thinking...

Claude: I'd be happy to help you scrape data from a website! With the Playwright MCP server available, I can assist with web automation tasks...

You: history
--- Conversation History ---
[1] USER (12/7/2024, 10:30:45 AM):
Can you help me scrape some data from a website?
[2] ASSISTANT (12/7/2024, 10:30:47 AM):
I'd be happy to help you scrape data from a website! With the Playwright MCP server available, I can assist with web automation tasks...
--- End of History ---
```

## Notes

- The conversation history persists between sessions
- The MCP server path is currently hardcoded - modify `MCP_SERVER_PATH` if needed
- The script uses Claude 3.5 Sonnet model by default
- Maximum response tokens is set to 1024 (configurable)