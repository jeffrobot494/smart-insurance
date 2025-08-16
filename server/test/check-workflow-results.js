#!/usr/bin/env node

/**
 * Test script to check workflow results by execution ID
 * Usage: node server/test/check-workflow-results.js <execution_id> [port]
 * Example: node server/test/check-workflow-results.js 2
 * Example: node server/test/check-workflow-results.js 2 3001
 */

const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Error: Workflow execution ID is required');
  console.error('Usage: node server/test/check-workflow-results.js <execution_id> [port]');
  console.error('Example: node server/test/check-workflow-results.js 2');
  process.exit(1);
}

const executionId = args[0];
const port = args[1] || 3000;
const url = `http://localhost:${port}/api/workflow/${executionId}/results`;

console.log(`🔍 Checking workflow results for execution ID: ${executionId}`);
console.log(`📡 URL: ${url}\n`);

// Make HTTP request
const req = http.get(url, (res) => {
  let data = '';
  
  // Collect response data
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  // Process complete response
  res.on('end', () => {
    console.log(`📊 Response Status: ${res.statusCode} ${res.statusMessage}`);
    console.log(`📋 Content-Type: ${res.headers['content-type']}\n`);
    
    if (res.statusCode === 200) {
      try {
        // Parse and format JSON response
        const jsonData = JSON.parse(data);
        
        console.log('✅ WORKFLOW RESULTS:');
        console.log('='.repeat(80));
        console.log(JSON.stringify(jsonData, null, 2));
        console.log('='.repeat(80));
        
        // Print summary if available
        if (jsonData.summary) {
          console.log('\n📊 SUMMARY:');
          console.log('-'.repeat(40));
          
          if (typeof jsonData.summary === 'string') {
            console.log(jsonData.summary);
          } else {
            console.log(JSON.stringify(jsonData.summary, null, 2));
          }
        }
        
        // Print basic stats
        if (jsonData.results) {
          console.log(`\n📈 QUICK STATS:`);
          console.log(`   Total Results: ${Array.isArray(jsonData.results) ? jsonData.results.length : 'N/A'}`);
          
          if (Array.isArray(jsonData.results)) {
            const successCount = jsonData.results.filter(r => r.success !== false).length;
            console.log(`   Successful: ${successCount}`);
            console.log(`   Failed: ${jsonData.results.length - successCount}`);
          }
        }
        
        // Print data by year statistics
        if (jsonData.companies && Array.isArray(jsonData.companies)) {
          console.log(`\n📊 DATA BY YEAR:`);
          const yearStats = {};
          
          jsonData.companies.forEach(company => {
            // Check Form 5500 data years
            if (company.form5500 && company.form5500.years) {
              company.form5500.years.forEach(year => {
                if (!yearStats[year]) yearStats[year] = { form5500: 0, scheduleA: 0 };
                yearStats[year].form5500++;
              });
            }
            
            // Check Schedule A data years
            if (company.scheduleA && company.scheduleA.recordCounts) {
              Object.keys(company.scheduleA.recordCounts).forEach(year => {
                if (company.scheduleA.recordCounts[year] > 0) {
                  if (!yearStats[year]) yearStats[year] = { form5500: 0, scheduleA: 0 };
                  yearStats[year].scheduleA++;
                }
              });
            }
          });
          
          // Sort years and display
          const sortedYears = Object.keys(yearStats).sort((a, b) => parseInt(b) - parseInt(a));
          sortedYears.forEach(year => {
            console.log(`   ${year}: ${yearStats[year].form5500} Form 5500, ${yearStats[year].scheduleA} Schedule A`);
          });
          
          if (sortedYears.length === 0) {
            console.log(`   No year data found`);
          }
        }
        
      } catch (parseError) {
        console.log('⚠️  Response is not valid JSON, showing raw response:');
        console.log('='.repeat(80));
        console.log(data);
        console.log('='.repeat(80));
      }
    } else {
      console.log(`❌ Request failed with status ${res.statusCode}`);
      console.log('Raw response:');
      console.log(data);
    }
  });
});

// Handle request errors
req.on('error', (error) => {
  console.error(`❌ Request failed: ${error.message}`);
  
  if (error.code === 'ECONNREFUSED') {
    console.error(`💡 Make sure the server is running on port ${port}`);
    console.error(`   Try: npm start`);
  }
  
  process.exit(1);
});

// Set request timeout
req.setTimeout(5000, () => {
  console.error('❌ Request timed out after 5 seconds');
  req.destroy();
  process.exit(1);
});