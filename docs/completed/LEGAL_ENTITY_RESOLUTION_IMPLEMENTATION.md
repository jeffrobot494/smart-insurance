# Legal Entity Resolution Implementation Guide

## Overview

This document outlines a three-stage implementation plan for adding intelligent legal entity name resolution to the Smart Insurance workflow system. The goal is to resolve the problem where portfolio company names from PE firm websites don't match their legal entity names in Form 5500 filings.

**Problem**: Companies like "Porky Pig's Beef Ribs" (website name) may be filed as "Porky Pig LLC" or "GES Administrative Services" in Form 5500 data, causing failed lookups.

**Solution**: Add AI-powered iterative search with external research and verification capabilities.

---

## Stage 1: Core Testing Infrastructure

### Goal
Build the foundation - database search tools and basic testing capability

### Implementation Steps

#### Step 1.1: Create Form 5500 MCP Server

Create the directory structure:
```bash
mkdir -p server/mcp/form5500
```

**File: `server/mcp/form5500/index.js`**
```javascript
#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

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
      console.log('Form 5500 MCP Server initialized');
    } catch (error) {
      console.error('Failed to initialize Form 5500 MCP Server:', error);
      throw error;
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
```

**File: `server/mcp/form5500/package.json`**
```json
{
  "name": "form5500-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Form 5500 data testing",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.15.0"
  }
}
```

#### Step 1.2: Refactor MCP Server Manager

Your current `MCPServerManager.js` uses individual methods for each server, which creates repetitive code. Since all three servers (firecrawl, perplexity, form5500) follow the same MCP protocol with only configuration differences, we'll refactor to a cleaner array-based approach.

**This step involves refactoring your existing MCPServerManager for better maintainability (75% less code).**

**File: `server/mcp/MCPServerManager.js` - Complete Refactor**
```javascript
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
        name: 'form5500',        // NEW SERVER - just add to array!
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

    const process = spawn(config.command, config.args, {
      cwd: serverPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    process.on('error', (error) => {
      logger.error(`${config.name} MCP error:`, error.message);
    });

    process.on('exit', (code) => {
      logger.info(`${config.name} MCP exited with code ${code}`);
    });

    this.processes.set(config.name, process);
    this.setupMCPCommunication(process, config.name);
  }

  async cleanup() {
    logger.info('Cleaning up MCP processes...');
    
    // Kill all processes generically
    for (const [name, process] of this.processes) {
      if (process) {
        process.kill();
        logger.info(`✓ ${name} process cleaned up`);
      }
    }
    
    this.processes.clear();
    this.isInitialized = false;
    logger.info('MCP processes cleaned up');
  }

  // Keep all your existing methods unchanged:
  // - setupMCPCommunication()
  // - handleMCPMessage()  
  // - initializeMCP()
  // - sendMCPMessage()
  // - requestTools()
  // - waitForServerInitialization()
  // - getServerProcess() - UPDATE THIS METHOD (see below)
}
```

**Update the getServerProcess method:**
```javascript
getServerProcess(serverName) {
  const process = this.processes.get(serverName);
  if (!process) {
    throw new Error(`Unknown server: ${serverName}`);
  }
  return process;
}
```

**Benefits of This Refactor:**
- 75% less code (from ~120 lines to ~30 lines for server management)
- Adding future servers requires only adding to the array
- No repetitive code maintenance  
- All servers guaranteed to behave identically
- Your existing MCP communication methods stay exactly the same

#### Step 1.3: Create Basic Testing Workflow

**File: `server/json/test_name_resolution.json`**
```json
{
  "workflow": {
    "name": "Test Name Resolution",
    "description": "Test individual company names against Form 5500 data",
    "tasks": [
      {
        "id": 1,
        "name": "TestCompanyNames",
        "outputKey": "test_results",
        "inputKeys": ["companies"],
        "instructions": "For each company name provided, use the form5500_name_test tool to search for matches in the Form 5500 dataset.\n\n**Process:**\n\n1. **Test Each Company**: For each company in the input list, call form5500_name_test with the exact name\n\n2. **Document Results**: Record what you find:\n   - Whether any matches were found\n   - If there's an exact match\n   - The number of matches\n   - Details about the best matches\n\n3. **Analyze Match Quality**: For each result, note:\n   - Match type (exact, contains, partial)\n   - Legal entity name found\n   - Location information\n   - Number of Form 5500 records\n\n**Output Format:**\nReturn results in this exact JSON structure:\n\n```json\n{\n  \"tested_companies\": [\n    {\n      \"original_name\": \"Company Name\",\n      \"search_result\": {\n        \"found_matches\": true,\n        \"exact_match\": false,\n        \"match_count\": 3,\n        \"search_successful\": true,\n        \"best_matches\": [\n          {\n            \"legal_name\": \"Found Legal Name\",\n            \"ein\": \"12-3456789\",\n            \"location\": \"City, State ZIP\",\n            \"match_type\": \"contains_search\",\n            \"plan_year\": 2023,\n            \"record_count\": 5\n          }\n        ]\n      }\n    }\n  ],\n  \"summary\": {\n    \"total_tested\": 3,\n    \"found_matches\": 2,\n    \"exact_matches\": 1,\n    \"no_matches\": 1\n  }\n}\n```\n\n**Important**: Use the form5500_name_test tool exactly once for each company name. Test the names exactly as provided in the input."
      }
    ]
  }
}
```

#### Step 1.4: Create Testing Route (Optional but Recommended)

**File: Add to `server/routes/workflow.js`**
```javascript
// Add this route for direct testing
router.post('/test/form5500-search', async (req, res) => {
  try {
    const { companyName, limit, exactOnly } = req.body;
    
    if (!companyName) {
      return res.status(400).json({
        success: false,
        error: 'Company name is required'
      });
    }

    // Get the tool manager
    const { getToolManager } = require('../server');
    const toolManager = getToolManager();
    
    if (!toolManager) {
      return res.status(500).json({
        success: false,
        error: 'Tool manager not available'
      });
    }

    // Call the form5500_name_test tool directly
    const result = await toolManager.callTool('form5500_name_test', {
      companyName,
      limit: limit || 10,
      exactOnly: exactOnly || false
    });

    res.json({
      success: true,
      result: JSON.parse(result.content[0].text)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Testing Stage 1

#### Install Dependencies
```bash
cd server/mcp/form5500
npm install
cd ../../..
```

#### Test 1: Server Startup and Tool Discovery
```bash
# Start your server and watch the logs
npm start

# Look for these specific log messages:
# "🚀 Starting MCP servers..."
# "  Starting Form 5500 MCP..."
# "  ✓ Form 5500 MCP started"
# "✓ All MCP servers ready"
# "✓ Available tools: [should include form5500_name_test]"
```

**Success Indicators:**
- ✅ No errors during server startup
- ✅ "form5500_name_test" appears in the available tools list
- ✅ All three MCP servers (firecrawl, perplexity, form5500) start successfully

#### Test 2: Direct Tool Testing (via API route)
```bash
# Test the MCP tool directly via API route (if implemented)
curl -X POST http://localhost:3000/api/workflow/test/form5500-search \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "McDonald'\''s Corporation",
    "limit": 5
  }'

# Expected response format:
# {
#   "success": true,
#   "result": {
#     "searchTerm": "McDonald's Corporation",
#     "success": true,
#     "resultCount": X,
#     "results": [...]
#   }
# }
```

#### Test 3: Basic Workflow Testing
```bash
# Test with known companies that should exist in your database
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "test_name_resolution",
    "input": {
      "companies": ["McDonald'\''s Corporation", "Walmart Inc", "Non Existent Company"]
    }
  }'

# Check the workflow results to see:
# - Claude used the form5500_name_test tool
# - Results show match counts and types
# - Legal names, EINs, locations are included
```

#### Test 4: Edge Cases and Special Characters
```bash
# Test with challenging names
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "test_name_resolution", 
    "input": {
      "companies": ["Apple", "Apple Inc", "Apple Computer", "AT&T"]
    }
  }'
```

#### Test 5: Verify Database Connection
```bash
# Test a simple database query to ensure your Form 5500 data is accessible
# You can run this directly in your PostgreSQL client:

# SELECT COUNT(*) FROM form_5500_data;
# SELECT DISTINCT sponsor_name FROM form_5500_data LIMIT 10;
```

#### What Success Looks Like

**Server Logs Should Show:**
```
🚀 Starting MCP servers...
  Starting Firecrawl MCP...
  ✓ Firecrawl MCP started
  Starting Perplexity MCP...
  ✓ Perplexity MCP started
  Starting Form 5500 MCP...
Form 5500 MCP Server initialized
  ✓ Form 5500 MCP started
✓ All MCP servers ready
✓ Available tools: firecrawl_search, firecrawl_map, firecrawl_scrape, perplexity_search, form5500_name_test

Server started on port 3000
```

**Workflow Results Should Include:**
```json
{
  "tested_companies": [
    {
      "original_name": "McDonald's Corporation",
      "search_result": {
        "found_matches": true,
        "exact_match": true,
        "match_count": 5,
        "search_successful": true,
        "best_matches": [
          {
            "legal_name": "McDonald's Corporation",
            "ein": "36-2361282",
            "location": "Chicago, IL 60601",
            "match_type": "exact",
            "plan_year": 2023,
            "record_count": 12
          }
        ]
      }
    }
  ]
}
```

### Success Criteria for Stage 1
- [ ] Form 5500 MCP server starts without errors
- [ ] form5500_name_test tool is discovered by ToolManager
- [ ] Direct tool calls return structured results
- [ ] Workflow executes and Claude uses the tool correctly
- [ ] Can identify exact matches vs partial matches
- [ ] Results include legal names, EINs, and locations
- [ ] Can test individual company names and see database matches

### Troubleshooting Stage 1

**Common Issues:**

1. **MCP Server Won't Start**
   - Check that all dependencies are installed in `server/mcp/form5500/`
   - Verify database connection works
   - Check that DatabaseManager is properly imported

2. **Tool Not Discovered**
   - Verify MCPServerManager includes the form5500 server
   - Check server startup logs for initialization errors
   - Ensure the tool schema is valid JSON

3. **Database Queries Fail**
   - Verify your Form 5500 table name and column names match the query
   - Check database connection and credentials
   - Test the query directly in PostgreSQL

---

## Stage 2: Name Variation Generation

### Goal
Add intelligent name variation logic and systematic testing to find matches that fail exact name searches.

### Implementation Steps

#### Step 2.1: Create Name Variation Generator

**File: `server/utils/NameVariationGenerator.js`**
```javascript
class NameVariationGenerator {
  /**
   * Generate systematic name variations for a company name
   * @param {string} companyName - Original company name
   * @returns {Array<string>} - Array of name variations
   */
  static generateVariations(companyName) {
    const variations = new Set();
    const original = companyName.trim();
    variations.add(original);
    
    // Base cleaning - remove punctuation
    const noPunct = original.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (noPunct !== original && noPunct.length > 0) {
      variations.add(noPunct);
    }
    
    // Legal entity suffixes to try
    const suffixes = [
      'LLC', 'L.L.C.', 'L.L.C',
      'Inc', 'Inc.', 'Incorporated',
      'Corp', 'Corp.', 'Corporation',
      'Company', 'Co', 'Co.',
      'Ltd', 'Ltd.', 'Limited',
      'LP', 'L.P.', 'Limited Partnership',
      'LLP', 'L.L.P.',
      'Group', 'Holdings', 'Enterprises',
      'Associates', 'Partners'
    ];
    
    // Articles and prefixes
    const articles = ['The', 'A', 'An'];
    
    // Generate variations with suffixes
    [original, noPunct].forEach(baseName => {
      if (!baseName || baseName.length === 0) return;
      
      suffixes.forEach(suffix => {
        // Add suffix with comma
        variations.add(`${baseName}, ${suffix}`);
        // Add suffix with space
        variations.add(`${baseName} ${suffix}`);
        // Add suffix directly
        variations.add(`${baseName}${suffix}`);
      });
    });
    
    // Remove existing suffixes and try others
    const withoutSuffix = this.removeSuffixes(original);
    if (withoutSuffix !== original && withoutSuffix.length > 0) {
      variations.add(withoutSuffix);
      
      suffixes.forEach(suffix => {
        variations.add(`${withoutSuffix}, ${suffix}`);
        variations.add(`${withoutSuffix} ${suffix}`);
      });
    }
    
    // Add/remove articles
    articles.forEach(article => {
      if (original.startsWith(`${article} `)) {
        // Remove article
        const withoutArticle = original.substring(article.length + 1);
        variations.add(withoutArticle);
        
        // Try other articles
        articles.forEach(otherArticle => {
          if (otherArticle !== article) {
            variations.add(`${otherArticle} ${withoutArticle}`);
          }
        });
      } else {
        // Add article
        variations.add(`${article} ${original}`);
      }
    });
    
    // Common abbreviations
    const abbrevMap = {
      'International': ['Intl', "Int'l", 'Intl.'],
      'Corporation': ['Corp', 'Corp.'],
      'Company': ['Co', 'Co.'],
      'Limited': ['Ltd', 'Ltd.'],
      'Incorporated': ['Inc', 'Inc.'],
      'Associates': ['Assoc', 'Assoc.'],
      'Services': ['Svc', 'Svcs', 'Serv'],
      'Systems': ['Sys'],
      'Technologies': ['Tech', 'Technology'],
      'Management': ['Mgmt'],
      'Development': ['Dev', 'Devel'],
      'Manufacturing': ['Mfg'],
      'Enterprises': ['Ent']
    };
    
    // Generate abbreviation variations
    [original, noPunct].forEach(baseName => {
      if (!baseName) return;
      
      Object.entries(abbrevMap).forEach(([full, abbrevs]) => {
        abbrevs.forEach(abbrev => {
          // Replace full word with abbreviation
          if (baseName.includes(full)) {
            const abbreviated = baseName.replace(new RegExp(full, 'gi'), abbrev);
            variations.add(abbreviated);
          }
          
          // Replace abbreviation with full word
          if (baseName.includes(abbrev)) {
            const expanded = baseName.replace(new RegExp(abbrev, 'gi'), full);
            variations.add(expanded);
          }
        });
      });
    });
    
    // Ampersand variations
    if (original.includes('&')) {
      variations.add(original.replace(/&/g, 'and'));
      variations.add(original.replace(/&/g, ' and '));
    }
    if (original.includes(' and ')) {
      variations.add(original.replace(/ and /g, ' & '));
      variations.add(original.replace(/ and /g, '&'));
    }
    
    // Remove extra whitespace and empty strings
    return Array.from(variations)
      .map(v => v.replace(/\s+/g, ' ').trim())
      .filter(v => v.length > 0 && v !== '');
  }
  
  /**
   * Remove common legal suffixes from a company name
   * @param {string} name - Company name
   * @returns {string} - Name without suffixes
   */
  static removeSuffixes(name) {
    const suffixPatterns = [
      /,?\s+(LLC|L\.L\.C\.?|Inc\.?|Incorporated|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|LP|L\.P\.?|LLP|L\.L\.P\.?)$/i,
      /,?\s+(Group|Holdings|Enterprises|Associates|Partners)$/i,
      /^(The|A|An)\s+/i  // Remove leading articles
    ];
    
    let cleaned = name;
    suffixPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    return cleaned.trim();
  }
  
  /**
   * Sort variations by likelihood of success
   * @param {Array<string>} variations - Array of variations
   * @param {string} originalName - Original name for comparison
   * @returns {Array<string>} - Sorted variations
   */
  static sortByLikelihood(variations, originalName) {
    return variations.sort((a, b) => {
      // Prefer variations closer to original length
      const aLengthDiff = Math.abs(a.length - originalName.length);
      const bLengthDiff = Math.abs(b.length - originalName.length);
      
      if (aLengthDiff !== bLengthDiff) {
        return aLengthDiff - bLengthDiff;
      }
      
      // Prefer common suffixes
      const commonSuffixes = ['LLC', 'Inc', 'Corp', 'Company', 'Co'];
      const aHasCommon = commonSuffixes.some(suffix => a.toLowerCase().includes(suffix.toLowerCase()));
      const bHasCommon = commonSuffixes.some(suffix => b.toLowerCase().includes(suffix.toLowerCase()));
      
      if (aHasCommon && !bHasCommon) return -1;
      if (!aHasCommon && bHasCommon) return 1;
      
      // Alphabetical as tiebreaker
      return a.localeCompare(b);
    });
  }
}

module.exports = NameVariationGenerator;
```

#### Step 2.2: Update Testing Workflow with Variations

**File: `server/json/test_name_resolution.json` (replace existing)**
```json
{
  "workflow": {
    "name": "Test Name Resolution with Variations",
    "description": "Test company names with intelligent variations against Form 5500 data",
    "tasks": [
      {
        "id": 1,
        "name": "TestWithVariations",
        "outputKey": "variation_results",
        "inputKeys": ["companies"],
        "instructions": "For each company name, systematically test variations to find Form 5500 matches.\n\n**Process:**\n\n**Step 1: Test Original Name**\n- Use form5500_name_test with the exact original name first\n- Record the results\n\n**Step 2: Generate and Test Variations (if no exact match)**\nIf Step 1 doesn't find an exact match, create these systematic variations:\n\n**Legal Entity Suffixes:**\n- Add common suffixes: LLC, Inc, Corp, Corporation, Company, Co, Ltd, Limited\n- Try both with comma and space: \"Company Name, LLC\" and \"Company Name LLC\"\n- Remove existing suffixes and try others\n\n**Punctuation and Formatting:**\n- Remove apostrophes, commas, periods, hyphens: \"McDonald's\" → \"McDonalds\"\n- Fix spacing issues\n\n**Articles:**\n- Add/remove \"The\", \"A\", \"An\" at the beginning\n- \"Apple\" → \"The Apple\" and \"The Apple Company\" → \"Apple Company\"\n\n**Abbreviations:**\n- \"International\" ↔ \"Intl\" ↔ \"Int'l\"\n- \"Corporation\" ↔ \"Corp\"\n- \"Company\" ↔ \"Co\"\n- \"Services\" ↔ \"Svc\" ↔ \"Svcs\"\n- \"Technologies\" ↔ \"Tech\"\n- \"Management\" ↔ \"Mgmt\"\n\n**Special Characters:**\n- \"&\" ↔ \"and\" ↔ \" and \"\n- Handle cases like \"Johnson & Johnson\" vs \"Johnson and Johnson\"\n\n**Step 3: Test Each Variation Systematically**\n- Use form5500_name_test for each variation\n- Track which variation was tested\n- Record match count and quality for each\n- Don't stop at first match - test all reasonable variations\n\n**Step 4: Rank and Select Best Match**\nRank successful variations by:\n1. **Exact matches first** (match_type = \"exact\")\n2. **Contains matches second** (match_type = \"contains_search\" or \"contains_found\")\n3. **Higher record count** (more Form 5500 filings = more reliable)\n4. **More recent data** (latest plan_year)\n\n**Output Format:**\nReturn results in this exact JSON structure:\n\n```json\n{\n  \"variation_results\": [\n    {\n      \"original_name\": \"Company Name\",\n      \"original_search\": {\n        \"found_matches\": false,\n        \"exact_match\": false,\n        \"match_count\": 0\n      },\n      \"variations_tested\": [\n        {\n          \"variation\": \"Company Name LLC\",\n          \"result\": {\n            \"found_matches\": true,\n            \"exact_match\": false,\n            \"match_count\": 3,\n            \"best_match\": {\n              \"legal_name\": \"Company Name, LLC\",\n              \"ein\": \"12-3456789\",\n              \"location\": \"City, State ZIP\",\n              \"match_type\": \"contains_search\",\n              \"plan_year\": 2023,\n              \"record_count\": 5\n            }\n          }\n        },\n        {\n          \"variation\": \"Company Name Inc\",\n          \"result\": {\n            \"found_matches\": false,\n            \"exact_match\": false,\n            \"match_count\": 0\n          }\n        }\n      ],\n      \"best_result\": {\n        \"variation_used\": \"Company Name LLC\",\n        \"legal_name\": \"Company Name, LLC\",\n        \"ein\": \"12-3456789\",\n        \"location\": \"City, State ZIP\",\n        \"confidence\": \"medium\",\n        \"confidence_score\": 75,\n        \"reason\": \"Contains match with multiple Form 5500 records\"\n      },\n      \"search_summary\": {\n        \"total_variations_tested\": 8,\n        \"successful_variations\": 2,\n        \"best_match_type\": \"contains_search\"\n      }\n    }\n  ],\n  \"overall_summary\": {\n    \"companies_processed\": 3,\n    \"original_matches\": 1,\n    \"variation_matches\": 2,\n    \"no_matches\": 0,\n    \"improvement_rate\": \"66%\"\n  }\n}\n```\n\n**Important Guidelines:**\n- Test variations systematically - don't randomly guess\n- Document every variation tried, even if it fails\n- Don't stop at the first successful variation - find the best one\n- Assign confidence based on match quality and data completeness\n- Use form5500_name_test tool multiple times as needed\n\n**Confidence Scoring:**\n- **High (80-100%)**: Exact match with multiple records\n- **Medium (60-79%)**: Contains match with good record count\n- **Low (40-59%)**: Partial match or limited records\n- **Failed (0-39%)**: No reasonable matches found"
      }
    ]
  }
}
```

#### Step 2.3: Add Variation Testing Route (Optional)

**File: Add to `server/routes/workflow.js`**
```javascript
// Add this route for testing name variations
router.post('/test/name-variations', async (req, res) => {
  try {
    const { companyName } = req.body;
    
    if (!companyName) {
      return res.status(400).json({
        success: false,
        error: 'Company name is required'
      });
    }

    const NameVariationGenerator = require('../utils/NameVariationGenerator');
    const variations = NameVariationGenerator.generateVariations(companyName);
    const sortedVariations = NameVariationGenerator.sortByLikelihood(variations, companyName);

    res.json({
      success: true,
      original_name: companyName,
      total_variations: variations.length,
      variations: sortedVariations
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Testing Stage 2

#### Test 1: Variation Generation
```bash
# Test variation generation (if route implemented)
curl -X POST http://localhost:3000/api/workflow/test/name-variations \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "McDonald'\''s"
  }'
```

#### Test 2: Companies That Need Variations
```bash
# Test with companies known to need variations
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "test_name_resolution",
    "input": {
      "companies": ["McDonald'\''s", "Walmart", "Apple Computer", "IBM"]
    }
  }'
```

#### Test 3: Edge Cases and Special Characters
```bash
# Test challenging names with punctuation and special characters
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "test_name_resolution",
    "input": {
      "companies": ["AT&T", "Johnson & Johnson", "Procter & Gamble", "Ben & Jerry'\''s"]
    }
  }'
```

#### Test 4: Abbreviation Challenges
```bash
# Test companies with common abbreviation issues
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "test_name_resolution",
    "input": {
      "companies": ["International Business Machines", "General Electric Co", "Microsoft Corporation"]
    }
  }'
```

### Success Criteria for Stage 2
- [ ] NameVariationGenerator creates comprehensive variations
- [ ] Workflow systematically tests multiple variations per company
- [ ] Finds matches for companies that failed exact name search in Stage 1
- [ ] Properly ranks results by match quality and confidence
- [ ] Documents all variations attempted (successful and failed)
- [ ] Shows clear improvement in match rate compared to Stage 1
- [ ] Confidence scoring reflects match quality accurately

### Expected Improvements in Stage 2
- **Match Rate**: Should increase from ~30% (exact matches only) to ~70-80%
- **Match Quality**: Better legal entity names with EINs and locations
- **Systematic Approach**: Clear documentation of search strategy
- **Ranking**: Best matches selected based on data quality

---

## Stage 3: External Research & Verification

### Goal
Add Perplexity research and location-based verification for companies that remain unmatched, plus verification of potential matches to ensure accuracy.

### Implementation Steps

#### Step 3.1: Enhance Perplexity MCP Server

**File: `server/mcp/perplexity/perplexity-search.py` (add new tool)**

Add this tool definition to your existing Perplexity server:

```python
# Add to the tools list in perplexity-search.py
{
    "name": "research_legal_entity",
    "description": "Research a company's official legal entity name, headquarters location, and business details",
    "inputSchema": {
        "type": "object",
        "properties": {
            "companyName": {
                "type": "string",
                "description": "Company name to research"
            },
            "additionalContext": {
                "type": "string", 
                "description": "Additional context like PE firm name, industry, or known details"
            },
            "focusArea": {
                "type": "string",
                "description": "What to focus on: 'legal_name', 'location', 'verification', or 'comprehensive'",
                "default": "comprehensive"
            }
        },
        "required": ["companyName"]
    }
}

# Add this handler function
async def research_legal_entity(company_name, additional_context="", focus_area="comprehensive"):
    """Research a company's legal entity information using Perplexity search"""
    
    # Build context string
    context_str = f" (portfolio company of {additional_context})" if additional_context else ""
    
    # Customize query based on focus area
    if focus_area == "legal_name":
        query = f"""What is the exact official legal business name for {company_name}{context_str}? 
        
        Please provide:
        1. The precise legal entity name as it would appear on SEC filings or Department of Labor Form 5500 documents
        2. Any alternative business names or "doing business as" (DBA) names
        3. The correct legal entity type (LLC, Inc, Corp, etc.)
        
        Focus on the official name used in government filings."""
        
    elif focus_area == "location":
        query = f"""What is the headquarters address for {company_name}{context_str}?
        
        Please provide:
        1. Complete headquarters address including street, city, state, and ZIP code
        2. Any other major office locations
        3. State of incorporation if different from headquarters
        
        Be specific about the ZIP code."""
        
    elif focus_area == "verification":
        query = f"""Help me verify if this is the correct company: {company_name}{context_str}
        
        Please provide:
        1. Industry or business type
        2. Approximate company size or employee count
        3. Key business activities or products/services
        4. Any parent company or subsidiary relationships
        5. Recent news or business developments
        
        This is for verification purposes to ensure we have the right company."""
        
    else:  # comprehensive
        query = f"""Please research {company_name}{context_str} and provide comprehensive business information:
        
        1. **Official Legal Name**: Exact legal entity name as it would appear on Department of Labor filings
        2. **Headquarters Location**: Complete address including city, state, and ZIP code
        3. **Business Details**: Industry, main products/services, approximate size
        4. **Legal Structure**: Corporation, LLC, partnership, etc.
        5. **Alternative Names**: Any DBA names, trade names, or former names
        6. **Parent/Subsidiary Info**: Any parent company or major subsidiary relationships
        
        Focus on information that would help match this company to Department of Labor Form 5500 employee benefit plan filings."""
    
    try:
        response = await client.chat.completions.create(
            model="llama-3.1-sonar-small-128k-online",
            messages=[{"role": "user", "content": query}]
        )
        
        # Parse the response to extract structured information
        response_text = response.choices[0].message.content
        
        # Simple parsing - could be enhanced with more sophisticated extraction
        parsed_info = parse_company_research(response_text, focus_area)
        
        return {
            "success": True,
            "company_name": company_name,
            "focus_area": focus_area,
            "raw_research": response_text,
            "parsed_info": parsed_info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "company_name": company_name,
            "focus_area": focus_area
        }

def parse_company_research(response_text, focus_area):
    """Parse the Perplexity response to extract structured information"""
    # This is a simple implementation - could be enhanced with more sophisticated parsing
    
    info = {
        "legal_names": [],
        "locations": [],
        "business_type": None,
        "industry": None,
        "alternative_names": []
    }
    
    lines = response_text.split('\n')
    current_section = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Look for legal names
        if any(keyword in line.lower() for keyword in ['legal name', 'official name', 'incorporated as']):
            # Extract potential legal names from this line
            # Simple extraction - could be enhanced
            info["legal_names"].append(line)
        
        # Look for locations
        if any(keyword in line.lower() for keyword in ['headquarters', 'address', 'located', 'zip']):
            info["locations"].append(line)
        
        # Look for business type
        if any(keyword in line.lower() for keyword in ['llc', 'inc', 'corp', 'corporation', 'company']):
            if 'business_type' not in info or not info['business_type']:
                info["business_type"] = line
        
        # Look for industry
        if any(keyword in line.lower() for keyword in ['industry', 'business', 'services', 'products']):
            if 'industry' not in info or not info['industry']:
                info["industry"] = line
    
    return info
```

#### Step 3.2: Create Location Verification Service

**File: `server/data-extraction/LocationVerificationService.js`**
```javascript
class LocationVerificationService {
  /**
   * Compare researched location with Form 5500 location data
   * @param {string} researchedLocation - Location from Perplexity research
   * @param {string} form5500Location - Location from Form 5500 data
   * @returns {Object} Comparison result with match confidence
   */
  static compareLocations(researchedLocation, form5500Location) {
    if (!researchedLocation || !form5500Location) {
      return { 
        match: false, 
        confidence: 0, 
        reason: "Missing location data",
        details: { researched: researchedLocation, form5500: form5500Location }
      };
    }
    
    const research = this.parseLocation(researchedLocation);
    const form5500 = this.parseLocation(form5500Location);
    
    // Exact ZIP match is highest confidence
    if (research.zip && form5500.zip) {
      if (research.zip === form5500.zip) {
        return { 
          match: true, 
          confidence: 95, 
          reason: "ZIP code exact match",
          details: { research_zip: research.zip, form5500_zip: form5500.zip }
        };
      } else {
        // Different ZIP codes is a strong negative signal
        return { 
          match: false, 
          confidence: 10, 
          reason: "ZIP code mismatch",
          details: { research_zip: research.zip, form5500_zip: form5500.zip }
        };
      }
    }
    
    // City and state comparison
    if (research.city && research.state && form5500.city && form5500.state) {
      const cityMatch = this.cityMatches(research.city, form5500.city);
      const stateMatch = research.state.toLowerCase() === form5500.state.toLowerCase();
      
      if (cityMatch && stateMatch) {
        return { 
          match: true, 
          confidence: 80, 
          reason: "City and state match",
          details: { 
            research_city: research.city, 
            form5500_city: form5500.city,
            research_state: research.state,
            form5500_state: form5500.state
          }
        };
      } else if (stateMatch) {
        return { 
          match: true, 
          confidence: 60, 
          reason: "State match only",
          details: { 
            research_state: research.state,
            form5500_state: form5500.state,
            city_mismatch: `${research.city} vs ${form5500.city}`
          }
        };
      } else if (cityMatch) {
        return { 
          match: true, 
          confidence: 40, 
          reason: "City match, state unknown or mismatch",
          details: { 
            research_city: research.city,
            form5500_city: form5500.city
          }
        };
      }
    }
    
    // State only comparison
    if (research.state && form5500.state) {
      const stateMatch = research.state.toLowerCase() === form5500.state.toLowerCase();
      if (stateMatch) {
        return { 
          match: true, 
          confidence: 50, 
          reason: "State match only, city data incomplete",
          details: { state: research.state }
        };
      }
    }
    
    return { 
      match: false, 
      confidence: 0, 
      reason: "No location match found",
      details: { research, form5500 }
    };
  }
  
  /**
   * Parse location string into components
   * @param {string} locationString - Raw location string
   * @returns {Object} Parsed location components
   */
  static parseLocation(locationString) {
    if (!locationString || typeof locationString !== 'string') {
      return { city: null, state: null, zip: null };
    }
    
    // Common location patterns:
    // "City, State ZIP"
    // "City, ST 12345"
    // "City State"
    // "City, State"
    
    const zipRegex = /\b(\d{5}(-\d{4})?)\b/;
    const stateRegex = /\b([A-Z]{2})\b/;  // 2-letter state code
    const stateNameRegex = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i;
    
    const zipMatch = locationString.match(zipRegex);
    const stateMatch = locationString.match(stateRegex);
    const stateNameMatch = locationString.match(stateNameRegex);
    
    let zip = zipMatch ? zipMatch[1] : null;
    let state = stateMatch ? stateMatch[1] : null;
    
    // Convert state name to abbreviation if found
    if (!state && stateNameMatch) {
      state = this.stateNameToAbbrev(stateNameMatch[1]);
    }
    
    // Extract city (everything before state/ZIP)
    let city = locationString;
    
    // Remove ZIP code
    if (zipMatch) {
      city = city.replace(zipMatch[0], '').trim();
    }
    
    // Remove state
    if (stateMatch) {
      city = city.replace(stateMatch[0], '').trim();
    } else if (stateNameMatch) {
      city = city.replace(stateNameMatch[0], '').trim();
    }
    
    // Clean up city name
    city = city.replace(/,$/, '').trim(); // Remove trailing comma
    city = city || null;
    
    return {
      city: city,
      state: state,
      zip: zip,
      original: locationString
    };
  }
  
  /**
   * Check if two city names match (accounting for common variations)
   * @param {string} city1 
   * @param {string} city2 
   * @returns {boolean}
   */
  static cityMatches(city1, city2) {
    if (!city1 || !city2) return false;
    
    const clean1 = city1.toLowerCase().trim();
    const clean2 = city2.toLowerCase().trim();
    
    // Exact match
    if (clean1 === clean2) return true;
    
    // Remove common prefixes/suffixes
    const cleaners = [
      /^(saint|st\.?)\s+/i,  // Saint/St.
      /\s+(city|town)$/i     // City/Town suffix
    ];
    
    let cleaned1 = clean1;
    let cleaned2 = clean2;
    
    cleaners.forEach(regex => {
      cleaned1 = cleaned1.replace(regex, '');
      cleaned2 = cleaned2.replace(regex, '');
    });
    
    return cleaned1 === cleaned2;
  }
  
  /**
   * Convert state name to abbreviation
   * @param {string} stateName 
   * @returns {string|null}
   */
  static stateNameToAbbrev(stateName) {
    const stateMap = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
      'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY'
    };
    
    return stateMap[stateName.toLowerCase()] || null;
  }
  
  /**
   * Calculate overall verification confidence based on multiple factors
   * @param {Object} nameMatch - Name match results from Form 5500 search
   * @param {Object} locationMatch - Location comparison results
   * @param {Object} additionalFactors - Other verification factors
   * @returns {Object} Overall confidence assessment
   */
  static calculateOverallConfidence(nameMatch, locationMatch, additionalFactors = {}) {
    let confidence = 0;
    let reasons = [];
    
    // Name match component (0-60 points)
    if (nameMatch.exactMatch) {
      confidence += 60;
      reasons.push("Exact name match");
    } else if (nameMatch.matchType === 'contains_search') {
      confidence += 40;
      reasons.push("Company name contained in Form 5500 name");
    } else if (nameMatch.matchType === 'contains_found') {
      confidence += 35;
      reasons.push("Form 5500 name contained in company name");
    } else if (nameMatch.matchType === 'partial') {
      confidence += 20;
      reasons.push("Partial name match");
    }
    
    // Location component (0-30 points)
    if (locationMatch.match) {
      confidence += Math.min(30, locationMatch.confidence * 0.3);
      reasons.push(locationMatch.reason);
    } else {
      confidence -= 10; // Penalty for location mismatch
      reasons.push("Location verification failed");
    }
    
    // Record quality component (0-10 points)
    if (nameMatch.recordCount > 5) {
      confidence += 10;
      reasons.push("Multiple Form 5500 records");
    } else if (nameMatch.recordCount > 0) {
      confidence += 5;
      reasons.push("Form 5500 records found");
    }
    
    // Cap at 100
    confidence = Math.min(100, Math.max(0, confidence));
    
    // Determine confidence level
    let level;
    if (confidence >= 85) level = 'HIGH';
    else if (confidence >= 65) level = 'MEDIUM';  
    else if (confidence >= 40) level = 'LOW';
    else level = 'FAILED';
    
    return {
      confidence_score: Math.round(confidence),
      confidence_level: level,
      reasons: reasons,
      recommendation: confidence >= 65 ? 'ACCEPT' : confidence >= 40 ? 'MANUAL_REVIEW' : 'REJECT'
    };
  }
}

module.exports = LocationVerificationService;
```

#### Step 3.3: Create Complete Resolution Workflow

**File: `server/json/resolve_legal_entities.json`**
```json
{
  "workflow": {
    "name": "Legal Entity Resolution",
    "description": "Resolve portfolio company names with external research and verification",
    "tasks": [
      {
        "id": 1,
        "name": "ResolveWithVerification",
        "outputKey": "verified_entities",
        "inputKeys": ["companies", "firm_name"],
        "instructions": "Resolve each portfolio company to its legal entity name using a comprehensive three-phase approach:\n\n## PHASE 1: DATABASE TESTING WITH VARIATIONS\n\n**Step 1A: Test Original Name**\n- Use form5500_name_test with the exact original company name\n- Record results: match count, exact match status, best matches\n\n**Step 1B: Generate and Test Variations (if no exact match)**\nIf Step 1A doesn't find an exact match, systematically test variations:\n\n- **Legal Suffixes**: LLC, Inc, Corp, Corporation, Company, Co, Ltd, Limited\n- **Punctuation**: Remove/modify apostrophes, commas, periods, hyphens  \n- **Articles**: Add/remove \"The\", \"A\", \"An\"\n- **Abbreviations**: International↔Intl, Corporation↔Corp, Company↔Co, etc.\n- **Special Characters**: &↔and, handle spacing\n\nFor each variation:\n1. Use form5500_name_test\n2. Record results and match quality\n3. Keep track of the best matches found\n\n**Step 1C: Evaluate Database Results**\n- If you found exact matches: move to Phase 3 (Verification)\n- If you found good contains/partial matches: move to Phase 3 (Verification)\n- If no reasonable matches found: proceed to Phase 2 (External Research)\n\n## PHASE 2: EXTERNAL RESEARCH (for companies with poor database matches)\n\n**Step 2A: Research Official Legal Name**\n- Use research_legal_entity tool with the original company name\n- Include firm_name in additionalContext: \"portfolio company of [firm_name]\"\n- Focus on finding the official legal entity name\n\n**Step 2B: Test Researched Names**\n- Extract potential legal names from the research results\n- Use form5500_name_test on each researched legal name\n- Also test variations of the researched names\n\n**Step 2C: Research Location if Needed**\n- If you found potential matches, use research_legal_entity again with focusArea: \"location\"\n- Get headquarters location for verification\n\n## PHASE 3: VERIFICATION AND CONFIDENCE SCORING\n\n**Step 3A: Location Verification**\nFor each potential match with location data:\n- Compare researched company location with Form 5500 sponsor location\n- Look for ZIP code matches (highest confidence)\n- Check city and state matches\n- Account for common location variations\n\n**Step 3B: Business Verification** \nIf match confidence is borderline:\n- Use research_legal_entity with focusArea: \"verification\"\n- Check if industry/business type makes sense\n- Look for parent company relationships that might explain name differences\n\n**Step 3C: Calculate Final Confidence**\nAssign confidence scores based on:\n- **Name Match Quality**: Exact (60pts) > Contains (40pts) > Partial (20pts)\n- **Location Verification**: ZIP match (+30pts), City/State match (+20pts), State only (+10pts), Mismatch (-10pts)\n- **Data Quality**: Multiple records (+10pts), Recent data (+5pts)\n\n**Confidence Levels:**\n- **HIGH (85-100%)**: Strong evidence this is the correct match\n- **MEDIUM (65-84%)**: Likely correct but some uncertainty\n- **LOW (40-64%)**: Possible match requiring manual review\n- **FAILED (<40%)**: No reliable match found\n\n## OUTPUT FORMAT\n\nReturn results in this exact JSON structure:\n\n```json\n{\n  \"firm_name\": \"PE Firm Name\",\n  \"processing_summary\": {\n    \"total_companies\": 5,\n    \"database_only_resolved\": 3,\n    \"external_research_used\": 2,\n    \"high_confidence\": 3,\n    \"medium_confidence\": 1,\n    \"low_confidence\": 1,\n    \"failed\": 0\n  },\n  \"verified_entities\": [\n    {\n      \"original_name\": \"Company Name from Website\",\n      \"status\": \"RESOLVED\",\n      \"resolved_legal_name\": \"Legal Name for Form 5500 Search\",\n      \"confidence_score\": 92,\n      \"confidence_level\": \"HIGH\",\n      \"recommendation\": \"ACCEPT\",\n      \"resolution_method\": \"database_variation\",\n      \"verification_data\": {\n        \"ein\": \"12-3456789\",\n        \"form5500_location\": \"City, State ZIP\",\n        \"location_verified\": true,\n        \"location_confidence\": 95,\n        \"form5500_records\": 5,\n        \"latest_plan_year\": 2023,\n        \"match_type\": \"exact\"\n      },\n      \"search_history\": [\n        {\n          \"phase\": \"database_original\",\n          \"search_term\": \"Original Company Name\", \n          \"result\": \"no_exact_match\",\n          \"matches_found\": 0\n        },\n        {\n          \"phase\": \"database_variation\",\n          \"search_term\": \"Company Name LLC\",\n          \"result\": \"exact_match\",\n          \"matches_found\": 5\n        },\n        {\n          \"phase\": \"verification\",\n          \"action\": \"location_check\",\n          \"result\": \"zip_code_match\"\n        }\n      ],\n      \"confidence_breakdown\": {\n        \"name_match_score\": 60,\n        \"location_score\": 25,\n        \"data_quality_score\": 7,\n        \"total_score\": 92\n      }\n    }\n  ],\n  \"manual_review_needed\": [\n    {\n      \"original_name\": \"Problematic Company\",\n      \"status\": \"NEEDS_REVIEW\",\n      \"confidence_score\": 45,\n      \"confidence_level\": \"LOW\",\n      \"issue\": \"Multiple potential matches with different locations\",\n      \"potential_matches\": [\n        {\n          \"legal_name\": \"Problematic Company LLC\",\n          \"location\": \"City A, State ZIP1\",\n          \"confidence\": 45\n        },\n        {\n          \"legal_name\": \"Problematic Co Inc\",\n          \"location\": \"City B, State ZIP2\", \n          \"confidence\": 42\n        }\n      ],\n      \"recommendation\": \"Manual verification needed - check company website or SEC filings\"\n    }\n  ],\n  \"failed_resolutions\": [\n    {\n      \"original_name\": \"Impossible Company\",\n      \"status\": \"FAILED\",\n      \"attempts_made\": 15,\n      \"last_error\": \"No reasonable matches found in Form 5500 data\",\n      \"suggestion\": \"Company may not have employee benefit plans or may file under parent company name\"\n    }\n  ]\n}\n```\n\n## IMPORTANT GUIDELINES\n\n1. **Be Systematic**: Work through phases methodically\n2. **Use Multiple Tools**: Don't rely on just one search - use form5500_name_test multiple times and research_legal_entity when needed\n3. **Document Everything**: Record every search attempt and decision\n4. **Verify Strong Matches**: Even high-confidence matches should be location-verified when possible\n5. **Flag Uncertain Cases**: Better to mark for manual review than guess wrong\n6. **Consider Parent Companies**: Some subsidiaries file under parent company names\n\n**Process each company thoroughly. This is a complex resolution process that may require 5-15 tool calls per company.**"
      }
    ]
  }
}
```

#### Step 3.4: Add Testing and Verification Routes

**File: Add to `server/routes/workflow.js`**
```javascript
// Add comprehensive testing routes for Stage 3

// Test location parsing and comparison
router.post('/test/location-verification', async (req, res) => {
  try {
    const { researchedLocation, form5500Location } = req.body;
    
    const LocationVerificationService = require('../data-extraction/LocationVerificationService');
    const result = LocationVerificationService.compareLocations(researchedLocation, form5500Location);
    
    res.json({
      success: true,
      comparison: result,
      parsed_locations: {
        researched: LocationVerificationService.parseLocation(researchedLocation),
        form5500: LocationVerificationService.parseLocation(form5500Location)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test complete resolution process for a single company
router.post('/test/single-resolution', async (req, res) => {
  try {
    const { companyName, firmName } = req.body;
    
    const { run } = require('../Manager');
    const result = await run('resolve_legal_entities.json', {
      companies: [companyName],
      firm_name: firmName || 'Test Firm'
    });
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get resolution statistics
router.get('/test/resolution-stats', async (req, res) => {
  try {
    const DatabaseManager = require('../data-extraction/DatabaseManager');
    const db = DatabaseManager.getInstance();
    
    // Get recent resolution results
    const recentResults = await db.query(`
      SELECT 
        workflow_name,
        results,
        created_at
      FROM workflow_executions 
      WHERE workflow_name LIKE '%legal_entity%' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    // Calculate success rates
    let stats = {
      total_resolutions: 0,
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      failed: 0
    };
    
    recentResults.rows.forEach(row => {
      if (row.results && row.results.verified_entities) {
        stats.total_resolutions += row.results.verified_entities.length;
        
        row.results.verified_entities.forEach(entity => {
          if (entity.confidence_level === 'HIGH') stats.high_confidence++;
          else if (entity.confidence_level === 'MEDIUM') stats.medium_confidence++;
          else if (entity.confidence_level === 'LOW') stats.low_confidence++;
          else stats.failed++;
        });
      }
    });
    
    res.json({
      success: true,
      stats: stats,
      success_rate: stats.total_resolutions > 0 ? 
        Math.round((stats.high_confidence + stats.medium_confidence) / stats.total_resolutions * 100) : 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Testing Stage 3

#### Test 1: Location Verification
```bash
# Test location parsing and comparison
curl -X POST http://localhost:3000/api/workflow/test/location-verification \
  -H "Content-Type: application/json" \
  -d '{
    "researchedLocation": "123 Main Street, New York, NY 10001",
    "form5500Location": "New York, NY 10001"
  }'
```

#### Test 2: Single Company Resolution
```bash
# Test complete resolution process for one challenging company
curl -X POST http://localhost:3000/api/workflow/test/single-resolution \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Porky Pig'\''s Beef Ribs",
    "firmName": "Test Capital Partners"
  }'
```

#### Test 3: Batch Resolution with Mixed Difficulty
```bash
# Test with a mix of easy and challenging companies
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "resolve_legal_entities",
    "input": {
      "companies": [
        "McDonald'\''s Corporation", 
        "Some Obscure Regional LLC", 
        "Tesla Motors",
        "Porky Pig'\''s Beef Ribs",
        "ABC Manufacturing Services"
      ],
      "firm_name": "Test Capital Partners"
    }
  }'
```

#### Test 4: Edge Cases and Parent Companies
```bash
# Test companies that might file under parent company names
curl -X POST http://localhost:3000/api/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowname": "resolve_legal_entities",
    "input": {
      "companies": [
        "Instagram", 
        "WhatsApp", 
        "YouTube",
        "Subsidiary Corp"
      ],
      "firm_name": "Technology Ventures"
    }
  }'
```

#### Test 5: Performance and Statistics
```bash
# Check resolution statistics
curl http://localhost:3000/api/workflow/test/resolution-stats
```

### Success Criteria for Stage 3
- [ ] Successfully resolves companies that failed in Stages 1-2 using external research
- [ ] Accurately verifies potential matches using location data
- [ ] Provides detailed confidence scoring with breakdown
- [ ] Identifies companies requiring manual review vs automatic rejection
- [ ] Shows dramatic improvement in resolution rate (target: 85-90% success)
- [ ] Integrates cleanly with existing workflow pipeline
- [ ] Handles edge cases like parent company relationships
- [ ] Performance remains reasonable (< 2 minutes per company)

### Expected Final Results for Stage 3
- **Overall Resolution Rate**: 85-90% (vs ~30% from exact matches only)
- **High Confidence Matches**: 60-70% of all companies
- **Medium Confidence Matches**: 15-20% of all companies  
- **Manual Review Needed**: 5-10% of all companies
- **Complete Failures**: <5% of all companies

### Integration with Main Workflow

Once Stage 3 is complete and tested, integrate with the main PE research workflow by updating your pipeline configuration:

**File: Update workflow pipeline configuration**
```json
{
  "workflow": {
    "name": "PE Research Pipeline with Legal Entity Resolution",
    "stages": [
      {
        "name": "portfolio_research",
        "workflow_file": "pe_firm_research.json"
      },
      {
        "name": "legal_entity_resolution", 
        "workflow_file": "resolve_legal_entities.json",
        "input_mapping": { 
          "companies": "portfolio_research.portfolio_companies",
          "firm_name": "portfolio_research.firm_name"
        }
      },
      {
        "name": "form5500_extraction",
        "workflow_file": "extract_form5500_data.json", 
        "input_mapping": { 
          "resolved_companies": "legal_entity_resolution.verified_entities" 
        }
      }
    ]
  }
}
```

This three-stage implementation provides a robust, AI-powered solution to the legal entity name resolution challenge, dramatically improving the success rate of Form 5500 data extraction while maintaining verification safeguards.