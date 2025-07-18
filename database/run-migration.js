const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Run a specific migration file against the database
 * Usage: node run-migration.js 001_add_portfolio_companies.sql
 */

async function runMigration(migrationFile) {
  // Load environment variables
  require('dotenv').config({ path: '../server/.env' });
  
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    
    console.log('📂 Reading migration file...');
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log(`🚀 Running migration: ${migrationFile}`);
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.log('Usage: node run-migration.js <migration-file>');
  console.log('Example: node run-migration.js 001_add_portfolio_companies.sql');
  process.exit(1);
}

runMigration(migrationFile);