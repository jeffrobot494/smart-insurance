// Basic test suite for WorkflowErrorHandler system
const WorkflowAPIError = require('../ErrorHandling/WorkflowAPIError');
const WorkflowErrorHandler = require('../ErrorHandling/WorkflowErrorHandler');
const WorkflowCancellationManager = require('../ErrorHandling/WorkflowCancellationManager');
const { Manager, PIPELINE_STATUSES } = require('../Manager');

// Mock logger for testing
const mockLogger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, error) => console.error(`[ERROR] ${msg}`, error || ''),
  warn: (msg) => console.warn(`[WARN] ${msg}`)
};

// Mock database manager for testing
class MockDatabaseManager {
  constructor() {
    this.pipelines = new Map();
    this.nextId = 1;
  }
  
  async createPipeline(firmName) {
    const pipelineId = this.nextId++;
    const pipeline = {
      pipeline_id: pipelineId,
      firm_name: firmName,
      status: 'pending',
      companies: [],
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.pipelines.set(pipelineId, pipeline);
    return pipeline;
  }
  
  async getPipeline(pipelineId) {
    return this.pipelines.get(pipelineId) || null;
  }
  
  async updatePipeline(pipelineId, updates) {
    const pipeline = this.pipelines.get(pipelineId);
    if (pipeline) {
      Object.assign(pipeline, updates);
      pipeline.updated_at = new Date().toISOString();
    }
    return pipeline;
  }
}

class ErrorHandlingTestSuite {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.mockDb = new MockDatabaseManager();
  }

  async runTests() {
    console.log('🧪 Starting WorkflowErrorHandler Test Suite\n');
    
    // Test WorkflowAPIError creation
    await this.testWorkflowAPIErrorCreation();
    
    // Test WorkflowCancellationManager
    await this.testCancellationManager();
    
    // Test WorkflowErrorHandler
    await this.testErrorHandler();
    
    // Test Manager.js integration
    await this.testManagerIntegration();
    
    // Test reset functionality
    await this.testResetFunctionality();
    
    console.log(`\n🏁 Test Suite Complete`);
    console.log(`✅ Passed: ${this.testsPassed}`);
    console.log(`❌ Failed: ${this.testsFailed}`);
    console.log(`📊 Success Rate: ${Math.round((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100)}%`);
    
    return this.testsFailed === 0;
  }

  async testWorkflowAPIErrorCreation() {
    console.log('📋 Testing WorkflowAPIError Creation');
    
    try {
      // Test basic error creation
      const claudeError = new WorkflowAPIError({
        apiName: 'Claude API',
        originalError: new Error('Insufficient credits'),
        statusCode: 402,
        errorType: 'credits_exhausted'
      });
      
      this.assert(claudeError.isWorkflowError === true, 'WorkflowAPIError should have isWorkflowError flag');
      this.assert(claudeError.apiName === 'Claude API', 'API name should be set correctly');
      this.assert(claudeError.statusCode === 402, 'Status code should be preserved');
      this.assert(claudeError.errorType === 'credits_exhausted', 'Error type should be set');
      
      // Test with string error
      const stringError = new WorkflowAPIError({
        apiName: 'Firecrawl API',
        originalError: 'Rate limit exceeded',
        statusCode: 429,
        errorType: 'rate_limit'
      });
      
      this.assert(stringError.message === 'Rate limit exceeded', 'String errors should work');
      
      console.log('✅ WorkflowAPIError creation tests passed\n');
      
    } catch (error) {
      this.fail('WorkflowAPIError creation', error);
    }
  }

  async testCancellationManager() {
    console.log('📋 Testing WorkflowCancellationManager');
    
    try {
      const manager = WorkflowCancellationManager.getInstance();
      const manager2 = WorkflowCancellationManager.getInstance();
      
      // Test singleton pattern
      this.assert(manager === manager2, 'Should return same instance (singleton)');
      
      // Test cancellation functionality
      const pipelineId = 123;
      this.assert(!manager.isCancelled(pipelineId), 'Pipeline should not be cancelled initially');
      
      await manager.cancelPipeline(pipelineId, 'api_error');
      this.assert(manager.isCancelled(pipelineId), 'Pipeline should be cancelled after cancelPipeline()');
      
      manager.clearCancellation(pipelineId);
      this.assert(!manager.isCancelled(pipelineId), 'Pipeline should not be cancelled after clearCancellation()');
      
      console.log('✅ WorkflowCancellationManager tests passed\n');
      
    } catch (error) {
      this.fail('WorkflowCancellationManager', error);
    }
  }

  async testErrorHandler() {
    console.log('📋 Testing WorkflowErrorHandler');
    
    try {
      const errorHandler = new WorkflowErrorHandler(this.mockDb, mockLogger);
      
      // Create test pipeline
      const pipeline = await this.mockDb.createPipeline('Test Firm');
      const pipelineId = pipeline.pipeline_id;
      
      // Test error classification
      const creditError = { message: 'Insufficient credit balance' };
      this.assert(errorHandler.classifyError(creditError) === 'credits_exhausted', 'Should classify credit errors');
      
      const rateError = { status: 429, message: 'Rate limit exceeded' };
      this.assert(errorHandler.classifyError(rateError) === 'rate_limit', 'Should classify rate limit errors');
      
      // Test reset behavior definition
      this.assert(errorHandler.defineResetBehavior('research_running') === 'pending', 'Research running should reset to pending');
      this.assert(errorHandler.defineResetBehavior('legal_resolution_running') === 'research_complete', 'Legal resolution should reset to research complete');
      
      // Test error recording
      await errorHandler.recordAPIError(pipelineId, {
        apiName: 'Claude API',
        errorMessage: 'Test error',
        errorType: 'credits_exhausted',
        currentState: 'research_running'
      });
      
      const updatedPipeline = await this.mockDb.getPipeline(pipelineId);
      this.assert(updatedPipeline.status === 'research_failed', 'Pipeline status should be set to failed');
      this.assert(updatedPipeline.error !== null, 'Error should be recorded in database');
      
      const errorData = JSON.parse(updatedPipeline.error);
      this.assert(errorData.api === 'Claude API', 'Error API should be recorded');
      this.assert(errorData.type === 'credits_exhausted', 'Error type should be recorded');
      
      console.log('✅ WorkflowErrorHandler tests passed\n');
      
    } catch (error) {
      this.fail('WorkflowErrorHandler', error);
    }
  }

  async testManagerIntegration() {
    console.log('📋 Testing Manager.js Integration');
    
    try {
      // Create a manager instance with mock database
      const manager = new Manager();
      manager.databaseManager = this.mockDb;
      
      // Test that error handler is initialized
      this.assert(manager.errorHandler !== null, 'Error handler should be initialized');
      this.assert(manager.cancellationManager !== null, 'Cancellation manager should be initialized');
      
      // Test that Manager exports include resetPipeline
      const { resetPipeline } = require('../Manager');
      this.assert(typeof resetPipeline === 'function', 'resetPipeline should be exported');
      
      console.log('✅ Manager.js integration tests passed\n');
      
    } catch (error) {
      this.fail('Manager.js integration', error);
    }
  }

  async testResetFunctionality() {
    console.log('📋 Testing Reset Functionality');
    
    try {
      const manager = new Manager();
      manager.databaseManager = this.mockDb;
      
      // Create test pipeline with failed status
      const pipeline = await this.mockDb.createPipeline('Reset Test Firm');
      const pipelineId = pipeline.pipeline_id;
      
      // Set pipeline to failed state with error data
      await this.mockDb.updatePipeline(pipelineId, {
        status: 'research_failed',
        error: JSON.stringify({
          api: 'Claude API',
          type: 'credits_exhausted',
          message: 'Test error',
          time: new Date().toISOString(),
          state: 'research_running'
        }),
        companies: JSON.stringify([{ name: 'Test Company' }])
      });
      
      // Test reset
      const result = await manager.resetPipeline(pipelineId);
      
      this.assert(result.success === true, 'Reset should succeed');
      this.assert(result.pipeline.status === 'pending', 'Status should be reset to pending');
      this.assert(result.pipeline.error === null, 'Error should be cleared');
      
      // Companies are stored as JSON string in database, so parse them for testing
      const companies = Array.isArray(result.pipeline.companies) ? 
        result.pipeline.companies : 
        JSON.parse(result.pipeline.companies || '[]');
      this.assert(companies.length === 0, 'Companies should be cleared for research reset');
      
      // Test reset on data extraction failure (should fail)
      await this.mockDb.updatePipeline(pipelineId, {
        status: 'data_extraction_failed'
      });
      
      const dataExtractionReset = await manager.resetPipeline(pipelineId);
      this.assert(dataExtractionReset.success === false, 'Data extraction reset should fail');
      this.assert(dataExtractionReset.error.includes('developer intervention'), 'Should indicate developer intervention needed');
      
      console.log('✅ Reset functionality tests passed\n');
      
    } catch (error) {
      this.fail('Reset functionality', error);
    }
  }

  assert(condition, message) {
    if (condition) {
      this.testsPassed++;
      console.log(`  ✅ ${message}`);
    } else {
      this.testsFailed++;
      console.log(`  ❌ ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  fail(testName, error) {
    this.testsFailed++;
    console.log(`❌ ${testName} test failed:`, error.message);
    console.log();
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new ErrorHandlingTestSuite();
  testSuite.runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = ErrorHandlingTestSuite;