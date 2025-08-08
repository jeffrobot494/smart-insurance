const { mcp: logger } = require('../utils/logger');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class MCPServerManager {
  constructor() {
    this.processes = new Map(); // Replaces individual process properties
    this.allTools = [];
    this.isInitialized = false;
    
    // Server configurations - easy to add new servers
    this.servers = [
      {
        name: 'firecrawl',
        command: 'node',
        args: ['dist/index.js'],
        dir: 'firecrawl'
      },
      {
        name: 'perplexity',
        command: 'python',
        args: ['perplexity-search.py'],
        dir: 'perplexity'
      },
      {
        name: 'form5500',        // NEW SERVER - using real database
        command: 'node',
        args: ['index.js'],
        dir: 'form5500'
      }
    ];
  }

  async initialize() {
    logger.info('🚀 Starting MCP servers...');
    
    try {
      // Start all servers using generic method
      for (const serverConfig of this.servers) {
        await this.startServer(serverConfig);
      }
      
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

  async startServer(config) {
    logger.info(`  Starting ${config.name} MCP...`);
    
    const serverPath = path.join(__dirname, config.dir);
    if (!fs.existsSync(serverPath)) {
      throw new Error(`${config.name} MCP path not found: ${serverPath}`);
    }

    const serverProcess = spawn(config.command, config.args, {
      cwd: serverPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    serverProcess.on('error', (error) => {
      logger.error(`${config.name} MCP error:`, error.message);
    });

    serverProcess.on('exit', (code) => {
      logger.info(`${config.name} MCP exited with code ${code}`);
    });

    this.processes.set(config.name, serverProcess);
    this.setupMCPCommunication(serverProcess, config.name);
  }

  async cleanup() {
    logger.info('🧹 Cleaning up MCP servers...');
    
    // Kill all processes generically
    for (const [name, serverProcess] of this.processes) {
      if (serverProcess) {
        serverProcess.kill();
        logger.info(`✓ ${name} process cleaned up`);
      }
    }
    
    this.processes.clear();
    this.isInitialized = false;
    logger.info('MCP processes cleaned up');
  }

  // Updated getServerProcess method for new architecture
  getServerProcess(serverName) {
    const serverProcess = this.processes.get(serverName);
    if (!serverProcess) {
      throw new Error(`Unknown server: ${serverName}`);
    }
    return serverProcess;
  }

  // All existing MCP communication methods stay exactly the same
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

  findToolByName(toolName) {
    return this.allTools.find(t => t.name === toolName);
  }

  isReady() {
    return this.isInitialized;
  }
}

module.exports = MCPServerManager;