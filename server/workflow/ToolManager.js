const WorkflowAPIError = require('../ErrorHandling/WorkflowAPIError');

class ToolManager {
  constructor(mcpServerManager) {
    this.mcpServerManager = mcpServerManager;
  }

  async callTool(toolName, parameters) {
    // Simple error simulation for testing tool API errors
    if (process.env.ERROR_SIMULATION_MCP === 'true') {
      // Simulate different API errors based on tool name for variety
      const apiName = toolName.includes('crawl') || toolName.includes('scrape') ? 'Firecrawl API' : 'Perplexity API';
      const errorMessage = apiName === 'Firecrawl API' ? 'rate limit exceeded' : 'insufficient credits';
      const errorType = apiName === 'Firecrawl API' ? 'rate_limit' : 'credits_exhausted';
      
      throw new WorkflowAPIError({
        apiName: apiName,
        originalError: new Error(errorMessage),
        statusCode: apiName === 'Firecrawl API' ? 429 : 402,
        errorType: errorType
      });
    }

    if (!this.mcpServerManager.isReady()) {
      throw new Error('MCP servers not initialized. Ensure MCPServerManager is initialized first.');
    }

    const tool = this.mcpServerManager.findToolByName(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const mcpProcess = this.mcpServerManager.getServerProcess(tool.serverName);
    
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
                mcpProcess.stdout.removeListener('data', responseHandler);
                if (message.error) {
                  // Create standardized error based on which tool failed
                  const apiName = this.getAPINameFromTool(toolName, tool.serverName);
                  const workflowError = new WorkflowAPIError({
                    apiName: apiName,
                    originalError: message.error,
                    statusCode: message.error.code, // JSON-RPC error code, not HTTP status
                    errorType: 'tool_api_error'
                  });
                  reject(workflowError);
                } else {
                  resolve(message.result);
                }
                return;
              }
            }
          }
        } catch (error) {
          // JSON parsing error or other communication issue
          const apiName = this.getAPINameFromTool(toolName, tool.serverName);
          const workflowError = new WorkflowAPIError({
            apiName: apiName,
            originalError: error,
            statusCode: null,
            errorType: 'tool_communication_error'
          });
          reject(workflowError);
        }
      };

      mcpProcess.stdout.on('data', responseHandler);
      this.mcpServerManager.sendMCPMessage(mcpProcess, request);

      // Update the existing timeout handler (existing 60-second timeout)
      setTimeout(() => {
        mcpProcess.stdout.removeListener('data', responseHandler);
        const apiName = this.getAPINameFromTool(toolName, tool.serverName);
        const workflowError = new WorkflowAPIError({
          apiName: apiName,
          originalError: new Error('MCP tool call timeout'),
          statusCode: 408, // HTTP timeout status code for timeouts
          errorType: 'tool_timeout_error'
        });
        reject(workflowError);
      }, 60000);
    });
  }

  getAvailableTools() {
    return this.mcpServerManager.getAvailableTools();
  }
  
  /**
   * Helper method to get API name from tool information
   * @param {string} toolName - Name of the tool
   * @param {string} serverName - Name of the MCP server
   * @returns {string} Human-readable API name
   */
  getAPINameFromTool(toolName, serverName) {
    const apiMapping = {
      'firecrawl': 'Firecrawl API',
      'perplexity': 'Perplexity API'
      // Only external APIs that can fail, not database access
    };
    
    return apiMapping[serverName] || `${serverName} API`;
  }
}

module.exports = ToolManager;