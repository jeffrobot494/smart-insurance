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

// Import database manager - will use singleton that's already initialized
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
      // Use the singleton instance that was already initialized in server.js
      this.databaseManager = DatabaseManager.getInstance();
      
      // Check if database is ready (should be initialized already)
      if (!this.databaseManager.initialized) {
        throw new Error('Database not initialized');
      }
      
      // Database is available
    } catch (error) {
      // Database failed, operating in mock mode
      this.databaseManager = null;
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
          sponsor_dfe_name,
          spons_dfe_ein,
          spons_dfe_mail_us_city,
          spons_dfe_mail_us_state,
          spons_dfe_mail_us_zip,
          year,
          COUNT(*) OVER (PARTITION BY sponsor_dfe_name, spons_dfe_ein) as record_count
        FROM form_5500_records 
        WHERE LOWER(sponsor_dfe_name) = LOWER($1)
        ORDER BY record_count DESC, year DESC
        LIMIT $2
      `;
      params = [companyName, limit];
    } else {
      query = `
        SELECT DISTINCT 
          sponsor_dfe_name,
          spons_dfe_ein,
          spons_dfe_mail_us_city,
          spons_dfe_mail_us_state,
          spons_dfe_mail_us_zip,
          year,
          COUNT(*) OVER (PARTITION BY sponsor_dfe_name, spons_dfe_ein) as record_count
        FROM form_5500_records 
        WHERE LOWER(sponsor_dfe_name) LIKE LOWER($1)
        ORDER BY record_count DESC, year DESC
        LIMIT $2
      `;
      params = [`%${companyName}%`, limit];
    }
    
    const searchResults = await this.databaseManager.query(query, params);
    
    const results = searchResults.rows.map(row => ({
      legalName: row.sponsor_dfe_name,
      ein: row.spons_dfe_ein,
      location: `${row.spons_dfe_mail_us_city}, ${row.spons_dfe_mail_us_state} ${row.spons_dfe_mail_us_zip}`,
      planYear: parseInt(row.year),
      recordCount: parseInt(row.record_count),
      matchType: this.determineMatchType(companyName, row.sponsor_dfe_name)
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