const Form5500MCPServer = require('./mcp/form5500/index.js');

async function test() {
  console.log('🧪 Testing Form 5500 MCP Server with REAL database...\n');
  
  const server = new Form5500MCPServer();
  
  // Initialize the server (this connects to the database)
  try {
    await server.initialize();
    console.log('✓ Server initialized successfully\n');
  } catch (error) {
    console.log('✗ Server initialization failed:', error.message);
    return;
  }
  
  // Test multiple company names from the sample data we saw
  const testCompanies = [
    "SUSTAINING GRACE INTERPRISES INC.",  // Exact match from sample
    "THE DENVER CENTER FOR THE PERFORMING ARTS", // Another exact match
    "CAPITOL GROUP, INC", // Third exact match
    "Microsoft", // Common name that might have variations
    "Apple", // Another common name
    "Test Company" // This should not be found
  ];
  
  for (const companyName of testCompanies) {
    try {
      console.log(`Testing: "${companyName}"`);
      const result = await server.handleForm5500NameTest({
        companyName: companyName
      });
      
      const parsedResult = JSON.parse(result.content[0].text);
      
      if (parsedResult.success && parsedResult.resultCount > 0) {
        console.log(`✓ Found ${parsedResult.resultCount} results`);
        parsedResult.results.forEach((match, index) => {
          console.log(`  Match ${index + 1}:`);
          console.log(`    Legal Name: ${match.legalName}`);
          console.log(`    EIN: ${match.ein}`);
          console.log(`    Location: ${match.location}`);
          console.log(`    Match Type: ${match.matchType}`);
          console.log(`    Records: ${match.recordCount}`);
          console.log(`    Year: ${match.planYear}`);
        });
      } else {
        console.log(`✗ No matches found`);
      }
      console.log('');
      
    } catch (error) {
      console.log(`✗ Error testing "${companyName}":`, error.message);
      console.log('');
    }
  }
  
  console.log('🎉 Real database test completed!');
}

test().catch(console.error);