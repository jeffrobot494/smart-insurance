#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Drop all database tables and functions
 */
class TableDropper {
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
   * Drop all tables, views, and functions
   */
  async dropAll() {
    const client = await this.pool.connect();
    
    try {
      console.log('🗑️  Dropping all database objects...');
      
      // Drop functions first
      console.log('Dropping functions...');
      await client.query(`
        DROP FUNCTION IF EXISTS search_companies_by_name(TEXT);
        DROP FUNCTION IF EXISTS get_schedule_a_by_ein(VARCHAR(9));
      `);
      
      // Drop views
      console.log('Dropping views...');
      await client.query(`
        DROP VIEW IF EXISTS benefit_type_analysis;
        DROP VIEW IF EXISTS company_insurance_summary;
      `);
      
      // Drop tables (in reverse order of dependencies)
      console.log('Dropping tables...');
      await client.query(`
        DROP TABLE IF EXISTS schedule_a_records CASCADE;
        DROP TABLE IF EXISTS form_5500_records CASCADE;
      `);
      
      console.log('✅ All database objects dropped successfully');
      
    } catch (error) {
      console.error('❌ Error dropping database objects:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Main drop process
   */
  async run() {
    try {
      await this.initialize();
      await this.dropAll();
      console.log('🎉 Database cleanup completed successfully!');
    } catch (error) {
      console.error('❌ Drop operation failed:', error.message);
      process.exit(1);
    } finally {
      if (this.pool) {
        await this.pool.end();
      }
    }
  }
}

// Run drop if called directly
if (require.main === module) {
  const dropper = new TableDropper();
  dropper.run();
}

module.exports = TableDropper;