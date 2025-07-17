#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Verify CSV import results
 */
class ImportVerifier {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    const infoPath = path.join(__dirname, 'info.txt');
    const infoContent = fs.readFileSync(infoPath, 'utf8');
    const dbUrlMatch = infoContent.match(/DATABASE_PUBLIC_URL=(.+)/);

    if (!dbUrlMatch) {
      throw new Error('Could not find DATABASE_PUBLIC_URL in info.txt');
    }

    this.pool = new Pool({
      connectionString: dbUrlMatch[1].trim(),
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log('✅ Database connection established');
  }

  /**
   * Run verification queries
   */
  async verify() {
    const client = await this.pool.connect();
    
    try {
      console.log('🔍 Verifying import results...');
      console.log('='.repeat(50));

      // Check table counts
      const form5500Count = await client.query('SELECT COUNT(*) FROM form_5500_records');
      const scheduleACount = await client.query('SELECT COUNT(*) FROM schedule_a_records');
      
      console.log(`📊 Form 5500 Records: ${parseInt(form5500Count.rows[0].count).toLocaleString()}`);
      console.log(`📊 Schedule A Records: ${parseInt(scheduleACount.rows[0].count).toLocaleString()}`);

      // Check record counts by year
      const form5500ByYear = await client.query(`
        SELECT year, COUNT(*) as count 
        FROM form_5500_records 
        GROUP BY year 
        ORDER BY year
      `);
      
      console.log('\n📅 Form 5500 by Year:');
      form5500ByYear.rows.forEach(row => {
        console.log(`  ${row.year}: ${parseInt(row.count).toLocaleString()}`);
      });

      const scheduleAByYear = await client.query(`
        SELECT year, COUNT(*) as count 
        FROM schedule_a_records 
        GROUP BY year 
        ORDER BY year
      `);
      
      console.log('\n📅 Schedule A by Year:');
      scheduleAByYear.rows.forEach(row => {
        console.log(`  ${row.year}: ${parseInt(row.count).toLocaleString()}`);
      });

      // Test search functionality
      console.log('\n🔍 Testing search functions...');
      
      // Test company search
      const searchResult = await client.query(`
        SELECT * FROM search_companies_by_name('Microsoft') LIMIT 5
      `);
      console.log(`🔍 Company search test: Found ${searchResult.rows.length} results for 'Microsoft'`);
      
      if (searchResult.rows.length > 0) {
        console.log('Sample result:', searchResult.rows[0]);
      }

      // Test top companies by participant count
      const topCompanies = await client.query(`
        SELECT sponsor_dfe_name, spons_dfe_ein, tot_active_partcp_cnt, year
        FROM form_5500_records 
        WHERE tot_active_partcp_cnt IS NOT NULL 
        ORDER BY tot_active_partcp_cnt DESC 
        LIMIT 10
      `);
      
      console.log('\n🏆 Top 10 Companies by Active Participants:');
      topCompanies.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.sponsor_dfe_name} (${row.year}): ${row.tot_active_partcp_cnt?.toLocaleString() || 'N/A'} participants`);
      });

      // Test Schedule A data
      if (scheduleACount.rows[0].count > 0) {
        const sampleEIN = await client.query(`
          SELECT DISTINCT sch_a_ein 
          FROM schedule_a_records 
          WHERE sch_a_ein IS NOT NULL 
          LIMIT 1
        `);
        
        if (sampleEIN.rows.length > 0) {
          const einData = await client.query(`
            SELECT * FROM get_schedule_a_by_ein($1) LIMIT 3
          `, [sampleEIN.rows[0].sch_a_ein]);
          
          console.log(`\n💼 Schedule A test for EIN ${sampleEIN.rows[0].sch_a_ein}:`);
          console.log(`Found ${einData.rows.length} records`);
          if (einData.rows.length > 0) {
            console.log('Sample record:', einData.rows[0]);
          }
        }
      }

      // Test views
      const companySummary = await client.query(`
        SELECT * FROM company_insurance_summary 
        WHERE schedule_a_records_count > 0 
        ORDER BY total_persons_covered DESC NULLS LAST
        LIMIT 5
      `);
      
      console.log('\n📋 Company Insurance Summary (Top 5):');
      companySummary.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.sponsor_dfe_name} (${row.year})`);
        console.log(`     Schedule A Records: ${row.schedule_a_records_count}`);
        console.log(`     Total Persons Covered: ${row.total_persons_covered?.toLocaleString() || 'N/A'}`);
        console.log(`     Insurance Carriers: ${row.insurance_carriers || 'N/A'}`);
      });

      // Data quality checks
      console.log('\n🔍 Data Quality Checks:');
      
      // Check for missing EINs
      const missingEINs = await client.query(`
        SELECT COUNT(*) FROM form_5500_records WHERE spons_dfe_ein IS NULL
      `);
      console.log(`⚠️  Form 5500 records missing EIN: ${missingEINs.rows[0].count}`);
      
      // Check for missing company names
      const missingNames = await client.query(`
        SELECT COUNT(*) FROM form_5500_records WHERE sponsor_dfe_name IS NULL OR sponsor_dfe_name = ''
      `);
      console.log(`⚠️  Form 5500 records missing company name: ${missingNames.rows[0].count}`);
      
      // Check Schedule A data quality
      const scheduleAMissing = await client.query(`
        SELECT COUNT(*) FROM schedule_a_records WHERE sch_a_ein IS NULL
      `);
      console.log(`⚠️  Schedule A records missing EIN: ${scheduleAMissing.rows[0].count}`);

      console.log('\n✅ Verification completed successfully!');
      console.log('📊 Database is ready for production use');

    } catch (error) {
      console.error('❌ Verification failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Main verification process
   */
  async run() {
    try {
      await this.initialize();
      await this.verify();
    } catch (error) {
      console.error('❌ Verification error:', error.message);
      process.exit(1);
    } finally {
      if (this.pool) {
        await this.pool.end();
      }
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verifier = new ImportVerifier();
  verifier.run();
}

module.exports = ImportVerifier;