#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

// Configuration
const PLAYWRIGHT_MCP_PATH = 'C:\\Users\\jeffr\\OneDrive\\Documents\\playwright-mcp';
const FIRECRAWL_MCP_PATH = 'C:\\Users\\jeffr\\OneDrive\\Documents\\firecrawl-mcp-server';
const PERPLEXITY_MCP_PATH = 'C:\\Users\\jeffr\\OneDrive\\Documents\\perplexity-search-mcp';
const MAX_STEPS_PER_TASK = 20;
const MAX_RETRIES_PER_STEP = 3;

class ClaudeMCPSandbox {
    constructor() {
        this.playwrightProcess = null;
        this.firecrawlProcess = null;
        this.perplexityProcess = null;
        this.anthropic = null;
        this.allTools = [];
        this.conversationHistory = [];
        this.currentTask = '';
        this.successCriteria = '';
        this.taskSteps = [];
        this.currentStepIndex = 0;
        this.scriptRootPath = process.cwd(); // Current working directory
        
        this.initializeAnthropic();
        this.setupMCPServers();
        this.addFileOperationTools();
    }

    // File operation functions
    fileRead(relativePath) {
        try {
            const fullPath = path.resolve(this.scriptRootPath, relativePath);
            
            // Security check: ensure path is within script root
            if (!fullPath.startsWith(this.scriptRootPath)) {
                throw new Error('Access denied: Path outside script directory');
            }
            
            const content = fs.readFileSync(fullPath, 'utf8');
            return {
                success: true,
                content: content,
                path: relativePath
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                path: relativePath
            };
        }
    }

    fileWrite(relativePath, content) {
        try {
            const fullPath = path.resolve(this.scriptRootPath, relativePath);
            
            // Security check: ensure path is within script root
            if (!fullPath.startsWith(this.scriptRootPath)) {
                throw new Error('Access denied: Path outside script directory');
            }
            
            // Ensure directory exists
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(fullPath, content, 'utf8');
            return {
                success: true,
                message: `File written successfully`,
                path: relativePath,
                size: content.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                path: relativePath
            };
        }
    }

    fileList(relativePath = '.') {
        try {
            const fullPath = path.resolve(this.scriptRootPath, relativePath);
            
            // Security check: ensure path is within script root
            if (!fullPath.startsWith(this.scriptRootPath)) {
                throw new Error('Access denied: Path outside script directory');
            }
            
            const items = fs.readdirSync(fullPath, { withFileTypes: true });
            const files = items.map(item => ({
                name: item.name,
                type: item.isDirectory() ? 'directory' : 'file',
                path: path.join(relativePath, item.name)
            }));
            
            return {
                success: true,
                files: files,
                path: relativePath
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                path: relativePath
            };
        }
    }

    addFileOperationTools() {
        const fileTools = [
            {
                name: 'file_read',
                description: 'Read content from a file in the script directory',
                serverName: 'local',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'Relative path to the file from script root directory'
                        }
                    },
                    required: ['path']
                }
            },
            {
                name: 'file_write',
                description: 'Write content to a file in the script directory',
                serverName: 'local',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'Relative path to the file from script root directory'
                        },
                        content: {
                            type: 'string',
                            description: 'Content to write to the file'
                        }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'file_list',
                description: 'List files and directories in the script directory',
                serverName: 'local',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'Relative path to the directory from script root (default: current directory)',
                            default: '.'
                        }
                    }
                }
            }
        ];

        this.allTools.push(...fileTools);
        console.log('✓ Local file operation tools added');
    }

    initializeAnthropic() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
            process.exit(1);
        }
        
        this.anthropic = new Anthropic({
            apiKey: apiKey
        });
        console.log('✓ Anthropic API initialized');
    }

    async setupMCPServers() {
        console.log('🚀 Starting MCP servers...');
        
        try {
            await this.startPlaywrightMCP();
            await this.startFirecrawlMCP();
            await this.startPerplexityMCP();
            
            // Wait for both servers to initialize
            await this.waitForServerInitialization();
            
            console.log('✓ All MCP servers ready');
            console.log(`✓ Available tools: ${this.allTools.map(t => t.name).join(', ')}\n`);
            
        } catch (error) {
            console.error('Failed to start MCP servers:', error.message);
            this.cleanup();
            process.exit(1);
        }
    }

    async startPlaywrightMCP() {
        console.log('  Starting Playwright MCP...');
        
        if (!fs.existsSync(PLAYWRIGHT_MCP_PATH)) {
            throw new Error(`Playwright MCP path not found: ${PLAYWRIGHT_MCP_PATH}`);
        }

        this.playwrightProcess = spawn('node', ['cli.js'], {
            cwd: PLAYWRIGHT_MCP_PATH,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        });

        this.playwrightProcess.on('error', (error) => {
            console.error('Playwright MCP error:', error.message);
        });

        this.playwrightProcess.on('exit', (code) => {
            console.log(`Playwright MCP exited with code ${code}`);
        });

        this.setupMCPCommunication(this.playwrightProcess, 'playwright');
    }

    async startFirecrawlMCP() {
        console.log('  Starting Firecrawl MCP...');
        
        if (!fs.existsSync(FIRECRAWL_MCP_PATH)) {
            throw new Error(`Firecrawl MCP path not found: ${FIRECRAWL_MCP_PATH}`);
        }

        this.firecrawlProcess = spawn('node', ['dist/index.js'], {
            cwd: FIRECRAWL_MCP_PATH,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        });

        this.firecrawlProcess.on('error', (error) => {
            console.error('Firecrawl MCP error:', error.message);
        });

        this.firecrawlProcess.on('exit', (code) => {
            console.log(`Firecrawl MCP exited with code ${code}`);
        });

        this.setupMCPCommunication(this.firecrawlProcess, 'firecrawl');
    }

    async startPerplexityMCP() {
        console.log('  Starting Perplexity MCP...');
        
        if (!fs.existsSync(PERPLEXITY_MCP_PATH)) {
            throw new Error(`Perplexity MCP path not found: ${PERPLEXITY_MCP_PATH}`);
        }

        this.perplexityProcess = spawn('python', ['perplexity-search.py'], {
            cwd: PERPLEXITY_MCP_PATH,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        });

        this.perplexityProcess.on('error', (error) => {
            console.error('Perplexity MCP error:', error.message);
        });

        this.perplexityProcess.on('exit', (code) => {
            console.log(`Perplexity MCP exited with code ${code}`);
        });

        this.setupMCPCommunication(this.perplexityProcess, 'perplexity');
    }

    setupMCPCommunication(process, serverName) {
        let buffer = '';
        
        process.stdout.on('data', (data) => {
            buffer += data.toString();
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line);
                        this.handleMCPMessage(message, process, serverName);
                    } catch (error) {
                        console.error(`Error parsing ${serverName} MCP message:`, error.message);
                    }
                }
            }
        });

        process.stderr.on('data', (data) => {
            console.error(`${serverName} MCP stderr:`, data.toString());
        });

        // Initialize the server
        this.initializeMCP(process, serverName);
    }

    initializeMCP(process, serverName) {
        const initRequest = {
            jsonrpc: '2.0',
            id: `init_${serverName}`,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    roots: {
                        listChanged: true
                    }
                },
                clientInfo: {
                    name: 'claude-sandbox',
                    version: '1.0.0'
                }
            }
        };

        this.sendMCPMessage(process, initRequest);
    }

    sendMCPMessage(process, message) {
        if (process && process.stdin.writable) {
            process.stdin.write(JSON.stringify(message) + '\n');
        }
    }

    handleMCPMessage(message, process, serverName) {
        if (message.id && message.id.startsWith('init_') && message.result) {
            console.log(`  ✓ ${serverName} MCP initialized`);
            
            this.sendMCPMessage(process, {
                jsonrpc: '2.0',
                method: 'notifications/initialized'
            });

            this.requestTools(process, serverName);
        } else if (message.id && message.id.startsWith('tools_') && message.result) {
            if (message.result.tools) {
                const tools = message.result.tools.map(tool => ({
                    ...tool,
                    serverName: serverName
                }));
                this.allTools.push(...tools);
                console.log(`  ✓ ${serverName} tools loaded: ${tools.map(t => t.name).join(', ')}`);
            }
        }
    }

    requestTools(process, serverName) {
        const toolsRequest = {
            jsonrpc: '2.0',
            id: `tools_${serverName}`,
            method: 'tools/list'
        };
        this.sendMCPMessage(process, toolsRequest);
    }

    async waitForServerInitialization() {
        // Wait up to 10 seconds for both servers to load their tools
        let attempts = 0;
        while (attempts < 50 && this.allTools.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }
        
        if (this.allTools.length === 0) {
            throw new Error('MCP servers failed to initialize within timeout');
        }
    }

    callLocalTool(toolName, parameters) {
        try {
            let result;
            
            switch (toolName) {
                case 'file_read':
                    result = this.fileRead(parameters.path);
                    break;
                case 'file_write':
                    result = this.fileWrite(parameters.path, parameters.content);
                    break;
                case 'file_list':
                    result = this.fileList(parameters.path || '.');
                    break;
                default:
                    throw new Error(`Unknown local tool: ${toolName}`);
            }
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async callMCPTool(toolName, parameters) {
        const tool = this.allTools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
        }

        // Handle local file operation tools
        if (tool.serverName === 'local') {
            return this.callLocalTool(toolName, parameters);
        }

        const process = tool.serverName === 'playwright' ? this.playwrightProcess : 
                       tool.serverName === 'firecrawl' ? this.firecrawlProcess : this.perplexityProcess;
        
        return new Promise((resolve, reject) => {
            const id = `tool_${Date.now()}_${Math.random()}`;
            const request = {
                jsonrpc: '2.0',
                id: id,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: parameters
                }
            };

            const responseHandler = (data) => {
                try {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            const message = JSON.parse(line);
                            if (message.id === id) {
                                process.stdout.removeListener('data', responseHandler);
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

            process.stdout.on('data', responseHandler);
            this.sendMCPMessage(process, request);

            setTimeout(() => {
                process.stdout.removeListener('data', responseHandler);
                reject(new Error('MCP tool call timeout'));
            }, 60000); // 60 second timeout
        });
    }

    async sendToClaude(message, includeSteps = true) {
        this.conversationHistory.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });

        try {
            const messages = this.conversationHistory
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => ({
                    role: msg.role,
                    content: typeof msg.content === 'string' ? [{
                        type: 'text',
                        text: msg.content
                    }] : msg.content
                }));

            const tools = this.allTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema
            }));

            let systemMessage = `You are Claude, an AI assistant helping to test MCP server capabilities in a sandbox environment.

Available tools from MCP servers: ${this.allTools.map(t => `${t.name} (${t.serverName})`).join(', ')}

Current Task: ${this.currentTask}
Success Criteria: ${this.successCriteria}`;

            if (includeSteps && this.taskSteps.length > 0) {
                systemMessage += `

Task Steps:
${this.taskSteps.map((step, i) => `${i + 1}. ${step}${i === this.currentStepIndex ? ' ← CURRENT STEP' : i < this.currentStepIndex ? ' ✓' : ''}`).join('\n')}

Instructions:
- You are currently working on step ${this.currentStepIndex + 1} of ${this.taskSteps.length}
- Execute the tools needed to complete the current step
- Be efficient and direct in your approach
- After completing the current step, evaluate if you should move to the next step
- If you encounter errors, try alternative approaches within the same step`;
            }

            const response = await this.anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4096,
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

            for (const toolCall of toolCalls) {
                try {
                    console.log(`  🔧 Executing ${toolCall.name}...`);
                    const result = await this.callMCPTool(toolCall.name, toolCall.input);
                    
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: JSON.stringify(result, null, 2)
                    });
                    
                    console.log(`  ✓ ${toolCall.name} completed`);
                } catch (error) {
                    console.error(`  ✗ ${toolCall.name} failed:`, error.message);
                    
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: `Error: ${error.message}`,
                        is_error: true
                    });
                }
            }

            const assistantMessage = {
                role: 'assistant',
                content: response.content,
                timestamp: new Date().toISOString()
            };
            this.conversationHistory.push(assistantMessage);

            if (toolResults.length > 0) {
                this.conversationHistory.push({
                    role: 'user',
                    content: toolResults,
                    timestamp: new Date().toISOString()
                });
            }

            return { responseText, toolCalls, toolResults };

        } catch (error) {
            console.error('Error calling Claude API:', error.message);
            throw error;
        }
    }

    async getUserInput(prompt) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                rl.close();
                resolve(answer.trim());
            });
        });
    }

    clearTaskContext() {
        this.conversationHistory = [];
        this.currentTask = '';
        this.successCriteria = '';
        this.taskSteps = [];
        this.currentStepIndex = 0;
    }

    async executeTaskSteps() {
        console.log('\n🎯 Starting task execution...\n');
        
        while (this.currentStepIndex < this.taskSteps.length && this.currentStepIndex < MAX_STEPS_PER_TASK) {
            const currentStep = this.taskSteps[this.currentStepIndex];
            console.log(`📋 Step ${this.currentStepIndex + 1}/${this.taskSteps.length}: ${currentStep}`);
            
            let stepCompleted = false;
            let retries = 0;
            
            while (!stepCompleted && retries < MAX_RETRIES_PER_STEP) {
                try {
                    const stepMessage = retries === 0 
                        ? `Execute the current step: ${currentStep}`
                        : `The previous attempt failed. Please try a different approach for: ${currentStep}`;
                    
                    const result = await this.sendToClaude(stepMessage);
                    console.log(`Claude: ${result.responseText}`);
                    
                    // Ask Claude if the step is complete
                    const evaluationResult = await this.sendToClaude(
                        `Have you successfully completed step ${this.currentStepIndex + 1}: "${currentStep}"? Reply with "STEP_COMPLETE" if yes, or "STEP_INCOMPLETE" if you need to continue working on this step.`,
                        false
                    );
                    
                    if (evaluationResult.responseText.includes('STEP_COMPLETE')) {
                        stepCompleted = true;
                        console.log(`  ✓ Step ${this.currentStepIndex + 1} completed\n`);
                    } else {
                        retries++;
                        if (retries < MAX_RETRIES_PER_STEP) {
                            console.log(`  ⚠️ Step incomplete, retrying (${retries}/${MAX_RETRIES_PER_STEP})...\n`);
                        }
                    }
                    
                } catch (error) {
                    retries++;
                    console.error(`  ✗ Step failed (${retries}/${MAX_RETRIES_PER_STEP}):`, error.message);
                    
                    if (retries < MAX_RETRIES_PER_STEP) {
                        console.log(`  🔄 Retrying step...\n`);
                    }
                }
            }
            
            if (!stepCompleted) {
                console.log(`  ❌ Step ${this.currentStepIndex + 1} failed after ${MAX_RETRIES_PER_STEP} attempts`);
                console.log('  🤔 Asking Claude to revise the approach...\n');
                
                const revisionResult = await this.sendToClaude(
                    `Step ${this.currentStepIndex + 1} has failed after multiple attempts. Please provide a revised approach or alternative steps to accomplish: ${currentStep}. If this step is impossible or unnecessary, suggest how to proceed.`,
                    false
                );
                console.log(`Claude's revision: ${revisionResult.responseText}\n`);
                
                const shouldContinue = await this.getUserInput('Continue with remaining steps? (y/n): ');
                if (shouldContinue.toLowerCase() !== 'y') {
                    break;
                }
            }
            
            this.currentStepIndex++;
        }
        
        console.log('📊 Evaluating task completion...\n');
        await this.evaluateTaskCompletion();
    }

    async evaluateTaskCompletion() {
        const evaluationResult = await this.sendToClaude(
            `Please evaluate whether you have successfully completed the task. 

Task: ${this.currentTask}
Success Criteria: ${this.successCriteria}

Provide a clear assessment of:
1. What you accomplished
2. Whether the success criteria were met
3. Any results or findings

Begin your response with either "TASK_SUCCESSFUL" or "TASK_FAILED".`,
            false
        );
        
        console.log('🎯 Task Evaluation:');
        console.log('==================');
        console.log(evaluationResult.responseText);
        console.log('==================\n');
    }

    async run() {
        console.log('🧪 Claude MCP Testing Sandbox');
        console.log('===============================\n');
        
        while (true) {
            try {
                this.clearTaskContext();
                
                console.log('📝 Enter a new task for Claude to accomplish:');
                this.currentTask = await this.getUserInput('Task: ');
                
                if (!this.currentTask || this.currentTask.toLowerCase() === 'quit') {
                    break;
                }
                
                this.successCriteria = await this.getUserInput('Success Criteria: ');
                
                console.log('\n🤖 Asking Claude to break down the task into steps...\n');
                
                const stepResult = await this.sendToClaude(
                    `Please break down this task into detailed, actionable steps. Each step should be something that can be accomplished with one or more tool calls.

Task: ${this.currentTask}
Success Criteria: ${this.successCriteria}

Provide a numbered list of steps. Be specific about what needs to be done in each step.`,
                    false
                );
                
                console.log('Proposed Steps:');
                console.log('===============');
                console.log(stepResult.responseText);
                console.log('===============\n');
                
                const approval = await this.getUserInput('Approve these steps? (y/n): ');
                if (approval.toLowerCase() !== 'y') {
                    console.log('Task cancelled by user.\n');
                    continue;
                }
                
                // Extract steps from Claude's response
                const stepLines = stepResult.responseText.split('\n')
                    .filter(line => /^\d+\./.test(line.trim()))
                    .map(line => line.replace(/^\d+\.\s*/, '').trim());
                
                if (stepLines.length === 0) {
                    console.log('No valid steps found. Please try again.\n');
                    continue;
                }
                
                this.taskSteps = stepLines;
                console.log(`\n📋 Executing ${this.taskSteps.length} steps...\n`);
                
                await this.executeTaskSteps();
                
                console.log('Task completed. Press Enter to continue to next task...');
                await this.getUserInput('');
                
            } catch (error) {
                console.error('Task execution error:', error.message);
                console.log('Returning to main menu...\n');
            }
        }
        
        this.cleanup();
    }

    cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        if (this.playwrightProcess) {
            this.playwrightProcess.kill();
        }
        
        if (this.firecrawlProcess) {
            this.firecrawlProcess.kill();
        }
        
        if (this.perplexityProcess) {
            this.perplexityProcess.kill();
        }
        
        console.log('Goodbye!');
        process.exit(0);
    }
}

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Cleaning up...');
    process.exit(0);
});

const sandbox = new ClaudeMCPSandbox();
sandbox.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});