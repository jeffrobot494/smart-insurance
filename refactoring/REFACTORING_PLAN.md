# Smart Insurance Workflow System Refactoring Plan

## Philosophy and Approach

### Core Principles

The current workflow system suffers from several architectural issues that make it difficult to maintain, extend, and understand. This refactoring is guided by the following principles:

#### 1. **Clean Orchestration Architecture**
We want orchestrator classes that read like plain English and tell the story of the application. These classes should:
- Be short and focused on high-level flow
- Use descriptive variable and method names
- Abstract away complex implementation details
- Allow developers to understand data flow at a glance

#### 2. **Separation of Concerns**
Each orchestrator should handle one specific domain:
- **PipelineOrchestrator**: Manages multi-stage workflow execution
- **TaskOrchestrator**: Handles individual task execution with Claude
- **DataExtractionOrchestrator**: Manages Form 5500 data extraction
- **Manager**: Top-level application coordination

#### 3. **Flexible Data Flow**
- Support complex JSON objects between stages (not just arrays)
- Enable conditional execution based on previous stage results
- Allow direct data passing between workflow stages
- Support multiple pipeline compositions

#### 4. **Testing and Development**
- Individual stages must be testable in isolation
- Use the same production code paths for testing
- Provide HTTP endpoints for easy curl testing
- Enable resume-from-failure capabilities

#### 5. **Database-Backed Execution Tracking**
- Save intermediate results for debugging and recovery
- Track pipeline, stage, and workflow execution separately
- Enable querying of historical execution data
- Support failure recovery from any stage

---

## Current System Issues

### Problems Identified
1. **Rigid Input Structure**: Workflows only accept array inputs
2. **Hardcoded Workflow Chain**: Manager.js hardcodes transitions between workflows
3. **Complex Data Flow**: Results passed through file I/O instead of direct workflow connections
4. **Limited Workflow Composition**: Cannot easily chain multiple workflows or create conditional flows
5. **Tight Coupling**: Manager.js knows too much about specific workflow implementations
6. **Poor Testability**: Cannot easily test individual stages in isolation

---

## Proposed Architecture

### Database Schema

```sql
-- High-level pipeline execution
CREATE TABLE pipeline_executions (
    id SERIAL PRIMARY KEY,
    pipeline_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'running', 'completed', 'failed', 'paused'
    input_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Each stage within a pipeline
CREATE TABLE stage_executions (
    id SERIAL PRIMARY KEY,
    pipeline_execution_id INTEGER REFERENCES pipeline_executions(id),
    stage_name VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    input_data JSONB NOT NULL,
    output_data JSONB,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Individual workflow executions (adapted from current table)
CREATE TABLE workflow_executions (
    id SERIAL PRIMARY KEY,
    stage_execution_id INTEGER REFERENCES stage_executions(id),
    workflow_name VARCHAR(255) NOT NULL,
    firm_name VARCHAR(255), -- for easy querying
    status VARCHAR(50) NOT NULL,
    results JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Keep existing portfolio_companies table but link to workflow_executions
```

### Enhanced Pipeline Configuration Format

```json
{
  "workflow": {
    "name": "PE Research Pipeline",
    "description": "Complete PE firm research with multiple stages",
    "stages": [
      {
        "name": "portfolio_research",
        "workflow_file": "pe_firm_research.json",
        "input_mapping": { "firm_names": "input" }
      },
      {
        "name": "company_verification", 
        "workflow_file": "verify_companies.json",
        "input_mapping": { "companies": "portfolio_research.portfolio_companies" },
        "condition": "portfolio_research.success"
      },
      {
        "name": "legal_entity_lookup",
        "workflow_file": "get_legal_entities.json", 
        "input_mapping": { "verified_companies": "company_verification.verified_companies" }
      }
    ],
    "final_stage": "data_extraction"
  }
}
```

---

## Core Orchestrator Classes

### 1. Manager.js - Top-Level Application Orchestrator

```javascript
// Manager.js - Clean orchestrator that tells the application story
class Manager {
  constructor() {
    this.pipelineOrchestrator = new PipelineOrchestrator();
    this.dataExtractionOrchestrator = new DataExtractionOrchestrator();
    this.notificationService = new NotificationService();
  }

  async processPrivateEquityResearch(firmNames) {
    const pipelineResult = await this.pipelineOrchestrator.executePipeline('pe_research_pipeline', firmNames);
    const extractionResult = await this.dataExtractionOrchestrator.extractDataForPipeline(pipelineResult.executionId);
    
    await this.notificationService.notifyCompletion(extractionResult);
    
    return extractionResult;
  }

  async testStage(stageName, inputData) {
    return await this.pipelineOrchestrator.executeIndividualStage(stageName, inputData);
  }

  async initializeWorkflows(workflowFilename, userInputs) {
    return await this.pipelineOrchestrator.initializeWorkflows(workflowFilename, userInputs);
  }

  async getAllSavedResults() {
    return await this.dataExtractionOrchestrator.getAllSavedResults();
  }
}

// Export singleton pattern
const manager = new Manager();

const processPrivateEquityResearch = (firmNames) => manager.processPrivateEquityResearch(firmNames);
const testStage = (stageName, inputData) => manager.testStage(stageName, inputData);
const initializeWorkflows = (workflowFilename, userInputs) => manager.initializeWorkflows(workflowFilename, userInputs);
const getAllSavedResults = () => manager.getAllSavedResults();

module.exports = { 
  processPrivateEquityResearch, 
  testStage, 
  initializeWorkflows, 
  getAllSavedResults, 
  Manager 
};
```

### 2. PipelineOrchestrator.js - Pipeline Flow Management

```javascript
const { workflow: logger } = require('../utils/logger');

class PipelineOrchestrator {
  constructor() {
    this.pipelineConfigLoader = new PipelineConfigLoader();
    this.taskOrchestrator = new TaskOrchestrator();
    this.dataFlowManager = new DataFlowManager();
    this.executionTracker = new ExecutionTracker();
  }

  async executePipeline(pipelineName, initialData) {
    const pipelineConfig = await this.pipelineConfigLoader.load(pipelineName);
    const executionContext = await this.executionTracker.startPipelineExecution(pipelineConfig, initialData);
    
    logger.info(`🚀 Starting pipeline: ${pipelineName}`);
    
    for (const stage of pipelineConfig.stages) {
      if (this.shouldSkipStage(stage, executionContext)) {
        logger.info(`⏭️ Skipping stage: ${stage.name} (condition not met)`);
        continue;
      }
      
      const stageInput = this.dataFlowManager.prepareStageInput(stage, executionContext);
      const stageResult = await this.executeStage(stage, stageInput, executionContext);
      
      this.executionTracker.recordStageCompletion(executionContext, stage, stageResult);
      
      if (!stageResult.success) {
        logger.error(`❌ Pipeline stopped due to stage failure: ${stage.name}`);
        break;
      }
    }
    
    return await this.executionTracker.completePipelineExecution(executionContext);
  }

  async executeStage(stageConfig, inputData, executionContext) {
    logger.info(`🎯 Executing stage: ${stageConfig.name}`);
    
    const workflowTasks = await this.pipelineConfigLoader.loadWorkflowTasks(stageConfig.workflow_file);
    const stageResults = [];
    
    for (const dataItem of inputData) {
      const itemResult = await this.executeWorkflowForItem(workflowTasks, dataItem, executionContext);
      stageResults.push(itemResult);
    }
    
    return this.dataFlowManager.consolidateStageResults(stageResults, stageConfig);
  }

  async executeWorkflowForItem(tasks, dataItem, executionContext) {
    let currentData = dataItem;
    
    for (const task of tasks) {
      const taskInput = this.dataFlowManager.prepareTaskInput(task, currentData);
      const taskResult = await this.taskOrchestrator.executeTask(task, taskInput);
      
      if (!taskResult.success) {
        return taskResult;
      }
      
      currentData = this.dataFlowManager.updateDataWithTaskResult(currentData, task, taskResult);
    }
    
    return { success: true, data: currentData };
  }

  async executeIndividualStage(stageName, inputData) {
    const stageConfig = await this.pipelineConfigLoader.getStageConfig(stageName);
    const testExecutionContext = await this.executionTracker.createTestExecution(stageName, inputData);
    
    return await this.executeStage(stageConfig, inputData, testExecutionContext);
  }

  async initializeWorkflows(workflowFilename, userInputs) {
    const pipelineConfig = await this.pipelineConfigLoader.load(workflowFilename);
    const executionIds = await this.executionTracker.preGenerateExecutionIds(pipelineConfig, userInputs);
    
    return {
      executionIds,
      pipelineConfig,
      userInputs
    };
  }

  shouldSkipStage(stage, executionContext) {
    if (!stage.condition) return false;
    return !this.dataFlowManager.evaluateCondition(stage.condition, executionContext);
  }
}

module.exports = PipelineOrchestrator;
```

### 3. TaskOrchestrator.js - Individual Task Execution

```javascript
const { workflow: logger } = require('../utils/logger');

class TaskOrchestrator {
  constructor() {
    this.claudeClient = new ClaudeClient();
    this.toolRegistry = new ToolRegistry();
    this.conversationManager = new ConversationManager();
    this.resultValidator = new ResultValidator();
  }

  async executeTask(task, inputs) {
    logger.info(`🎯 Executing Task ${task.id}: ${task.name}`);
    
    const conversation = this.conversationManager.startNewConversation(task, inputs);
    
    while (this.conversationManager.shouldContinue(conversation)) {
      const claudeResponse = await this.claudeClient.sendMessage(conversation);
      
      if (!claudeResponse.success) {
        return this.resultValidator.createFailureResult(`Claude API error: ${claudeResponse.error}`);
      }
      
      if (this.claudeClient.hasToolCalls(claudeResponse)) {
        const toolResults = await this.toolRegistry.executeToolCalls(claudeResponse.toolCalls);
        this.conversationManager.addToolResults(conversation, toolResults);
      } else {
        const finalResult = this.resultValidator.extractFinalResult(claudeResponse, task);
        return this.resultValidator.validateTaskResult(finalResult, task);
      }
    }
    
    return this.resultValidator.createFailureResult('Maximum iterations reached');
  }

  async executeTaskWithRetry(task, inputs, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeTask(task, inputs);
      } catch (error) {
        lastError = error;
        logger.warn(`Task attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(delay);
        }
      }
    }
    
    return this.resultValidator.createFailureResult(`Task failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TaskOrchestrator;
```

### 4. DataExtractionOrchestrator.js - Form 5500 Data Processing

```javascript
const { manager: logger } = require('../utils/logger');

class DataExtractionOrchestrator {
  constructor() {
    this.portfolioRetriever = new PortfolioCompanyRetriever();
    this.form5500Searcher = new Form5500SearchService();
    this.dataAggregator = new DataAggregator();
    this.reportBuilder = new ReportBuilder();
    this.databaseManager = DatabaseManager.getInstance();
  }

  async extractDataForPipeline(pipelineExecutionId) {
    logger.info(`🔍 Starting data extraction for pipeline: ${pipelineExecutionId}`);
    
    const portfolioCompanies = await this.portfolioRetriever.getCompaniesByPipelineId(pipelineExecutionId);
    
    if (portfolioCompanies.length === 0) {
      return this.createEmptyExtractionResult('No portfolio companies found');
    }
    
    const searchResults = await this.searchForm5500DataForCompanies(portfolioCompanies);
    const aggregatedData = this.dataAggregator.groupByFirm(searchResults);
    const finalReport = await this.reportBuilder.buildFirmReports(aggregatedData);
    
    await this.persistExtractionResults(pipelineExecutionId, finalReport);
    
    logger.info(`✅ Data extraction completed for ${portfolioCompanies.length} companies`);
    return finalReport;
  }

  async searchForm5500DataForCompanies(companies) {
    logger.info(`📊 Searching Form 5500 data for ${companies.length} companies`);
    
    const searchResults = [];
    
    for (const company of companies) {
      const formData = await this.form5500Searcher.findDataForCompany(company);
      const enrichedResult = this.dataAggregator.enrichWithCompanyContext(formData, company);
      searchResults.push(enrichedResult);
    }
    
    return searchResults;
  }

  async getAllSavedResults() {
    logger.info('📋 Retrieving all saved workflow results');
    
    const results = await this.databaseManager.getAllWorkflowResults();
    
    logger.info(`📋 Found ${results.length} saved workflow results`);
    return results;
  }

  async persistExtractionResults(pipelineExecutionId, results) {
    await this.databaseManager.updatePipelineResults(pipelineExecutionId, results);
  }

  createEmptyExtractionResult(message) {
    return {
      success: false,
      message,
      timestamp: new Date().toISOString(),
      results: []
    };
  }
}

module.exports = DataExtractionOrchestrator;
```

---

## Supporting Classes

### Data Flow Management

```javascript
class DataFlowManager {
  prepareStageInput(stage, executionContext) {
    if (!stage.input_mapping) {
      return executionContext.initialData;
    }
    
    const mappedInput = {};
    for (const [stageKey, sourcePath] of Object.entries(stage.input_mapping)) {
      mappedInput[stageKey] = this.extractDataFromPath(sourcePath, executionContext);
    }
    
    return mappedInput;
  }

  prepareTaskInput(task, currentData) {
    const taskInput = {};
    
    for (const inputKey of task.inputKeys) {
      if (currentData[inputKey] !== undefined) {
        taskInput[inputKey] = currentData[inputKey];
      }
    }
    
    return taskInput;
  }

  updateDataWithTaskResult(currentData, task, taskResult) {
    return {
      ...currentData,
      [task.outputKey]: taskResult.result
    };
  }

  consolidateStageResults(stageResults, stageConfig) {
    const successful = stageResults.filter(r => r.success);
    const failed = stageResults.filter(r => !r.success);
    
    return {
      success: failed.length === 0,
      successCount: successful.length,
      failureCount: failed.length,
      outputData: successful.map(r => r.data),
      errors: failed.map(r => r.error)
    };
  }

  evaluateCondition(condition, executionContext) {
    // Simple condition evaluation - can be enhanced
    return eval(condition.replace(/(\w+)\.(\w+)/g, 'executionContext.stageResults["$1"]["$2"]'));
  }

  extractDataFromPath(path, executionContext) {
    const pathParts = path.split('.');
    let current = executionContext;
    
    for (const part of pathParts) {
      current = current[part];
      if (current === undefined) break;
    }
    
    return current;
  }
}

module.exports = DataFlowManager;
```

### Pipeline Configuration Loading

```javascript
class PipelineConfigLoader {
  async load(pipelineName) {
    const configPath = path.join(__dirname, '../json', `${pipelineName}.json`);
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData.workflow;
  }

  async loadWorkflowTasks(workflowFileName) {
    const workflowPath = path.join(__dirname, '../json', workflowFileName);
    const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    return workflowData.workflow.tasks;
  }

  async getStageConfig(stageName) {
    // Implementation to find stage configuration by name
    // This would search through available pipeline configs
    const availablePipelines = await this.getAllPipelineConfigs();
    
    for (const pipeline of availablePipelines) {
      const stage = pipeline.stages.find(s => s.name === stageName);
      if (stage) return stage;
    }
    
    throw new Error(`Stage not found: ${stageName}`);
  }

  async getAvailableStages() {
    const pipelines = await this.getAllPipelineConfigs();
    const stages = [];
    
    for (const pipeline of pipelines) {
      stages.push(...pipeline.stages.map(s => ({
        name: s.name,
        pipeline: pipeline.name,
        workflow_file: s.workflow_file
      })));
    }
    
    return stages;
  }
}

module.exports = PipelineConfigLoader;
```

---

## Testing Infrastructure

### HTTP Testing Endpoints

```javascript
// In routes/workflow.js

// Test individual stage with custom input
router.post('/test/stage/:stageName', async (req, res) => {
  try {
    const { stageName } = req.params;
    const { inputData } = req.body;
    
    const manager = new Manager();
    const result = await manager.testStage(stageName, inputData);
    
    res.json({
      success: true,
      stage: stageName,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test stage using output from previous pipeline run
router.post('/test/stage/:stageName/from-pipeline/:pipelineId', async (req, res) => {
  try {
    const { stageName, pipelineId } = req.params;
    const { fromStage } = req.body;
    
    const databaseManager = DatabaseManager.getInstance();
    const previousOutput = await databaseManager.getStageOutput(pipelineId, fromStage);
    
    const manager = new Manager();
    const result = await manager.testStage(stageName, previousOutput);
    
    res.json({
      success: true,
      stage: stageName,
      inputSource: `pipeline ${pipelineId}, stage ${fromStage}`,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false, 
      error: error.message
    });
  }
});

// List available stages for testing
router.get('/test/stages', async (req, res) => {
  try {
    const pipelineConfigLoader = new PipelineConfigLoader();
    const availableStages = await pipelineConfigLoader.getAvailableStages();
    
    res.json({
      success: true,
      stages: availableStages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent pipeline results for testing
router.get('/recent-pipelines', async (req, res) => {
  const databaseManager = DatabaseManager.getInstance();
  const recent = await databaseManager.query(`
    SELECT id, pipeline_name, status, created_at 
    FROM pipeline_executions 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  res.json(recent.rows);
});

// Get stage output for inspection
router.get('/pipeline/:id/stage/:stageName/output', async (req, res) => {
  const { id, stageName } = req.params;
  const databaseManager = DatabaseManager.getInstance();
  const output = await databaseManager.getStageOutput(id, stageName);
  res.json(output);
});
```

### Curl Testing Commands

```bash
# Test legal entity lookup stage with custom data
curl -X POST http://localhost:3000/api/workflow/test/stage/legal_entity_lookup \
  -H "Content-Type: application/json" \
  -d '{
    "inputData": {
      "American Discovery Capital": ["Company A", "Company B"]
    }
  }'

# Test company verification stage using output from a previous pipeline
curl -X POST http://localhost:3000/api/workflow/test/stage/company_verification/from-pipeline/123 \
  -H "Content-Type: application/json" \
  -d '{
    "fromStage": "portfolio_research"
  }'

# List all available stages
curl http://localhost:3000/api/workflow/test/stages

# Test portfolio research with single firm
curl -X POST http://localhost:3000/api/workflow/test/stage/portfolio_research \
  -H "Content-Type: application/json" \
  -d '{
    "inputData": ["American Discovery Capital"]
  }'

# Get recent pipeline executions
curl http://localhost:3000/api/workflow/recent-pipelines

# Get specific stage output
curl http://localhost:3000/api/workflow/pipeline/123/stage/portfolio_research/output
```

---

## Implementation Benefits

### 1. **Clean, Readable Code**
- Orchestrators read like plain English
- Complex logic hidden in focused utility classes
- Easy to understand data flow at a glance

### 2. **Flexible Workflow Composition**
- Support for conditional stage execution
- Direct data passing between stages
- Easy to add new workflows to existing pipelines

### 3. **Robust Testing**
- Individual stages can be tested in isolation
- Uses same production code paths
- Easy HTTP endpoints for development testing

### 4. **Failure Recovery**
- Intermediate results saved in database
- Can resume from any failed stage
- Clear audit trail of execution

### 5. **Maintainability**
- Single responsibility principle enforced
- Easy to modify individual components
- Clear separation between orchestration and implementation

### 6. **Extensibility**
- New stages can be added easily
- New pipelines can reuse existing stages
- Support for future features like parallel execution

---

## Migration Strategy

### Phase 1: Database Schema
1. Create new database tables
2. Migrate existing data to new structure
3. Update database connection classes

### Phase 2: Core Orchestrators
1. Implement PipelineOrchestrator
2. Implement TaskOrchestrator  
3. Implement DataExtractionOrchestrator
4. Update Manager class

### Phase 3: Supporting Classes
1. Implement DataFlowManager
2. Implement PipelineConfigLoader
3. Implement ExecutionTracker
4. Update utility classes

### Phase 4: Testing Infrastructure
1. Add testing endpoints
2. Create example curl commands
3. Add development utilities

### Phase 5: Integration & Testing
1. Test individual components
2. Integration testing
3. Performance validation
4. Production deployment

This refactoring will transform the codebase into a clean, maintainable, and extensible system that clearly expresses the application's business logic while hiding implementation complexity.