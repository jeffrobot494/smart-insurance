#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Load environment variables manually to avoid load-env path issues
const path = require('path');
const fs = require('fs');

function loadEnvManually() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex !== -1) {
          const key = trimmed.substring(0, equalIndex).trim();
          const value = trimmed.substring(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    });
    // Environment loaded (no console output in MCP server)
  } else {
    // No .env file found, using existing environment (no console output in MCP server)
  }
}

// Load environment before importing other modules
loadEnvManually();

// Import database manager - adjust path as needed
const DatabaseManager = require('../../data-extraction/DatabaseManager');

class Form5500MCPServer {
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

    this.databaseManager = null;
    this.setupToolHandlers();
  }

  async initialize() {
    try {
      this.databaseManager = DatabaseManager.getInstance();
      await this.databaseManager.initialize();
      // Database connected successfully (no console output in MCP server)
    } catch (error) {
      // Database failed, operating in mock mode (no console output in MCP server)
      this.databaseManager = null; // Set to null to indicate no database
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "form5500_name_test",
          description: "Test if a company name returns results from Form 5500 dataset. Supports partial matching and returns detailed match information.",
          inputSchema: {
            type: "object",
            properties: {
              companyName: { 
                type: "string",
                description: "Company name to search in Form 5500 data"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)",
                default: 10
              },
              exactOnly: {
                type: "boolean", 
                description: "If true, only return exact matches (default: false)",
                default: false
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
    const { companyName, limit = 10, exactOnly = false } = args;
    
    if (!companyName || typeof companyName !== 'string') {
      throw new Error('Company name is required and must be a string');
    }

    const result = await this.testCompanyName(companyName, { limit, exactOnly });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async testCompanyName(companyName, options = {}) {
    const { limit = 10, exactOnly = false } = options;
    
    // If no database connection, return mock data
    if (!this.databaseManager) {
      return {
        searchTerm: companyName,
        searchType: exactOnly ? 'exact' : 'partial',
        success: true,
        exactMatch: companyName.toLowerCase().includes('test'),
        resultCount: 1,
        results: [{
          legalName: `Mock ${companyName} Corporation`,
          ein: '12-3456789',
          location: 'Mock City, ST 12345',
          planYear: 2023,
          recordCount: 5,
          matchType: companyName.toLowerCase().includes('test') ? 'exact' : 'partial'
        }],
        timestamp: new Date().toISOString(),
        note: 'Mock data - database not available'
      };
    }
    
    let query;
    let params;

    if (exactOnly) {
      query = `
        SELECT DISTINCT 
          sponsor_name,
          sponsor_ein,
          sponsor_city,
          sponsor_state,
          sponsor_zipcode,
          plan_year,
          COUNT(*) OVER (PARTITION BY sponsor_name, sponsor_ein) as record_count
        FROM form_5500_data 
        WHERE LOWER(sponsor_name) = LOWER($1)
        ORDER BY record_count DESC, plan_year DESC
        LIMIT $2
      `;
      params = [companyName, limit];
    } else {
      query = `
        SELECT DISTINCT 
          sponsor_name,
          sponsor_ein,
          sponsor_city,
          sponsor_state,
          sponsor_zipcode,
          plan_year,
          COUNT(*) OVER (PARTITION BY sponsor_name, sponsor_ein) as record_count
        FROM form_5500_data 
        WHERE LOWER(sponsor_name) LIKE LOWER($1)
        ORDER BY record_count DESC, plan_year DESC
        LIMIT $2
      `;
      params = [`%${companyName}%`, limit];
    }
    
    const searchResults = await this.databaseManager.query(query, params);
    
    const results = searchResults.rows.map(row => ({
      legalName: row.sponsor_name,
      ein: row.sponsor_ein,
      location: `${row.sponsor_city}, ${row.sponsor_state} ${row.sponsor_zipcode}`,
      planYear: parseInt(row.plan_year),
      recordCount: parseInt(row.record_count),
      matchType: this.determineMatchType(companyName, row.sponsor_name)
    }));

    return {
      searchTerm: companyName,
      searchType: exactOnly ? 'exact' : 'partial',
      success: results.length > 0,
      exactMatch: results.some(r => r.matchType === 'exact'),
      resultCount: results.length,
      results: results,
      timestamp: new Date().toISOString()
    };
  }

  determineMatchType(searchName, foundName) {
    const searchLower = searchName.toLowerCase().replace(/[^\w\s]/g, '');
    const foundLower = foundName.toLowerCase().replace(/[^\w\s]/g, '');
    
    if (searchLower === foundLower) return 'exact';
    if (foundLower.includes(searchLower)) return 'contains_search';
    if (searchLower.includes(foundLower)) return 'contains_found';
    return 'partial';
  }

  async run() {
    await this.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Run the server if called directly
if (require.main === module) {
  const server = new Form5500MCPServer();
  server.run().catch(console.error);
}

module.exports = Form5500MCPServer;