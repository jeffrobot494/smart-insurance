const { mcp: logger } = require('../utils/logger');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class MCPServerManager {
  constructor() {
    this.firecrawlProcess = null;
    this.perplexityProcess = null;
    this.allTools = [];
    this.isInitialized = false;
    
    // Paths to local mcp directory
    this.FIRECRAWL_MCP_PATH = path.join(__dirname, 'firecrawl');
    this.PERPLEXITY_MCP_PATH = path.join(__dirname, 'perplexity');
  }

  async initialize() {
    logger.info('🚀 Starting MCP servers...');
    
    try {
      await this.startFirecrawlMCP();
      await this.startPerplexityMCP();
      await this.waitForServerInitialization();
      
      this.isInitialized = true;
      logger.info('✓ All MCP servers ready');
      logger.info(`✓ Available tools: ${this.allTools.map(t => t.name).join(', ')}\n`);
      
    } catch (error) {
      logger.error('Failed to start MCP servers:', error.message);
      this.cleanup();
      throw error;
    }
  }

  async startFirecrawlMCP() {
    logger.info('  Starting Firecrawl MCP...');
    
    if (!fs.existsSync(this.FIRECRAWL_MCP_PATH)) {
      throw new Error(`Firecrawl MCP path not found: ${this.FIRECRAWL_MCP_PATH}`);
    }

    this.firecrawlProcess = spawn('node', ['dist/index.js'], {
      cwd: this.FIRECRAWL_MCP_PATH,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    this.firecrawlProcess.on('error', (error) => {
      logger.error('Firecrawl MCP error:', error.message);
    });

    this.firecrawlProcess.on('exit', (code) => {
      logger.info(`Firecrawl MCP exited with code ${code}`);
    });

    this.setupMCPCommunication(this.firecrawlProcess, 'firecrawl');
  }

  async startPerplexityMCP() {
    logger.info('  Starting Perplexity MCP...');
    
    if (!fs.existsSync(this.PERPLEXITY_MCP_PATH)) {
      throw new Error(`Perplexity MCP path not found: ${this.PERPLEXITY_MCP_PATH}`);
    }

    this.perplexityProcess = spawn('python', ['perplexity-search.py'], {
      cwd: this.PERPLEXITY_MCP_PATH,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    this.perplexityProcess.on('error', (error) => {
      logger.error('Perplexity MCP error:', error.message);
    });

    this.perplexityProcess.on('exit', (code) => {
      logger.info(`Perplexity MCP exited with code ${code}`);
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
            logger.error(`Error parsing ${serverName} MCP message:`, error.message);
          }
        }
      }
    });

    process.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        logger.debug(`${serverName} MCP stderr: ${message}`);
      }
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
          name: 'smart-insurance-mcp-manager',
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
      logger.info(`  ✓ ${serverName} MCP initialized`);
      
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
        logger.info(`  ✓ ${serverName} tools loaded: ${tools.map(t => t.name).join(', ')}`);
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

  getAvailableTools() {
    return this.allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
  }

  getServerProcess(serverName) {
    switch (serverName) {
      case 'firecrawl':
        return this.firecrawlProcess;
      case 'perplexity':
        return this.perplexityProcess;
      default:
        throw new Error(`Unknown server: ${serverName}`);
    }
  }

  findToolByName(toolName) {
    return this.allTools.find(t => t.name === toolName);
  }

  isReady() {
    return this.isInitialized;
  }

  cleanup() {
    logger.info('🧹 Cleaning up MCP servers...');
    
    if (this.firecrawlProcess) {
      this.firecrawlProcess.kill();
    }
    
    if (this.perplexityProcess) {
      this.perplexityProcess.kill();
    }
  }
}

module.exports = MCPServerManager;