#!/usr/bin/env node

/**
 * Enhanced Company Matching Test Script
 * 
 * Tests the new 4-level priority matching system against the Form 5500 database
 * before implementing changes in production code.
 */

// Load environment variables from server/.env
require('dotenv').config({ path: './server/.env' });

const DatabaseManager = require('./server/data-extraction/DatabaseManager');

class EnhancedMatchingTester {
  constructor() {
    this.databaseManager = null;
    this.testResults = [];
  }

  async initialize() {
    try {
      this.databaseManager = DatabaseManager.getInstance();
      await this.databaseManager.initialize();
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Enhanced batch matching logic with 4-level priority system
   * This mirrors the planned changes to batchTestCompanyNames
   */
  async enhancedBatchTest(companyNames, options = {}) {
    const { limit = 10, exactOnly = false } = options;
    
    if (!this.databaseManager) {
      throw new Error('Database not initialized');
    }
    
    const batchResults = [];
    
    // Build enhanced query with 4-level priority system
    let query;
    let params = [];
    let paramIndex = 1;
    
    const queryParts = companyNames.map(companyName => {
      const searchTermParam = `$${paramIndex}`;
      params.push(companyName);
      
      let whereClause;
      if (exactOnly) {
        whereClause = `LOWER(sponsor_dfe_name) = LOWER($${paramIndex + 1})`;
        params.push(companyName);
        paramIndex += 2;
      } else {
        // Four-tier matching: exact, first word, last word, middle word
        whereClause = `(
          LOWER(sponsor_dfe_name) = LOWER($${paramIndex + 1}) OR 
          LOWER(sponsor_dfe_name) LIKE LOWER($${paramIndex + 2}) OR
          LOWER(sponsor_dfe_name) LIKE LOWER($${paramIndex + 3}) OR  
          LOWER(sponsor_dfe_name) LIKE LOWER($${paramIndex + 4})
        )`;
        params.push(companyName);                    // exact match
        params.push(companyName + ' %');             // "Imax Corp"
        params.push('% ' + companyName);             // "Big Imax"  
        params.push('% ' + companyName + ' %');      // "Big Imax Corp"
        paramIndex += 5;
      }
      
      return `
        SELECT DISTINCT 
          ${searchTermParam} as search_term,
          sponsor_dfe_name,
          spons_dfe_ein,
          spons_dfe_mail_us_city,
          spons_dfe_mail_us_state,
          spons_dfe_mail_us_zip,
          year,
          COUNT(*) OVER (PARTITION BY sponsor_dfe_name, spons_dfe_ein) as record_count,
          CASE 
            WHEN LOWER(sponsor_dfe_name) = LOWER(${searchTermParam}) THEN 1
            WHEN LOWER(sponsor_dfe_name) LIKE LOWER(${searchTermParam} || ' %') THEN 2
            WHEN LOWER(sponsor_dfe_name) LIKE LOWER('% ' || ${searchTermParam}) THEN 3
            WHEN LOWER(sponsor_dfe_name) LIKE LOWER('% ' || ${searchTermParam} || ' %') THEN 4
          END as match_priority
        FROM form_5500_records 
        WHERE ${whereClause}
      `;
    });
    
    query = queryParts.join(' UNION ALL ') + ' ORDER BY match_priority ASC, record_count DESC, year DESC';
    
    let searchResults;
    try {
      searchResults = await this.databaseManager.query(query, params);
    } catch (error) {
      console.error('❌ Enhanced batch query failed:', error.message);
      console.error('Query preview:', query.substring(0, 300) + '...');
      console.error('Params count:', params.length);
      throw error;
    }
    
    // Enhanced result processing - best match only
    const bestMatches = new Map();

    if (searchResults && searchResults.rows) {
      searchResults.rows.forEach(row => {
        const searchTerm = row.search_term;
        if (!bestMatches.has(searchTerm)) {
          // Take the first result (already ordered by match_priority)
          bestMatches.set(searchTerm, {
            name: row.sponsor_dfe_name,
            city: row.spons_dfe_mail_us_city,
            state: row.spons_dfe_mail_us_state,
            ein: row.spons_dfe_ein,
            priority: row.match_priority,
            record_count: row.record_count
          });
        }
      });
    }

    // Format results for each company (max 1 result each)
    companyNames.forEach(companyName => {
      const bestMatch = bestMatches.get(companyName);
      const results = bestMatch ? [bestMatch] : [];
      
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

  /**
   * Current matching logic (for comparison)
   * This mirrors the existing batchTestCompanyNames logic
   */
  async currentBatchTest(companyNames, options = {}) {
    const { limit = 10, exactOnly = false } = options;
    
    if (!this.databaseManager) {
      throw new Error('Database not initialized');
    }
    
    const batchResults = [];
    
    // Build current query with broad LIKE matching
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
        params.push(`%${companyName}%`);  // Current broad matching
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
      console.error('❌ Current batch query failed:', error.message);
      throw error;
    }
    
    // Current result processing - returns all matches
    const groupedResults = new Map();
    
    searchResults.rows.forEach(row => {
      const searchTerm = row.search_term;
      if (!groupedResults.has(searchTerm)) {
        groupedResults.set(searchTerm, new Map());
      }
      
      const uniqueCompanies = groupedResults.get(searchTerm);
      const key = `${row.sponsor_dfe_name}|${row.spons_dfe_mail_us_city}|${row.spons_dfe_mail_us_state}`;
      
      if (!uniqueCompanies.has(key) && uniqueCompanies.size < limit) {
        uniqueCompanies.set(key, {
          name: row.sponsor_dfe_name,
          city: row.spons_dfe_mail_us_city,
          state: row.spons_dfe_mail_us_state,
          ein: row.spons_dfe_ein,
          record_count: row.record_count
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

  /**
   * Run comparison test between current and enhanced matching
   */
  async runComparisonTest(testCompanies) {
    console.log(`\n🧪 Testing ${testCompanies.length} companies with both matching systems...\n`);
    
    // Test current system
    const currentResults = await this.currentBatchTest(testCompanies);
    
    // Test enhanced system  
    const enhancedResults = await this.enhancedBatchTest(testCompanies);
    
    // Compare results
    this.compareResults(currentResults, enhancedResults, testCompanies);
    
    return { currentResults, enhancedResults };
  }

  /**
   * Compare and display results from both systems
   */
  compareResults(currentResults, enhancedResults, testCompanies) {
    console.log('📊 COMPARISON RESULTS');
    console.log('='.repeat(80));
    
    // Overall stats
    console.log(`\n📈 Overall Statistics:`);
    console.log(`Companies with matches - Current: ${currentResults.companiesWithResults}/${currentResults.totalCompanies}`);
    console.log(`Companies with matches - Enhanced: ${enhancedResults.companiesWithResults}/${enhancedResults.totalCompanies}`);
    
    // Detailed comparison
    console.log(`\n🔍 Detailed Comparison:`);
    console.log('-'.repeat(120));
    console.log('SEARCH TERM'.padEnd(20) + '| CURRENT RESULT'.padEnd(40) + '| ENHANCED RESULT'.padEnd(40) + '| ANALYSIS');
    console.log('-'.repeat(120));
    
    testCompanies.forEach((company, index) => {
      const current = currentResults.results[index];
      const enhanced = enhancedResults.results[index];
      
      const currentMatch = current.success ? current.results[0].name : 'No match';
      const currentCount = current.success ? `(+${current.results.length - 1} more)` : '';
      
      const enhancedMatch = enhanced.success ? enhanced.results[0].name : 'No match';
      const enhancedPriority = enhanced.success ? `P${enhanced.results[0].priority}` : '';
      
      let analysis = '';
      if (!current.success && enhanced.success) {
        analysis = '✅ Enhanced found match';
      } else if (current.success && !enhanced.success) {
        analysis = '⚠️ Enhanced lost match';
      } else if (current.success && enhanced.success) {
        if (currentMatch === enhancedMatch) {
          analysis = current.results.length > 1 ? '🎯 Same match, less noise' : '✓ Same match';
        } else {
          analysis = '🔄 Different match';
        }
      } else {
        analysis = '○ No change';
      }
      
      console.log(
        company.padEnd(20) + '| ' + 
        (currentMatch + ' ' + currentCount).padEnd(39) + '| ' + 
        (enhancedMatch + ' ' + enhancedPriority).padEnd(39) + '| ' + 
        analysis
      );
    });
    
    console.log('-'.repeat(120));
  }

  /**
   * Test specific edge cases and scenarios
   */
  async testEdgeCases() {
    console.log('\n🎯 Testing Edge Cases...\n');
    
    const edgeCases = [
      // Test priority levels
      'Imax',          // Should prefer "Imax Corp" over "Big Imax Holdings"
      'Apple',         // Should prefer "Apple Inc" over "Big Apple Corp"
      'Microsoft',     // Should prefer "Microsoft Corp" over "New Microsoft Solutions"
      'Amazon',        // Should prefer "Amazon Corp" over "Big Amazon Holdings"
      
      // Test exact matches
      'ATT',           // Should find exact "ATT" over "ATT Communications"
      'IBM',           // Should find exact "IBM" over "IBM Corporation"
      
      // Test false positive elimination
      'Max',           // Should NOT match "Imax", "Animax", etc.
      'Apple',         // Should NOT match "Pineapple Corp"
      'United',        // Should prefer "United Corp" over "United Airlines" 
      
      // Test special characters
      'AT&T',          // Should handle special characters
      "McDonald's",    // Should handle apostrophes
      
      // Test common false positives from current system
      'Ford',          // Often matches many "Hartford", "Bedford", etc.
      'Delta',         // Often matches "Delta Airlines", "Delta Corp", etc.
      
      // Clarion Capital Partners companies
      'Ad.net', 'All-Clad', 'Ametros', 'AML RightSource', 'Arthur Murray', 'Cascade', 
      'Credit Associates', 'Cross', 'Cross Mediaworks', 'Crowe Paradis', 'Eco Style', 
      'Encore Capital Group', 'Great Northwest Insurance Company', 'Harris & Harris', 
      'Hartmann', 'HROi', 'International Cybernetics', 'Lenox', 'Madison Logic', 
      'Marketplace Events', 'Moravia', 'Narrative Strategies', 'OpenRoad Lending', 
      'Perigon Learning', 'Premiere Digital', 'Ready Credit', 'Reliant', 'SOI', 
      'SQAD', 'The Oceanaire', 'V10 Entertainment',
      
      // American Discovery Capital companies
      'American Pain Consortium', 'Entertainment Partners', 'SmartBug Media', 
      'The Intersect Group', 'Majestic Realty', 'Medix', 'GreenSlate',
      
      // Revelstoke Capital Partners companies
      'AOM Infusion', 'Carrus', 'CEI Vision Partners', 'ClareMedica Health Partners',
      'Company Confidential', 'Crossroads Treatment Centers', 'DataLink', 'Empire Portfolio Group',
      'Encore Rehabilitation', 'Evolve Med Spa', 'Family Care Center', 'Fast Pace',
      'HealthAxis', 'MediQuant', 'Monte Nido', 'NAKED MD', 'Omega Systems',
      'ONsite Mammography', 'OrthoAlliance', 'Rarebreed Veterinary Partners', 'Sound Physicians',
      'The Care Team', 'Transport Investments', 'TridentUSA Health Services', 'U.S. Renal Care',
      'Upstream Rehabilitation', "Vet's Best Friend"
    ];
    
    await this.runComparisonTest(edgeCases);
  }

  /**
   * Main test runner
   */
  async runTests() {
    try {
      await this.initialize();
      
      console.log('🚀 Enhanced Company Matching Test Suite');
      console.log('=' .repeat(50));
      
      // Test edge cases
      await this.testEdgeCases();
      
      console.log('\n✅ All tests completed!');
      console.log('\n💡 Key things to look for:');
      console.log('  - Enhanced system should have fewer false positives');
      console.log('  - Priority 2 matches should beat Priority 4 matches');
      console.log('  - Exact matches (Priority 1) should always win');
      console.log('  - Each search should return exactly 1 result (or 0)');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      if (this.databaseManager) {
        // Close database connection if needed
        console.log('\n🔌 Closing database connection...');
      }
    }
  }
}

// Additional test with real portfolio companies if available
async function loadPortfolioCompanies() {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    // Try to load real portfolio companies from existing data
    const dataPath = path.join(__dirname, 'server', 'json', 'output');
    const files = await fs.readdir(dataPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length > 0) {
      const latestFile = jsonFiles[jsonFiles.length - 1];
      const filePath = path.join(dataPath, latestFile);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      if (data.companies && Array.isArray(data.companies)) {
        console.log(`📁 Loaded ${data.companies.length} real portfolio companies from ${latestFile}`);
        return data.companies.map(c => c.name).filter(name => name && name.trim()).slice(0, 50);
      }
    }
  } catch (error) {
    console.log('📁 No existing portfolio company data found, using test cases only');
  }
  
  return [];
}

// Run tests if called directly
if (require.main === module) {
  const tester = new EnhancedMatchingTester();
  
  // Load real companies and run extended test
  loadPortfolioCompanies().then(async (realCompanies) => {
    if (realCompanies.length > 0) {
      console.log(`\n🏢 Testing with ${realCompanies.length} real portfolio companies...\n`);
      await tester.runComparisonTest(realCompanies);
    }
    
    // Run edge case tests
    await tester.runTests();
  }).catch(console.error);
}

module.exports = EnhancedMatchingTester;