#!/usr/bin/env node

// Cleanup script to remove test data from workflow tables
require('./server/utils/load-env');
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
    
    // Delete in correct order (child records first)
    console.log('🗑️  Deleting portfolio_companies records...');
    const deletedPortfolio = await db.query('DELETE FROM portfolio_companies');
    console.log(`✅ Deleted ${deletedPortfolio.rowCount} portfolio_companies records`);
    
    console.log('🗑️  Deleting workflow_executions records...');
    const deletedWorkflows = await db.query('DELETE FROM workflow_executions');
    console.log(`✅ Deleted ${deletedWorkflows.rowCount} workflow_executions records`);
    
    // Reset auto-increment sequences
    console.log('🔄 Resetting ID sequences...');
    await db.query('ALTER SEQUENCE workflow_executions_id_seq RESTART WITH 1');
    await db.query('ALTER SEQUENCE portfolio_companies_id_seq RESTART WITH 1');
    console.log('✅ ID sequences reset to start from 1');
    
    console.log('\n✅ Cleanup completed successfully!');
    console.log('📊 Tables are now empty and ready for fresh data');
    
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