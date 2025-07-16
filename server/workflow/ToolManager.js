class ToolManager {
  constructor(mcpServerManager) {
    this.mcpServerManager = mcpServerManager;
  }

  async callTool(toolName, parameters) {
    if (!this.mcpServerManager.isReady()) {
      throw new Error('MCP servers not initialized. Ensure MCPServerManager is initialized first.');
    }

    const tool = this.mcpServerManager.findToolByName(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const process = this.mcpServerManager.getServerProcess(tool.serverName);
    
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
      this.mcpServerManager.sendMCPMessage(process, request);

      setTimeout(() => {
        process.stdout.removeListener('data', responseHandler);
        reject(new Error('MCP tool call timeout'));
      }, 60000);
    });
  }

  getAvailableTools() {
    return this.mcpServerManager.getAvailableTools();
  }
}

module.exports = ToolManager;