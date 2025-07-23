const { Client } = require('pg');
require('../utils/load-env'); // Load environment variables

/**
 * Migration script to add firm_name column to workflow_executions table
 */
async function addFirmNameColumn() {
  let client;
  
  try {
    // Use DATABASE_PUBLIC_URL for external connections, DATABASE_URL as fallback
    const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
    
    const config = connectionString ? 
      { connectionString } : 
      {
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'password',
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: process.env.PGPORT || process.env.DB_PORT || 5432,
        database: process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.DB_NAME || 'railway'
      };

    client = new Client(config);
    await client.connect();
    
    console.log('✅ Connected to database');
    
    // Check if firm_name column already exists
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'workflow_executions' 
      AND column_name = 'firm_name';
    `;
    
    const columnExists = await client.query(checkColumnQuery);
    
    if (columnExists.rows.length > 0) {
      console.log('⚠️ Column firm_name already exists in workflow_executions table');
      return;
    }
    
    // Add firm_name column
    const addColumnQuery = `
      ALTER TABLE workflow_executions 
      ADD COLUMN firm_name VARCHAR(255);
    `;
    
    await client.query(addColumnQuery);
    console.log('✅ Successfully added firm_name column to workflow_executions table');
    
    // Show table structure
    const describeQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'workflow_executions' 
      ORDER BY ordinal_position;
    `;
    
    const columns = await client.query(describeQuery);
    console.log('\n📋 Updated table structure:');
    columns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('✅ Database connection closed');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  addFirmNameColumn()
    .then(() => {
      console.log('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addFirmNameColumn };