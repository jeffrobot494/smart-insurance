#!/usr/bin/env node

// Cleanup script to drop workflow tables entirely (they will be recreated by create-tables.sql)
const { loadEnv } = require('./server/utils/load-env');
loadEnv('./server/.env'); // Load from correct path
const DatabaseManager = require('./server/data-extraction/DatabaseManager');

async function cleanupTestData() {
  const db = DatabaseManager.getInstance();
  
  try {
    console.log('🧹 Starting cleanup of test data...\n');
    
    // Initialize database connection
    await db.initialize();
    
    // Show current data before cleanup
    console.log('📊 Current data in tables:');
    
    const workflowCount = await db.query('SELECT COUNT(*) FROM workflow_executions');
    const portfolioCount = await db.query('SELECT COUNT(*) FROM portfolio_companies');
    
    console.log(`  - workflow_executions: ${workflowCount.rows[0].count} records`);
    console.log(`  - portfolio_companies: ${portfolioCount.rows[0].count} records\n`);
    
    if (workflowCount.rows[0].count === '0') {
      console.log('✅ Tables are already empty, nothing to clean up!');
      return;
    }
    
    // Ask for confirmation (in a real scenario)
    console.log('⚠️  This will delete ALL workflow execution and portfolio company data!');
    console.log('🗑️  Proceeding with cleanup in 3 seconds...\n');
    
    // Wait 3 seconds to allow cancellation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Drop workflow tables entirely (in correct order due to foreign keys)
    console.log('🗑️  Dropping portfolio_companies table...');
    await db.query('DROP TABLE IF EXISTS portfolio_companies CASCADE');
    console.log('✅ Dropped portfolio_companies table');
    
    console.log('🗑️  Dropping workflow_executions table...');
    await db.query('DROP TABLE IF EXISTS workflow_executions CASCADE');
    console.log('✅ Dropped workflow_executions table');
    
    console.log('\n✅ Cleanup completed successfully!');
    console.log('📊 Workflow tables dropped - they will be recreated automatically when needed');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Close database connection
    await db.close();
  }
}

// Run the cleanup
cleanupTestData().catch(console.error);