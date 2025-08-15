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
        },
        {
          name: "form5500_batch_name_test",
          description: "Performs batch search in the database for multiple companies with search terms in their names. Returns full legal entity name, city, and state for each company. More efficient than individual calls for multiple companies.",
          inputSchema: {
            type: "object",
            properties: {
              companyNames: { 
                type: "array",
                items: { type: "string" },
                description: "Array of company names to search in Form 5500 data"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return per company (default: 10)",
                default: 10
              },
              exactOnly: {
                type: "boolean", 
                description: "If true, only return exact matches (default: false)",
                default: false
              }
            },
            required: ["companyNames"]
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
          case "form5500_batch_name_test":
            return await this.handleForm5500BatchNameTest(args);
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

  async handleForm5500BatchNameTest(args) {
    const { companyNames, limit = 10, exactOnly = false } = args;
    
    if (!companyNames || !Array.isArray(companyNames) || companyNames.length === 0) {
      throw new Error('Company names array is required and must not be empty');
    }

    if (companyNames.length > 50) {
      throw new Error('Maximum 50 companies allowed per batch request');
    }

    // Validate all company names are strings
    if (!companyNames.every(name => typeof name === 'string' && name.trim())) {
      throw new Error('All company names must be non-empty strings');
    }

    const results = await this.batchTestCompanyNames(companyNames, { limit, exactOnly });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  async batchTestCompanyNames(companyNames, options = {}) {
    const { limit = 10, exactOnly = false } = options;
    
    // If no database connection, return mock data
    if (!this.databaseManager) {
      return {
        success: true,
        totalCompanies: companyNames.length,
        results: companyNames.map(name => ({
          searchTerm: name,
          success: true,
          resultCount: 1,
          results: [{
            name: `Mock ${name} Corporation`,
            city: 'Mock City',
            state: 'ST'
          }]
        }))
      };
    }
    
    const batchResults = [];
    
    // Build batch query with UNION ALL for efficiency
    let query;
    let params = [];
    let paramIndex = 1;
    
    const queryParts = companyNames.map(companyName => {
      let whereClause;
      if (exactOnly) {
        whereClause = `LOWER(sponsor_dfe_name) = LOWER($${paramIndex})`;
        params.push(companyName);
      } else {
        whereClause = `LOWER(sponsor_dfe_name) LIKE LOWER($${paramIndex})`;
        params.push(`%${companyName}%`);
      }
      
      const searchTermParam = `$${paramIndex + 1}`;
      params.push(companyName);
      paramIndex += 2;
      
      return `
        SELECT DISTINCT 
          ${searchTermParam} as search_term,
          sponsor_dfe_name,
          spons_dfe_ein,
          spons_dfe_mail_us_city,
          spons_dfe_mail_us_state,
          spons_dfe_mail_us_zip,
          year,
          COUNT(*) OVER (PARTITION BY sponsor_dfe_name, spons_dfe_ein) as record_count
        FROM form_5500_records 
        WHERE ${whereClause}
      `;
    });
    
    query = queryParts.join(' UNION ALL ') + ' ORDER BY record_count DESC, year DESC';
    
    let searchResults;
    try {
      searchResults = await this.databaseManager.query(query, params);
    } catch (error) {
      console.error('❌ Batch query failed:', error.message);
      console.error('Query:', query.substring(0, 500) + '...');
      console.error('Params count:', params.length);
      throw error;
    }
    
    // Group results by search term
    const groupedResults = new Map();
    
    searchResults.rows.forEach(row => {
      const searchTerm = row.search_term;
      if (!groupedResults.has(searchTerm)) {
        groupedResults.set(searchTerm, new Map());
      }
      
      const uniqueCompanies = groupedResults.get(searchTerm);
      const key = `${row.sponsor_dfe_name}|${row.spons_dfe_mail_us_city}|${row.spons_dfe_mail_us_state}`;
      
      if (!uniqueCompanies.has(key)) {
        uniqueCompanies.set(key, {
          name: row.sponsor_dfe_name,
          city: row.spons_dfe_mail_us_city,
          state: row.spons_dfe_mail_us_state
        });
      }
    });
    
    // Format results for each company
    companyNames.forEach(companyName => {
      const companyResults = groupedResults.get(companyName);
      const results = companyResults ? Array.from(companyResults.values()) : [];
      
      batchResults.push({
        searchTerm: companyName,
        success: results.length > 0,
        resultCount: results.length,
        results: results
      });
    });
    
    return {
      success: true,
      totalCompanies: companyNames.length,
      companiesWithResults: batchResults.filter(r => r.success).length,
      results: batchResults
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