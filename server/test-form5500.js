const Form5500MCPTestServer = require('./mcp/form5500/test-server.js');

async function test() {
  console.log('🧪 Testing Form 5500 MCP Server directly...\n');
  
  const server = new Form5500MCPTestServer();
  
  // Test multiple company names
  const testCompanies = [
    "Test Company",
    "Random Corp", 
    "Another Test",
    "Microsoft",
    "Apple Inc"
  ];
  
  for (const companyName of testCompanies) {
    try {
      console.log(`Testing: "${companyName}"`);
      const result = await server.handleForm5500NameTest({
        companyName: companyName
      });
      
      const parsedResult = JSON.parse(result.content[0].text);
      console.log(`✓ Success: Found ${parsedResult.resultCount} results`);
      console.log(`  Legal Name: ${parsedResult.results[0].legalName}`);
      console.log(`  EIN: ${parsedResult.results[0].ein}`);
      console.log(`  Location: ${parsedResult.results[0].location}`);
      console.log('');
      
    } catch (error) {
      console.log(`✗ Error testing "${companyName}":`, error.message);
      console.log('');
    }
  }
  
  console.log('🎉 Form 5500 tool test completed!');
}

test().catch(console.error);