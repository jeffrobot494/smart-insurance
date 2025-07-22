#!/usr/bin/env node

// Test script for the new DatabaseManager methods
require('./server/utils/load-env');
const DatabaseManager = require('./server/data-extraction/DatabaseManager');

async function testDatabaseMethods() {
  const db = DatabaseManager.getInstance();
  
  try {
    console.log('🔍 Testing DatabaseManager methods...\n');
    
    // Initialize database connection
    await db.initialize();
    console.log('✅ Database initialized\n');
    
    // Check if results column exists
    console.log('📋 Checking workflow_executions table structure...');
    const tableInfo = await db.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'workflow_executions' 
      ORDER BY ordinal_position
    `);
    
    console.log('Current columns:');
    tableInfo.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    });
    
    // Check if results column exists
    const hasResultsColumn = tableInfo.rows.some(row => row.column_name === 'results');
    const hasCompletedAtColumn = tableInfo.rows.some(row => row.column_name === 'completed_at');
    
    if (!hasResultsColumn || !hasCompletedAtColumn) {
      console.log('\n🔧 Adding missing columns...');
      
      if (!hasResultsColumn) {
        await db.query('ALTER TABLE workflow_executions ADD COLUMN results JSONB');
        console.log('✅ Added results column (JSONB)');
      }
      
      if (!hasCompletedAtColumn) {
        await db.query('ALTER TABLE workflow_executions ADD COLUMN completed_at TIMESTAMP');
        console.log('✅ Added completed_at column (TIMESTAMP)');
      }
    } else {
      console.log('✅ All required columns exist');
    }
    
    // Test 1: Get existing workflow executions
    console.log('\n📊 Testing existing workflow executions...');
    const existingWorkflows = await db.query('SELECT id, workflow_name, status, created_at FROM workflow_executions ORDER BY id DESC LIMIT 5');
    
    if (existingWorkflows.rows.length > 0) {
      console.log('Found workflow executions:');
      existingWorkflows.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Name: ${row.workflow_name}, Status: ${row.status}`);
      });
      
      // Test 2: Try to get results for an existing workflow
      const testWorkflowId = existingWorkflows.rows[0].id;
      console.log(`\n🧪 Testing getWorkflowResults with ID: ${testWorkflowId}`);
      
      const results = await db.getWorkflowResults(testWorkflowId);
      console.log('Results:', results);
      
      // Test 3: Update workflow with sample results
      console.log(`\n🧪 Testing updateWorkflowResults with ID: ${testWorkflowId}`);
      
      const sampleResults = {
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          totalCompanies: 2,
          companiesWithForm5500: 1,
          companiesWithScheduleA: 1
        },
        companies: [
          {
            companyName: "Test Company 1",
            ein: "123456789",
            form5500: { years: ["2023"], recordCount: 1 },
            scheduleA: { recordCounts: {"2023": 2}, details: {} }
          }
        ]
      };
      
      const updateSuccess = await db.updateWorkflowResults(testWorkflowId, sampleResults);
      console.log('Update successful:', updateSuccess);
      
      // Test 4: Get results again to verify
      console.log(`\n🧪 Testing getWorkflowResults again to verify update...`);
      const updatedResults = await db.getWorkflowResults(testWorkflowId);
      console.log('Updated results:', JSON.stringify(updatedResults, null, 2));
      
    } else {
      console.log('No existing workflow executions found. Creating a test one...');
      
      // Create a test workflow execution
      const testWorkflowId = await db.createWorkflowExecution('test_workflow');
      console.log(`Created test workflow with ID: ${testWorkflowId}`);
      
      if (testWorkflowId) {
        // Test the methods with the new workflow
        const sampleResults = { success: true, test: true };
        const updateSuccess = await db.updateWorkflowResults(testWorkflowId, sampleResults);
        console.log('Update successful:', updateSuccess);
        
        const retrievedResults = await db.getWorkflowResults(testWorkflowId);
        console.log('Retrieved results:', retrievedResults);
      }
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Close database connection
    await db.close();
  }
}

// Run the test
testDatabaseMethods().catch(console.error);