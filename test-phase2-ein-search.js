#!/usr/bin/env node

/**
 * Phase 2 Testing Script - EIN-Based Search Methods
 * 
 * Tests the new EIN-based search infrastructure:
 * - DatabaseManager.searchCompaniesByEIN()
 * - Form5500SearchService.searchCompaniesByEIN()
 */

// Load environment variables from server/.env
require('dotenv').config({ path: './server/.env' });

const DatabaseManager = require('./server/data-extraction/DatabaseManager');
const Form5500SearchService = require('./server/data-extraction/Form5500SearchService');

class Phase2Tester {
  constructor() {
    this.testResults = [];
    this.databaseManager = DatabaseManager.getInstance();
    this.form5500SearchService = new Form5500SearchService();
  }

  /**
   * Test DatabaseManager.searchCompaniesByEIN() method
   */
  async testDatabaseManagerEINSearch() {
    console.log('🧪 Testing DatabaseManager.searchCompaniesByEIN()...\n');

    // Test EINs from recent pipeline logs (known to have Form 5500 data)
    const testEINs = [
      '815000414', // AMERICAN PAIN CONSORTIUM
      '204063021', // The Intersect Group, LLC  
      '263244605'  // SMARTBUG OPERATING LLC
    ];

    try {
      await this.databaseManager.initialize();
      
      for (const ein of testEINs) {
        console.log(`🔍 Testing EIN: ${ein}`);
        
        const startTime = Date.now();
        const records = await this.databaseManager.searchCompaniesByEIN(ein);
        const searchTime = Date.now() - startTime;
        
        console.log(`  ✅ Found ${records.length} records in ${searchTime}ms`);
        
        if (records.length > 0) {
          const firstRecord = records[0];
          console.log(`  📄 Sample record: ${firstRecord.sponsor_dfe_name || 'No name'} (${firstRecord.year || 'No year'})`);
        }
        
        console.log('');
      }
      
      // Test invalid EIN
      console.log('🧪 Testing invalid EIN...');
      try {
        await this.databaseManager.searchCompaniesByEIN('123');
        console.log('  ❌ Should have thrown error for invalid EIN');
        this.testResults.push({
          name: 'DatabaseManager EIN Validation',
          passed: false,
          details: 'Failed to validate invalid EIN'
        });
      } catch (error) {
        console.log(`  ✅ Correctly rejected invalid EIN: ${error.message}`);
        this.testResults.push({
          name: 'DatabaseManager EIN Validation',
          passed: true
        });
      }
      
      this.testResults.push({
        name: 'DatabaseManager EIN Search',
        passed: true,
        details: `Successfully searched ${testEINs.length} EINs`
      });
      
    } catch (error) {
      console.error('❌ DatabaseManager EIN search test failed:', error.message);
      this.testResults.push({
        name: 'DatabaseManager EIN Search',
        passed: false,
        error: error.message
      });
    }
  }

  /**
   * Test Form5500SearchService.searchCompaniesByEIN() method
   */
  async testForm5500SearchServiceEINSearch() {
    console.log('\n🧪 Testing Form5500SearchService.searchCompaniesByEIN()...\n');

    // Test data matching the expected input format
    const testCompanyMatches = [
      {
        ein: '815000414',
        legal_name: 'AMERICAN PAIN CONSORTIUM',
        original_company_name: 'American Pain'
      },
      {
        ein: '204063021', 
        legal_name: 'THE INTERSECT GROUP, LLC',
        original_company_name: 'Intersect Group'
      }
    ];

    try {
      console.log(`🔍 Testing ${testCompanyMatches.length} company matches...`);
      
      const startTime = Date.now();
      const results = await this.form5500SearchService.searchCompaniesByEIN(testCompanyMatches);
      const totalTime = Date.now() - startTime;
      
      console.log(`\n📊 Search completed in ${totalTime}ms`);
      console.log(`📋 Results summary:`);
      
      results.forEach((result, index) => {
        const match = testCompanyMatches[index];
        console.log(`  ${index + 1}. ${result.company} (EIN: ${result.ein})`);
        console.log(`     Records found: ${result.recordCount}`);
        console.log(`     Years available: ${result.years.join(', ') || 'None'}`);
      });
      
      // Validate results structure
      const structureValid = results.every(result => 
        result.hasOwnProperty('company') &&
        result.hasOwnProperty('ein') &&
        result.hasOwnProperty('years') &&
        result.hasOwnProperty('recordCount') &&
        result.hasOwnProperty('records')
      );
      
      if (structureValid) {
        console.log('\n✅ All results have correct structure');
        this.testResults.push({
          name: 'Form5500SearchService EIN Search',
          passed: true,
          details: `Successfully searched ${testCompanyMatches.length} companies`
        });
      } else {
        console.log('\n❌ Some results have incorrect structure');
        this.testResults.push({
          name: 'Form5500SearchService EIN Search',
          passed: false,
          details: 'Result structure validation failed'
        });
      }
      
    } catch (error) {
      console.error('❌ Form5500SearchService EIN search test failed:', error.message);
      this.testResults.push({
        name: 'Form5500SearchService EIN Search',
        passed: false,
        error: error.message
      });
    }
  }

  /**
   * Test that new methods don't interfere with existing functionality
   */
  async testNoInterference() {
    console.log('\n🧪 Testing that new methods don\'t interfere with existing functionality...\n');

    try {
      // Test that existing name-based search still works
      const nameSearchResults = await this.form5500SearchService.searchCompanies(['TEST COMPANY NAME']);
      
      console.log('✅ Existing name-based search still works');
      console.log(`📊 Name search returned ${nameSearchResults.length} results`);
      
      this.testResults.push({
        name: 'No Interference with Existing Methods',
        passed: true
      });
      
    } catch (error) {
      console.error('❌ Existing functionality interference test failed:', error.message);
      this.testResults.push({
        name: 'No Interference with Existing Methods', 
        passed: false,
        error: error.message
      });
    }
  }

  /**
   * Generate final test report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 PHASE 2 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));

    let allPassed = true;
    
    this.testResults.forEach(test => {
      const status = test.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`${status}: ${test.name}`);
      
      if (!test.passed) {
        allPassed = false;
        if (test.error) {
          console.log(`   Error: ${test.error}`);
        }
        if (test.details) {
          console.log(`   Details: ${test.details}`);
        }
      } else if (test.details) {
        console.log(`   ${test.details}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`🎯 OVERALL PHASE 2 STATUS: ${allPassed ? '✅ READY FOR PHASE 3' : '❌ NEEDS FIXES'}`);
    console.log('='.repeat(80));

    if (allPassed) {
      console.log('\n🚀 Phase 2 EIN-based search infrastructure is working correctly!');
      console.log('✅ DatabaseManager.searchCompaniesByEIN() working');
      console.log('✅ Form5500SearchService.searchCompaniesByEIN() working'); 
      console.log('✅ No interference with existing functionality');
      console.log('\n📝 Next steps: Proceed to Phase 3 (Switch DataExtractionService to use EIN-based search)');
    } else {
      console.log('\n🔧 Phase 2 needs fixes before proceeding to Phase 3');
    }

    return allPassed;
  }

  /**
   * Run all Phase 2 tests
   */
  async runAllTests() {
    console.log('🚀 Phase 2 Test Suite Starting...\n');
    
    await this.testDatabaseManagerEINSearch();
    await this.testForm5500SearchServiceEINSearch();
    await this.testNoInterference();
    
    return this.generateReport();
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new Phase2Tester();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = Phase2Tester;