const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ToolManager {
  constructor() {
    this.firecrawlProcess = null;
    this.perplexityProcess = null;
    this.allTools = [];
    this.isInitialized = false;
    
    // Updated paths to local mcp directory
    this.FIRECRAWL_MCP_PATH = path.join(__dirname, 'mcp', 'firecrawl');
    this.PERPLEXITY_MCP_PATH = path.join(__dirname, 'mcp', 'perplexity');
  }

  async initialize() {
    console.log('🚀 Starting MCP servers...');
    
    try {
      await this.startFirecrawlMCP();
      await this.startPerplexityMCP();
      await this.waitForServerInitialization();
      
      this.isInitialized = true;
      console.log('✓ All MCP servers ready');
      console.log(`✓ Available tools: ${this.allTools.map(t => t.name).join(', ')}\n`);
      
    } catch (error) {
      console.error('Failed to start MCP servers:', error.message);
      this.cleanup();
      throw error;
    }
  }

  async startFirecrawlMCP() {
    console.log('  Starting Firecrawl MCP...');
    
    if (!fs.existsSync(this.FIRECRAWL_MCP_PATH)) {
      throw new Error(`Firecrawl MCP path not found: ${this.FIRECRAWL_MCP_PATH}`);
    }

    this.firecrawlProcess = spawn('node', ['dist/index.js'], {
      cwd: this.FIRECRAWL_MCP_PATH,
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
    
    if (!fs.existsSync(this.PERPLEXITY_MCP_PATH)) {
      throw new Error(`Perplexity MCP path not found: ${this.PERPLEXITY_MCP_PATH}`);
    }

    this.perplexityProcess = spawn('python', ['perplexity-search.py'], {
      cwd: this.PERPLEXITY_MCP_PATH,
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
          name: 'smart-insurance-tool-manager',
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
    let attempts = 0;
    while (attempts < 50 && this.allTools.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    
    if (this.allTools.length === 0) {
      throw new Error('MCP servers failed to initialize within timeout');
    }
  }

  async callTool(toolName, parameters) {
    if (!this.isInitialized) {
      throw new Error('ToolManager not initialized. Call initialize() first.');
    }

    const tool = this.allTools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const process = tool.serverName === 'firecrawl' ? this.firecrawlProcess : this.perplexityProcess;
    
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
      }, 60000);
    });
  }

  getAvailableTools() {
    return this.allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
  }

  cleanup() {
    console.log('🧹 Cleaning up MCP servers...');
    
    if (this.firecrawlProcess) {
      this.firecrawlProcess.kill();
    }
    
    if (this.perplexityProcess) {
      this.perplexityProcess.kill();
    }
  }
}

module.exports = ToolManager;