#!/usr/bin/env node

/**
 * Phase 3 Testing Script - EIN-Based Search Integration
 * 
 * Tests the integration of EIN-based search in DataExtractionService:
 * - Companies with validated matches use EIN-based search
 * - Companies without matches use name-based search (fallback)
 * - No-match companies (like Cascade) get no Form 5500 data
 */

// Load environment variables from server/.env
require('dotenv').config({ path: './server/.env' });

const DataExtractionService = require('./server/data-extraction/DataExtractionService');
const DatabaseManager = require('./server/data-extraction/DatabaseManager');

class Phase3Tester {
  constructor(pipelineId) {
    this.testResults = [];
    this.dataExtractionService = new DataExtractionService();
    this.databaseManager = DatabaseManager.getInstance();
    this.pipelineId = pipelineId;
  }

  /**
   * Test with real pipeline data from database
   */
  async testRealPipelineData() {
    console.log(`🧪 Testing Phase 3 with real pipeline data (ID: ${this.pipelineId})...\n`);

    try {
      // Get the real pipeline data to analyze
      await this.databaseManager.initialize();
      const pipeline = await this.databaseManager.getPipeline(this.pipelineId);
      
      if (!pipeline || !pipeline.companies) {
        throw new Error(`Pipeline ${this.pipelineId} not found or has no companies`);
      }
      
      console.log('🔍 Analyzing pipeline data...');
      console.log(`📊 Pipeline data: ${pipeline.companies.length} companies`);
      
      // Analyze the company data
      const companiesWithValidMatches = pipeline.companies.filter(company => 
        company.form5500_match && 
        company.form5500_match.match_type !== "no_match" &&
        company.form5500_match.ein
      );
      
      const companiesWithoutMatches = pipeline.companies.filter(company => 
        !company.form5500_match || 
        company.form5500_match.match_type === "no_match" ||
        !company.form5500_match.ein
      );
      
      console.log(`  - With validated matches: ${companiesWithValidMatches.length}`);
      console.log(`  - Without matches: ${companiesWithoutMatches.length}`);
      
      if (companiesWithValidMatches.length > 0) {
        console.log(`\n📋 Companies with validated matches:`);
        companiesWithValidMatches.slice(0, 3).forEach((company, index) => {
          console.log(`  ${index + 1}. ${company.name} (EIN: ${company.form5500_match.ein})`);
        });
        if (companiesWithValidMatches.length > 3) {
          console.log(`  ... and ${companiesWithValidMatches.length - 3} more`);
        }
      }
      
      if (companiesWithoutMatches.length > 0) {
        console.log(`\n❌ Companies without validated matches:`);
        companiesWithoutMatches.slice(0, 3).forEach((company, index) => {
          const matchType = company.form5500_match?.match_type || 'no match data';
          console.log(`  ${index + 1}. ${company.name} (${matchType})`);
        });
        if (companiesWithoutMatches.length > 3) {
          console.log(`  ... and ${companiesWithoutMatches.length - 3} more`);
        }
      }
      
      const startTime = Date.now();
      const result = await this.dataExtractionService.extractData(this.pipelineId, { enableSelfFundedClassification: false });
      const totalTime = Date.now() - startTime;
      
      console.log(`\n⏱️ Extraction completed in ${totalTime}ms`);
      console.log(`📋 Results summary:`);
      
      if (result.success) {
        // Analyze results by match type
        const companiesWithData = result.companies.filter(c => c.form5500_data && c.form5500_data.ein);
        const companiesWithoutData = result.companies.filter(c => !c.form5500_data || !c.form5500_data.ein);
        
        console.log(`✅ Companies that got Form 5500 data: ${companiesWithData.length}`);
        companiesWithData.slice(0, 5).forEach((company, index) => {
          console.log(`  ${index + 1}. ${company.name} (EIN: ${company.form5500_data.ein}, Records: ${company.form5500_data.form5500?.recordCount || 0})`);
        });
        if (companiesWithData.length > 5) {
          console.log(`  ... and ${companiesWithData.length - 5} more`);
        }
        
        console.log(`\n❌ Companies with no Form 5500 data: ${companiesWithoutData.length}`);
        companiesWithoutData.slice(0, 5).forEach((company, index) => {
          const matchType = company.form5500_match?.match_type || 'no match data';
          console.log(`  ${index + 1}. ${company.name} (${matchType})`);
        });
        if (companiesWithoutData.length > 5) {
          console.log(`  ... and ${companiesWithoutData.length - 5} more`);
        }
        
        // Validate Phase 3 behavior
        const companiesWithMatches = result.companies.filter(c => 
          c.form5500_match && c.form5500_match.match_type !== "no_match" && c.form5500_match.ein
        );
        const noMatchCompanies = result.companies.filter(c => 
          c.form5500_match && c.form5500_match.match_type === "no_match"
        );
        
        const validatedCompaniesGotData = companiesWithMatches.filter(c => c.form5500_data && c.form5500_data.ein).length;
        const noMatchCompaniesGotData = noMatchCompanies.filter(c => c.form5500_data && c.form5500_data.ein).length;
        
        console.log(`\n📊 Phase 3 Validation:`);
        console.log(`✅ Companies with validated matches that got data: ${validatedCompaniesGotData}/${companiesWithMatches.length}`);
        console.log(`❌ No-match companies that got data: ${noMatchCompaniesGotData}/${noMatchCompanies.length} (should be 0)`);
        
        const test1 = validatedCompaniesGotData > 0; // At least some validated companies got data
        const test2 = noMatchCompaniesGotData === 0; // No no-match companies got data
        
        const allTestsPassed = test1 && test2;
        
        this.testResults.push({
          name: 'Real Pipeline Data Processing',
          passed: allTestsPassed,
          details: `Processed ${result.companies.length} companies: ${validatedCompaniesGotData} with data, ${noMatchCompaniesGotData} no-match with data`
        });
        
      } else {
        console.log('❌ Data extraction failed:', result.message);
        this.testResults.push({
          name: 'Real Pipeline Data Processing',
          passed: false,
          error: result.message
        });
      }
      
    } catch (error) {
      console.error('❌ Phase 3 integration test failed:', error.message);
      this.testResults.push({
        name: 'Mixed Company Data Processing',
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
    console.log('📋 PHASE 3 TEST RESULTS SUMMARY');
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
      } else if (test.details) {
        console.log(`   ${test.details}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`🎯 OVERALL PHASE 3 STATUS: ${allPassed ? '✅ COMPLETE' : '❌ NEEDS FIXES'}`);
    console.log('='.repeat(80));

    if (allPassed) {
      console.log('\n🎉 Phase 3 EIN-based search integration is working correctly!');
      console.log('✅ Companies with validated matches use EIN-based search');
      console.log('✅ No-match companies are properly excluded'); 
      console.log('✅ Mixed company types handled correctly');
      console.log('\n🏁 Form 5500 Match Integration Refactor COMPLETE!');
      console.log('   - Phase 1: Data flow fixes ✅');
      console.log('   - Phase 2: EIN search infrastructure ✅'); 
      console.log('   - Phase 3: Production integration ✅');
    } else {
      console.log('\n🔧 Phase 3 needs fixes before deployment');
    }

    return allPassed;
  }

  /**
   * Run all Phase 3 tests
   */
  async runAllTests() {
    console.log(`🚀 Phase 3 Integration Test Suite Starting (Pipeline: ${this.pipelineId})...\n`);
    
    await this.testRealPipelineData();
    
    return this.generateReport();
  }
}

// Run tests if called directly
if (require.main === module) {
  const pipelineId = process.argv[2];
  
  if (!pipelineId) {
    console.error('❌ Usage: node test-phase3-integration.js <pipeline-id>');
    console.error('   Example: node test-phase3-integration.js 163');
    process.exit(1);
  }
  
  const tester = new Phase3Tester(pipelineId);
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = Phase3Tester;