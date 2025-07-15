#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const MCP_SERVER_PATH = 'C:\\Users\\jeffr\\OneDrive\\Documents\\playwright-mcp';
const CONVERSATION_HISTORY_FILE = path.join(__dirname, 'conversation_history.json');

class ClaudeMCPCLI {
    constructor() {
        this.conversationHistory = [];
        this.mcpProcess = null;
        this.anthropic = null;
        this.mcpTools = [];
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'You: '
        });
        
        this.initializeAnthropic();
        this.loadConversationHistory();
        this.setupMCPServer();
    }

    initializeAnthropic() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
            console.error('Please set your Anthropic API key and try again.');
            process.exit(1);
        }
        
        this.anthropic = new Anthropic({
            apiKey: apiKey
        });
    }

    loadConversationHistory() {
        try {
            if (fs.existsSync(CONVERSATION_HISTORY_FILE)) {
                const data = fs.readFileSync(CONVERSATION_HISTORY_FILE, 'utf8');
                this.conversationHistory = JSON.parse(data);
                console.log(`Loaded ${this.conversationHistory.length} previous messages.`);
            }
        } catch (error) {
            console.error('Error loading conversation history:', error.message);
            this.conversationHistory = [];
        }
    }

    saveConversationHistory() {
        try {
            fs.writeFileSync(CONVERSATION_HISTORY_FILE, JSON.stringify(this.conversationHistory, null, 2));
        } catch (error) {
            console.error('Error saving conversation history:', error.message);
        }
    }

    setupMCPServer() {
        console.log('Setting up MCP server connection...');
        
        // Check if MCP server path exists
        if (!fs.existsSync(MCP_SERVER_PATH)) {
            console.error(`MCP server path not found: ${MCP_SERVER_PATH}`);
            console.error('Please verify the path and try again.');
            process.exit(1);
        }

        try {
            // Start MCP server using stdio transport
            this.mcpProcess = spawn('node', ['cli.js'], {
                cwd: MCP_SERVER_PATH,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.mcpProcess.on('error', (error) => {
                console.error('MCP server error:', error.message);
            });

            this.mcpProcess.on('exit', (code) => {
                console.log(`MCP server exited with code ${code}`);
                if (code !== 0) {
                    console.error('MCP server failed to start properly.');
                    console.error('This may affect browser automation capabilities.');
                }
            });

            // Set up JSON-RPC communication
            this.setupMCPCommunication();

            console.log('MCP server started successfully.');
        } catch (error) {
            console.error('Failed to start MCP server:', error.message);
            console.log('Continuing without MCP server...');
        }
    }

    setupMCPCommunication() {
        let buffer = '';
        
        this.mcpProcess.stdout.on('data', (data) => {
            buffer += data.toString();
            
            // Process complete JSON-RPC messages
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line);
                        this.handleMCPMessage(message);
                    } catch (error) {
                        console.error('Error parsing MCP message:', error.message);
                    }
                }
            }
        });

        this.mcpProcess.stderr.on('data', (data) => {
            console.error('MCP server stderr:', data.toString());
        });

        // Initialize MCP protocol
        this.initializeMCP();
    }

    initializeMCP() {
        // Send initialize request
        const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    }
                },
                clientInfo: {
                    name: 'claude-cli',
                    version: '1.0.0'
                }
            }
        };

        this.sendMCPMessage(initRequest);
    }

    sendMCPMessage(message) {
        if (this.mcpProcess && this.mcpProcess.stdin.writable) {
            this.mcpProcess.stdin.write(JSON.stringify(message) + '\n');
        }
    }

    handleMCPMessage(message) {
        if (message.id === 1 && message.result) {
            // Handle initialize response
            console.log('MCP server initialized with capabilities:', 
                Object.keys(message.result.capabilities).join(', '));
            
            // Send initialized notification
            this.sendMCPMessage({
                jsonrpc: '2.0',
                method: 'notifications/initialized'
            });

            // Request available tools
            this.requestTools();
        } else if (message.id === 2 && message.result) {
            // Handle tools list response
            if (message.result.tools) {
                this.mcpTools = message.result.tools;
                console.log(`Available MCP tools: ${this.mcpTools.map(t => t.name).join(', ')}`);
            }
        }
    }

    requestTools() {
        const toolsRequest = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
        };
        this.sendMCPMessage(toolsRequest);
    }

    async callMCPTool(toolName, parameters) {
        return new Promise((resolve, reject) => {
            const id = Date.now();
            const request = {
                jsonrpc: '2.0',
                id: id,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: parameters
                }
            };

            // Set up response handler
            const responseHandler = (data) => {
                try {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            const message = JSON.parse(line);
                            if (message.id === id) {
                                this.mcpProcess.stdout.removeListener('data', responseHandler);
                                if (message.error) {
                                    reject(new Error(message.error.message));
                                } else {
                                    resolve(message.result);
                                }
                                return;
                            }
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            };

            this.mcpProcess.stdout.on('data', responseHandler);
            this.sendMCPMessage(request);

            // Timeout after 30 seconds
            setTimeout(() => {
                this.mcpProcess.stdout.removeListener('data', responseHandler);
                reject(new Error('MCP tool call timeout'));
            }, 30000);
        });
    }

    async sendToClaude(message) {
        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });

        try {
            // Prepare messages for the API
            const messages = this.conversationHistory
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => {
                    // Handle both old format (string content) and new format (array content)
                    let content = msg.content;
                    if (typeof content === 'string') {
                        // Convert string to proper format
                        content = [{
                            type: 'text',
                            text: content
                        }];
                    } else if (Array.isArray(content)) {
                        // Validate array format - ensure all items have required fields
                        content = content.map(item => {
                            if (typeof item === 'string') {
                                return {
                                    type: 'text',
                                    text: item
                                };
                            } else if (item.type === 'tool_result') {
                                // This is a tool result
                                return {
                                    type: 'tool_result',
                                    tool_use_id: item.tool_use_id,
                                    content: item.content,
                                    is_error: item.is_error || false
                                };
                            } else {
                                // This should be a tool_use or text
                                return item;
                            }
                        });
                    } else {
                        // Fallback for any other format
                        content = [{
                            type: 'text',
                            text: JSON.stringify(content)
                        }];
                    }
                    
                    return {
                        role: msg.role,
                        content: content
                    };
                });

            // Build tools array from MCP tools
            const tools = this.mcpTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema
            }));

            // System message with MCP capabilities
            const systemMessage = `You are Claude with access to Playwright browser automation through MCP tools. 
Available tools: ${this.mcpTools.map(t => t.name).join(', ')}

When users ask for browser automation, use the appropriate MCP tools to:
- playwright_navigate: Navigate to URLs
- playwright_screenshot: Take screenshots
- playwright_click: Click elements  
- playwright_type: Type text
- playwright_get_element_text: Get text content
- playwright_wait_for_element: Wait for elements
- And other available Playwright tools

Always call the tools directly when needed for browser automation tasks.`;

            const response = await this.anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                system: systemMessage,
                messages: messages,
                tools: tools.length > 0 ? tools : undefined
            });

            let responseText = '';
            let toolCalls = [];
            let toolResults = [];

            for (const content of response.content) {
                if (content.type === 'text') {
                    responseText += content.text;
                } else if (content.type === 'tool_use') {
                    toolCalls.push(content);
                }
            }

            // Execute tool calls and collect results
            for (const toolCall of toolCalls) {
                try {
                    console.log(`Executing ${toolCall.name}...`);
                    const result = await this.callMCPTool(toolCall.name, toolCall.input);
                    console.log(`Tool ${toolCall.name} completed:`, result);
                    
                    // Store tool result for conversation context
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: JSON.stringify(result, null, 2)
                    });
                } catch (error) {
                    console.error(`Tool ${toolCall.name} failed:`, error.message);
                    
                    // Store error result
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: `Error: ${error.message}`,
                        is_error: true
                    });
                }
            }

            // Add Claude's response to history (including tool calls)
            const assistantMessage = {
                role: 'assistant',
                content: response.content,
                timestamp: new Date().toISOString()
            };
            this.conversationHistory.push(assistantMessage);

            // Add tool results to history if there were any tool calls
            if (toolResults.length > 0) {
                this.conversationHistory.push({
                    role: 'user',
                    content: toolResults,
                    timestamp: new Date().toISOString()
                });
            }

            this.saveConversationHistory();
            return responseText;

        } catch (error) {
            console.error('Error calling Claude API:', error.message);
            return "I apologize, but I encountered an error while processing your request. Please try again.";
        }
    }

    displayWelcome() {
        console.log('='.repeat(60));
        console.log('🤖 Claude CLI with Playwright MCP Server');
        console.log('='.repeat(60));
        console.log('This CLI maintains full conversation context.');
        console.log('Playwright MCP server is integrated for web automation.');
        console.log('Type "exit" to quit, "history" to see conversation history.');
        console.log('Type "clear" to clear conversation history.');
        console.log('='.repeat(60));
        console.log();
    }

    displayHistory() {
        console.log('\n--- Conversation History ---');
        this.conversationHistory.forEach((msg, index) => {
            const timestamp = new Date(msg.timestamp).toLocaleString();
            console.log(`[${index + 1}] ${msg.role.toUpperCase()} (${timestamp}):`);
            
            // Handle different content formats
            if (typeof msg.content === 'string') {
                console.log(msg.content);
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach((item, itemIndex) => {
                    if (item.type === 'text') {
                        console.log(`  Text: ${item.text}`);
                    } else if (item.type === 'tool_use') {
                        console.log(`  Tool Call: ${item.name} with args: ${JSON.stringify(item.input)}`);
                    } else if (item.type === 'tool_result') {
                        console.log(`  Tool Result (${item.tool_use_id}): ${item.content || 'No result'}`);
                    }
                });
            } else {
                console.log(JSON.stringify(msg.content, null, 2));
            }
            console.log('-'.repeat(40));
        });
        console.log('--- End of History ---\n');
    }

    clearHistory() {
        this.conversationHistory = [];
        this.saveConversationHistory();
        console.log('Conversation history cleared.\n');
    }

    async start() {
        // Wait a bit for MCP server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        this.displayWelcome();
        this.rl.prompt();
        
        this.rl.on('line', async (input) => {
            const message = input.trim();
            
            if (message.toLowerCase() === 'exit') {
                console.log('Goodbye!');
                this.cleanup();
                return;
            }
            
            if (message.toLowerCase() === 'history') {
                this.displayHistory();
                this.rl.prompt();
                return;
            }
            
            if (message.toLowerCase() === 'clear') {
                this.clearHistory();
                this.rl.prompt();
                return;
            }
            
            if (message === '') {
                this.rl.prompt();
                return;
            }
            
            try {
                console.log('Claude is thinking...');
                const response = await this.sendToClaude(message);
                console.log(`\nClaude: ${response}\n`);
            } catch (error) {
                console.error('Error:', error.message);
            }
            
            this.rl.prompt();
        });

        this.rl.on('close', () => {
            console.log('\nGoodbye!');
            this.cleanup();
        });
    }

    cleanup() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
        }
        this.rl.close();
        process.exit(0);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Cleaning up...');
    process.exit(0);
});

// Start the CLI
const cli = new ClaudeMCPCLI();
cli.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});