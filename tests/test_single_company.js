const DatabaseManager = require('../server/data-extraction/DatabaseManager');

/**
 * Test script to debug database search results for a single company
 * Usage: node test_single_company.js "Company Name"
 */

async function testSingleCompany(companyName) {
  console.log('='.repeat(80));
  console.log(`🔍 TESTING COMPANY: ${companyName}`);
  console.log('='.repeat(80));

  let dbManager;

  try {
    // Initialize shared database connection
    dbManager = new DatabaseManager();
    await dbManager.initialize();
    
    // Test 1: Direct Database Query
    console.log('\n📊 TEST 1: Direct Database Search');
    console.log('-'.repeat(50));
    
    const dbRecords = await dbManager.searchCompaniesByName(companyName);
    
    console.log(`Found ${dbRecords.length} records in database`);
    
    if (dbRecords.length > 0) {
      console.log('\nRecord details:');
      
      // Group by year
      const recordsByYear = {};
      for (const record of dbRecords) {
        const year = record.year || 'unknown';
        if (!recordsByYear[year]) {
          recordsByYear[year] = [];
        }
        recordsByYear[year].push(record);
      }
      
      for (const [year, records] of Object.entries(recordsByYear)) {
        console.log(`  ${year}: ${records.length} records`);
        
        // Show first record details
        if (records.length > 0) {
          const firstRecord = records[0];
          console.log(`    Sample record fields: ${Object.keys(firstRecord).join(', ')}`);
          console.log(`    Sponsor name: "${firstRecord.sponsor_name}"`);
          console.log(`    EIN: ${firstRecord.ein}`);
        }
      }
    } else {
      console.log('❌ No records found');
      
      // Test fuzzy search to see if similar names exist
      console.log('\n🔍 Testing fuzzy search...');
      const words = companyName.split(' ');
      for (const word of words) {
        if (word.length > 2) {
          console.log(`\nSearching for "${word}":`);
          const fuzzyResults = await dbManager.searchCompaniesByName(word);
          console.log(`  Found ${fuzzyResults.length} records`);
          if (fuzzyResults.length > 0 && fuzzyResults.length < 10) {
            fuzzyResults.forEach(record => {
              console.log(`    "${record.sponsor_name}" (${record.year})`);
            });
          }
        }
      }
    }

    // Test 2: Database Stats
    console.log('\n📊 TEST 2: Database Statistics');
    console.log('-'.repeat(50));
    
    const stats = await dbManager.query('SELECT year, COUNT(*) as record_count FROM form_5500_records GROUP BY year ORDER BY year');
    console.log('Records by year in database:');
    stats.rows.forEach(row => {
      console.log(`  ${row.year}: ${row.record_count} records`);
    });
    
    // Test 3: Schedule A Search (if we found an EIN)
    const einRecord = dbRecords.find(r => r.ein);
    if (einRecord) {
      console.log('\n📊 TEST 3: Schedule A Search');
      console.log('-'.repeat(50));
      
      const schARecords = await dbManager.getScheduleAByEIN(einRecord.ein);
      console.log(`Schedule A records for EIN ${einRecord.ein}: ${schARecords.length}`);
      
      if (schARecords.length > 0) {
        const schAByYear = {};
        schARecords.forEach(record => {
          const year = record.year || 'unknown';
          schAByYear[year] = (schAByYear[year] || 0) + 1;
        });
        
        console.log('Schedule A records by year:');
        Object.entries(schAByYear).forEach(([year, count]) => {
          console.log(`  ${year}: ${count} records`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (dbManager) {
      await dbManager.close();
    }
  }
}


// Main execution
const companyName = process.argv[2];

if (!companyName) {
  console.log('Usage: node test_single_company.js "Company Name"');
  console.log('Example: node test_single_company.js "Microsoft Corporation"');
  process.exit(1);
}

// Load environment variables
require('dotenv').config({ path: '../server/.env' });

testSingleCompany(companyName);