#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Environment variables are inherited from parent process
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
      // Get the singleton instance (fresh in this child process)
      this.databaseManager = DatabaseManager.getInstance();
      
      // Initialize it in this child process (inherits env vars from parent)
      await this.databaseManager.initialize();
      
      // Database is now available in this child process
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
          description: "Performs a search in the database for companies with the search term in their name. Returns full legal entity name, city, and state. The database is the Department of Labor's Form 5500 datasets for years 2022, 2023, and 2024. This tool is only used to check for companies in the database, not extracting information about them.",
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
                default: 50
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
    const { companyName, limit = 50, exactOnly = false } = args;
    
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
    const { limit = 50, exactOnly = false } = options;
    
    // If no database connection, return mock data
    if (!this.databaseManager) {
      return {
        searchTerm: companyName,
        success: true,
        resultCount: 1,
        results: [{
          name: `Mock ${companyName} Corporation`,
          city: 'Mock City',
          state: 'ST'
        }]
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
    
    // Create a simplified list of unique companies (deduplicate by name and location)
    const uniqueCompanies = new Map();
    
    searchResults.rows.forEach(row => {
      const key = `${row.sponsor_dfe_name}|${row.spons_dfe_mail_us_city}|${row.spons_dfe_mail_us_state}`;
      if (!uniqueCompanies.has(key)) {
        uniqueCompanies.set(key, {
          name: row.sponsor_dfe_name,
          city: row.spons_dfe_mail_us_city,
          state: row.spons_dfe_mail_us_state
        });
      }
    });
    
    const results = Array.from(uniqueCompanies.values());

    return {
      searchTerm: companyName,
      success: results.length > 0,
      resultCount: results.length,
      results: results
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