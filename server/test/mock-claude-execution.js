/**
 * Mock test for full workflow execution with only Claude mocked
 * Uses real database, real WorkflowManager, real DataExtractionService
 * Only mocks ClaudeManager to avoid API costs and delays
 * 
 * Usage: node server/test/mock-claude-execution.js
 */

const path = require('path');

// Load environment variables manually since we're running from test directory
const { loadEnv } = require('../utils/load-env');
const envPath = path.join(__dirname, '../.env'); // .env is in server/ directory
loadEnv(envPath);

// Debug: Check if environment variables are loaded
console.log('🔍 Database config check:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('DATABASE_PUBLIC_URL:', process.env.DATABASE_PUBLIC_URL ? 'SET' : 'NOT SET');
console.log('PGDATABASE:', process.env.PGDATABASE || 'NOT SET');

// ============================================================================
// MOCK TOOL MANAGER - Needed to avoid server dependency
// ============================================================================

class MockToolManager {
  getAvailableTools() {
    // Return empty array since we're mocking Claude responses anyway
    return [];
  }
}

// ============================================================================
// MOCK CLAUDE MANAGER - Only component that gets mocked
// ============================================================================

class MockClaudeManager {
  constructor() {
    this.conversationHistory = [];
  }

  async sendMessage(prompt, tools = []) {
    console.log(`🤖 Mock Claude received prompt: ${prompt.substring(0, 100)}...`);
    
    // Debug: Log what we're checking for
    console.log(`🔍 Debug - prompt contains 'Company:': ${prompt.includes('Company:')}`);
    if (prompt.includes('Company:')) {
      console.log(`🔍 Debug - prompt contains 'DataLink': ${prompt.includes('DataLink Service Fund Solutions')}`);
      console.log(`🔍 Debug - prompt contains 'TechCorp': ${prompt.includes('TechCorp Industries')}`);
      console.log(`🔍 Debug - prompt contains 'Healthcare': ${prompt.includes('Healthcare Partners')}`);
    }
    
    // Simulate Claude processing time (much faster than real)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return responses based on prompt content
    let response;
    
    if (prompt.includes('Find the website domain')) {
      response = 'www.americandiscovery.com';
    } 
    else if (prompt.includes('Create a sitemap')) {
      response = 'https://www.americandiscovery.com/\nhttps://www.americandiscovery.com/portfolio\nhttps://www.americandiscovery.com/about\nhttps://www.americandiscovery.com/team';
    }
    else if (prompt.includes('identify which pages are most likely to contain information about portfolio companies')) {
      response = 'https://www.americandiscovery.com/portfolio';
    }
    else if (prompt.includes('extract the names of current, active portfolio companies')) {
      // NEW JSON FORMAT - this tests your comma-splitting fix
      response = '{"firm": "American Discovery Capital", "companies": ["DataLink Service Fund Solutions, LLC", "TechCorp Industries, Inc", "Healthcare Partners Group"]}';
    }
    else if (prompt.includes('Test Form 5500 matches') || prompt.includes('portfolio_verification') || prompt.includes('form5500_match')) {
      // This is a verification workflow task - return generic verification JSON
      response = `{
        "company_name": "Test Company",
        "firm_name": "American Discovery Capital",
        "headquarters_location": {"city": "Austin", "state": "TX"},
        "portfolio_verification": {"is_active_portfolio": true},
        "employee_count_assessment": {"likely_under_100_employees": false},
        "legal_entity_research": {"legal_entity_name": "TEST COMPANY LLC"},
        "form5500_match": {"legal_name": "TEST COMPANY LLC", "ein": "12-3456789", "location": "Austin, TX", "match_type": "exact", "record_count": 1, "variation_used": "original"},
        "status": "READY_FOR_EXTRACTION"
      }`;
    }
    else if (prompt.includes('Company:')) {
      // This is a verification workflow - return appropriate JSON based on company
      if (prompt.includes('DataLink Service Fund Solutions')) {
        response = `{
          "company_name": "DataLink Service Fund Solutions, LLC",
          "firm_name": "American Discovery Capital",
          "headquarters_location": {"city": "Austin", "state": "TX"},
          "portfolio_verification": {"is_active_portfolio": true},
          "employee_count_assessment": {"likely_under_100_employees": false},
          "legal_entity_research": {"legal_entity_name": "DATALINK SERVICE FUND SOLUTIONS LLC"},
          "form5500_match": {"legal_name": "DATALINK SERVICE FUND SOLUTIONS LLC"},
          "status": "READY_FOR_EXTRACTION"
        }`;
      }
      else if (prompt.includes('TechCorp Industries')) {
        response = `{
          "company_name": "TechCorp Industries, Inc",
          "firm_name": "American Discovery Capital", 
          "headquarters_location": {"city": "San Francisco", "state": "CA"},
          "portfolio_verification": {"is_active_portfolio": true},
          "employee_count_assessment": {"likely_under_100_employees": false},
          "legal_entity_research": {"legal_entity_name": "TECHCORP INDUSTRIES INC"},
          "form5500_match": {"legal_name": "TECHCORP INDUSTRIES INC"},
          "status": "READY_FOR_EXTRACTION"
        }`;
      }
      else if (prompt.includes('Healthcare Partners')) {
        response = `{
          "company_name": "Healthcare Partners Group",
          "firm_name": "American Discovery Capital",
          "headquarters_location": {"city": "Boston", "state": "MA"},
          "portfolio_verification": {"is_active_portfolio": false},
          "employee_count_assessment": {"likely_under_100_employees": true},
          "legal_entity_research": {"legal_entity_name": "HEALTHCARE PARTNERS GROUP LLC"},
          "status": "SKIPPED_SMALL_COMPANY"
        }`;
      }
      else {
        // Generic verification response for any other company
        response = `{
          "company_name": "Generic Company",
          "firm_name": "American Discovery Capital",
          "headquarters_location": {"city": "Unknown", "state": "Unknown"},
          "portfolio_verification": {"is_active_portfolio": true},
          "employee_count_assessment": {"likely_under_100_employees": false},
          "legal_entity_research": {"legal_entity_name": "GENERIC COMPANY LLC"},
          "form5500_match": {"legal_name": "GENERIC COMPANY LLC"},
          "status": "READY_FOR_EXTRACTION"
        }`;
      }
    }
    else {
      response = `Mock response for: ${prompt.substring(0, 50)}...`;
    }
    
    console.log(`🤖 Mock Claude response: ${response.substring(0, 100)}...`);
    return response;
  }

  async sendMessageWithTools(prompt, tools = []) {
    // For now, just delegate to sendMessage
    // In real implementation, this would handle tool calls
    return await this.sendMessage(prompt, tools);
  }

  setConversationHistory(history) {
    this.conversationHistory = history;
  }

  getConversationHistory() {
    return this.conversationHistory;
  }
}

// ============================================================================
// MOCK TASK EXECUTION - Uses Mock Claude but real everything else
// ============================================================================

class MockTaskExecution {
  constructor(task) {
    this.task = task;
    this.allowedTools = task.allowed_tools || null;
    this.mockClaude = new MockClaudeManager();
  }
  
  setToolManager(toolManager) {
    this.toolManager = toolManager;
  }
  
  getAvailableTools() {
    // Use real tool filtering logic but return empty for simplicity
    // In reality, you'd return mock tools that the mock Claude can "use"
    return [];
  }
  
  async run(inputs) {
    console.log(`🎯 Task ${this.task.id}: ${this.task.name}`);
    console.log(`📝 Instructions: ${this.task.instructions}`);
    console.log(`📥 Inputs:`, inputs);
    
    try {
      // Create prompt from task instructions and inputs
      let prompt = this.task.instructions;
      
      // Add input context to prompt
      Object.keys(inputs).forEach(key => {
        prompt += `\n\nInput (${key}): ${inputs[key]}`;
      });
      
      // Get mock response from Claude
      const result = await this.mockClaude.sendMessage(prompt);
      
      console.log(`✅ Task ${this.task.id} completed successfully`);
      console.log(`📤 Output: ${result.substring(0, 200)}...`);
      
      return {
        success: true,
        result: result,
        executionTime: Math.random() * 500 + 200
      };
      
    } catch (error) {
      console.error(`❌ Task ${this.task.id} failed:`, error.message);
      return {
        success: false,
        error: error.message,
        executionTime: 0
      };
    }
  }
}

// ============================================================================
// TEST EXECUTION FUNCTION
// ============================================================================

async function runMockClaudeExecution() {
  console.log('🧪 STARTING MOCK CLAUDE EXECUTION TEST');
  console.log('='.repeat(80));
  console.log('This test uses:');
  console.log('✅ Real Database (PostgreSQL)');
  console.log('✅ Real WorkflowManager'); 
  console.log('✅ Real DataExtractionService');
  console.log('✅ Real SaveTaskResults');
  console.log('✅ Real VerificationResultsConverter');
  console.log('🤖 Mock ClaudeManager (instant responses)');
  console.log('');
  
  try {
    // ========================================================================
    // SETUP - Override only TaskExecution to use Mock Claude
    // ========================================================================
    
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    
    // Only intercept TaskExecution to inject Mock Claude
    Module.prototype.require = function(id) {
      if (id.includes('TaskExecution') && !id.includes('mock')) {
        return MockTaskExecution;
      }
      return originalRequire.apply(this, arguments);
    };
    
    // ========================================================================
    // LOAD MANAGER WITH REAL DEPENDENCIES
    // ========================================================================
    
    const { Manager } = require('../Manager');
    
    // Create manager instance - everything real except Claude
    const manager = new Manager();
    
    // Override the taskManager with mock ToolManager to avoid server dependency
    const WorkflowManager = require('../workflow/WorkflowManager');
    manager.taskManager = new WorkflowManager(new MockToolManager());
    
    // Initialize real database connection
    await manager.databaseManager.initialize();
    console.log('✅ Real database connection established');
    
    // ========================================================================
    // EXECUTE TEST WITH REAL INTEGRATION
    // ========================================================================
    
    const testInput = {
      input: ['American Discovery Capital']
    };
    
    console.log('📋 Test Input:', testInput);
    console.log('\n' + '='.repeat(80));
    console.log('🚀 EXECUTING FULL WORKFLOW WITH MOCK CLAUDE');
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    // This runs the complete real sequence with only Claude mocked:
    // 1. Real PE Research workflow -> Real Database save
    // 2. Real Name refinement workflow -> Real Database save  
    // 3. Real Data extraction -> Real Form 5500 queries
    await manager.run('pe_firm_research.json', testInput);
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // ========================================================================
    // VERIFY REAL DATABASE RESULTS
    // ========================================================================
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 VERIFYING REAL DATABASE RESULTS');
    console.log('='.repeat(80));
    
    // Check what actually got saved to the real database
    const savedResults = await manager.getAllSavedResults();
    console.log(`📋 Found ${savedResults.length} workflow executions in database`);
    
    for (const result of savedResults.slice(-3)) { // Show last 3 results
      console.log(`   📄 Workflow ${result.id}: ${result.workflow_name} (${result.status})`);
      
      // Check portfolio companies for this workflow
      const companies = await manager.databaseManager.getPortfolioCompaniesByWorkflowId(result.id);
      if (companies.length > 0) {
        console.log(`      🏢 Companies: ${companies.join(', ')}`);
      }
    }
    
    // ========================================================================
    // TEST RESULTS
    // ========================================================================
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ MOCK CLAUDE EXECUTION TEST COMPLETED!');
    console.log('='.repeat(80));
    console.log(`⏱️  Execution Time: ${executionTime}ms`);
    console.log(`💰 API Cost: $0.00 (Claude mocked)`);
    console.log(`🔍 Real Components Tested:`);
    console.log(`   ✅ Database integration (real PostgreSQL)`);
    console.log(`   ✅ WorkflowManager orchestration`);
    console.log(`   ✅ SaveTaskResults database operations`);
    console.log(`   ✅ VerificationResultsConverter JSON parsing`);
    console.log(`   ✅ DataExtractionService Form 5500 queries`);
    console.log(`   ✅ Manager.js workflow sequence`);
    console.log(`   🤖 ClaudeManager responses (mocked for speed)`);
    
    // Restore original require
    Module.prototype.require = originalRequire;
    
    return true;
    
  } catch (error) {
    console.error('\n❌ MOCK CLAUDE TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// ============================================================================
// EXPORT AND CLI EXECUTION  
// ============================================================================

module.exports = { 
  runMockClaudeExecution,
  MockClaudeManager,
  MockTaskExecution
};

// Run if called directly
if (require.main === module) {
  runMockClaudeExecution()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}