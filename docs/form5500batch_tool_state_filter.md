# Form 5500 Batch Tool State Filter Implementation

## Overview
This document outlines the implementation of a state filter for the `form5500_batch_name_test` MCP tool to reduce token usage when searching for companies. The state filter allows filtering results by a 2-letter state code (e.g., "CA", "NY"), which can reduce large result sets from thousands of results to dozens.

## Problem Statement
When searching for broad terms like "EP", the tool returns ~3,000 results, which is expensive in terms of token usage. By adding a state filter, we can reduce this to ~50-60 results for states like California, achieving a 98% reduction in token usage.

## Solution

### 1. Update Tool Schema

Modify the `inputSchema` in the `setupToolHandlers()` method of `/server/mcp/form5500/index.js`:

```javascript
{
  name: "form5500_batch_name_test",
  description: "Performs a search in the database for companies with the search term in their name. Returns full legal entity name, city, and state. The database is the Department of Labor's Form 5500 datasets for years 2022, 2023, and 2024. This tool is only used to check for companies in the database, not extracting information about them. Can search for single companies or multiple companies in one call. More efficient than individual calls for multiple companies. WARNING: Short/generic search terms (like 'EP', 'Inc', 'Co') may return thousands of results and consume many tokens. Use the 'state' parameter to filter by location when searching with broad terms.",
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
      },
      state: {
        type: "string",
        description: "Filter results by state (2-letter state code, e.g., 'CA', 'NY')",
        pattern: "^[A-Z]{2}$"
      }
    },
    required: ["companyNames"]
  }
}
```

### 2. Update Handler Method

Modify `handleForm5500BatchNameTest` (around line 197) to accept and validate the state parameter:

```javascript
async handleForm5500BatchNameTest(args) {
  const { companyNames, limit = 10, exactOnly = false, state = null } = args;
  
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

  // Validate state parameter if provided
  if (state && !/^[A-Z]{2}$/.test(state)) {
    throw new Error('State must be a 2-letter uppercase code (e.g., "CA", "NY")');
  }

  const results = await this.batchTestCompanyNames(companyNames, { limit, exactOnly, state });
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(results)
    }]
  };
}
```

### 3. Update Database Query Method

Modify the `batchTestCompanyNames` method (around line 223) to include state filtering in the WHERE clause:

```javascript
async batchTestCompanyNames(companyNames, options = {}) {
  const { limit = 10, exactOnly = false, state = null } = options;
  
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
          state: state || 'ST'
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
    
    // Add state filter if provided
    if (state) {
      whereClause += ` AND UPPER(spons_dfe_mail_us_state) = UPPER($${paramIndex + 1})`;
      params.push(state);
      paramIndex += 1;
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
  
  // Rest of the method remains unchanged...
  // (existing result processing code)
}
```

## Usage Examples

### Without State Filter (Original)
```javascript
{
  "companyNames": ["EP"],
  "exactOnly": false,
  "limit": 10
}
```
Results: ~3,000 companies nationwide

### With State Filter (New)
```javascript
{
  "companyNames": ["EP"],
  "exactOnly": false,
  "limit": 10,
  "state": "CA"
}
```
Results: ~50-60 companies in California only

### Multiple Companies with State Filter
```javascript
{
  "companyNames": ["Entertainment", "GEP", "Mythical"],
  "exactOnly": false,
  "state": "CA"
}
```

## Benefits

1. **Token Reduction**: Reduces result sets by ~98% for broad searches
2. **Cost Efficiency**: Significantly lower API token costs
3. **Targeted Results**: More relevant results for location-specific searches
4. **Backward Compatible**: Existing calls without state parameter continue to work
5. **Flexible**: Can be combined with existing `exactOnly` and `limit` parameters

## Implementation Notes

- The state parameter is optional and defaults to `null` (no filtering)
- State validation ensures 2-letter uppercase format (e.g., "CA", "NY")
- Case-insensitive state matching in the database query using `UPPER()`
- Parameter indexing is carefully managed to avoid SQL injection
- Mock data handling includes state parameter for testing

## Testing

Test the implementation with:
1. Broad searches with and without state filter
2. Invalid state codes (should throw validation error)
3. Multiple company searches with state filtering
4. Edge cases with empty results

## File Location
Implementation should be made in: `/server/mcp/form5500/index.js`