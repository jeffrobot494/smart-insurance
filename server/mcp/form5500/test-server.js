#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

class Form5500MCPTestServer {
  constructor() {
    this.server = new Server(
      {
        name: "form5500-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "form5500_name_test",
          description: "Test if a company name returns results from Form 5500 dataset",
          inputSchema: {
            type: "object",
            properties: {
              companyName: { 
                type: "string",
                description: "Company name to search in Form 5500 data"
              }
            },
            required: ["companyName"]
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "form5500_name_test":
            return await this.handleForm5500NameTest(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async handleForm5500NameTest(args) {
    const { companyName } = args;
    
    // Mock response for testing
    const mockResult = {
      searchTerm: companyName,
      success: true,
      exactMatch: companyName.toLowerCase().includes("test"),
      resultCount: 1,
      results: [{
        legalName: `Mock ${companyName} Corp`,
        ein: "12-3456789",
        location: "Test City, ST 12345",
        planYear: 2023,
        recordCount: 5,
        matchType: "exact"
      }],
      timestamp: new Date().toISOString()
    };
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(mockResult, null, 2)
      }]
    };
  }

  async run() {
    // No console output in MCP servers - it interferes with JSON protocol
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Run the server if called directly
if (require.main === module) {
  const server = new Form5500MCPTestServer();
  server.run().catch(console.error);
}

module.exports = Form5500MCPTestServer;