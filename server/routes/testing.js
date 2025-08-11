const { server: logger } = require('../utils/logger');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const TaskExecution = require('../workflow/TaskExecution');
const ToolManager = require('../workflow/ToolManager');
const WorkflowManager = require('../workflow/WorkflowManager');
const F5500TestClaudeResponseParser = require('../utils/F5500TestClaudeResponseParser');

// POST /api/testing/legal-entity-resolution
router.post('/legal-entity-resolution', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { input, workflow = 'test_name_resolution' } = req.body;
    
    // Validate input
    if (!input || !Array.isArray(input) || input.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'companies array is required and must not be empty'
      });
    }
    
    logger.info(`🧪 Testing legal entity resolution for ${input.length} companies using ${workflow} workflow`);
    
    // Execute isolated workflow test
    const results = await executeIsolatedWorkflowTest(workflow, input);
    
    const executionTime = Date.now() - startTime;
    
    // Return clean results with pretty formatting
    const response = {
      success: true,
      results: results,
      metadata: {
        workflow_used: `${workflow}.json`,
        execution_time_ms: executionTime,
        companies_processed: input.length,
        timestamp: new Date().toISOString()
      }
    };
    
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(response, null, 2));
    
  } catch (error) {
    logger.error('❌ Legal entity resolution test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    });
  }
});

/**
 * Execute workflow test in isolation without database persistence or portfolio extraction
 */
async function executeIsolatedWorkflowTest(workflowName, companies) {
  try {
    // Load workflow definition
    const workflowFile = workflowName.endsWith('.json') ? workflowName : `${workflowName}.json`;
    const workflowPath = path.join(__dirname, '../json', workflowFile);
    
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow file not found: ${workflowFile}`);
    }
    
    const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const workflow = workflowData.workflow;
    
    if (!workflow || !workflow.tasks || workflow.tasks.length === 0) {
      throw new Error('Invalid workflow structure');
    }
    
    logger.info(`📋 Loaded workflow: ${workflow.name} with ${workflow.tasks.length} tasks`);
    
    // Get the global tool manager (already initialized by server.js)
    const { getToolManager } = require('../server');
    const toolManager = getToolManager();
    
    if (!toolManager) {
      throw new Error('Tool manager not available - MCP servers may not be initialized');
    }
    
    // Execute first task (assuming single task for testing workflows)
    const task = workflow.tasks[0];
    const taskExecution = new TaskExecution(task);
    taskExecution.setToolManager(toolManager);
    
    logger.info(`🏃 Executing task: ${task.name}`);
    
    // Prepare input based on task's inputKeys
    const taskInput = {};
    if (task.inputKeys && task.inputKeys.includes('companies')) {
      taskInput.companies = companies;
    }
    if (task.inputKeys && task.inputKeys.includes('input')) {
      taskInput.input = companies.join(', ');
    }
    
    // Execute task
    const taskResult = await taskExecution.run(taskInput);
    
    if (!taskResult.success) {
      throw new Error(`Task execution failed: ${taskResult.error}`);
    }
    
    // Debug: Log the full task result structure
    logger.info(`🔍 Full task result: ${JSON.stringify(taskResult, null, 2)}`);
    
    // Parse JSON from Claude's response using the dedicated parser
    const parsedResult = F5500TestClaudeResponseParser.parseResult(taskResult.result, taskResult);
    
    logger.info(`🔍 Parsed result: ${JSON.stringify(parsedResult)}`);
    logger.info(`✅ Task completed successfully`);
    
    return parsedResult;
    
  } catch (error) {
    logger.error('❌ Isolated workflow execution failed:', error);
    throw error;
  }
}

// POST /api/testing/full-workflow
router.post('/full-workflow', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { companies, firmName, workflow = 'portfolio_company_verification' } = req.body;
    
    // Validate input
    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'companies array is required and must not be empty'
      });
    }
    
    if (!firmName || typeof firmName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'firmName string is required'
      });
    }
    
    logger.info(`🧪 Testing full workflow: ${workflow} for ${companies.length} companies from ${firmName}`);
    
    // Execute full multi-task workflow using WorkflowManager directly
    const results = await executeFullWorkflowTestDirect(workflow, companies, firmName);
    
    const executionTime = Date.now() - startTime;
    
    // Return clean results with pretty formatting
    const response = {
      success: true,
      results: results,
      metadata: {
        workflow_used: `${workflow}.json`,
        execution_time_ms: executionTime,
        companies_processed: companies.length,
        firm_name: firmName,
        timestamp: new Date().toISOString()
      }
    };
    
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(response, null, 2));
    
  } catch (error) {
    logger.error('❌ Full workflow test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    });
  }
});

/**
 * Execute full multi-task workflow using WorkflowManager directly (no database persistence or data extraction)
 */
async function executeFullWorkflowTestDirect(workflowName, companies, firmName) {
  try {
    // Load workflow definition
    const workflowFile = workflowName.endsWith('.json') ? workflowName : `${workflowName}.json`;
    const workflowPath = path.join(__dirname, '../json', workflowFile);
    
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow file not found: ${workflowFile}`);
    }
    
    const workflowData = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const workflow = workflowData.workflow;
    
    if (!workflow || !workflow.tasks || workflow.tasks.length === 0) {
      throw new Error('Invalid workflow structure');
    }
    
    logger.info(`📋 Loaded workflow: ${workflow.name} with ${workflow.tasks.length} tasks`);
    
    // Get the global tool manager
    const { getToolManager } = require('../server');
    const toolManager = getToolManager();
    
    if (!toolManager) {
      throw new Error('Tool manager not available - MCP servers may not be initialized');
    }
    
    // Create WorkflowManager instance
    const workflowManager = new WorkflowManager(toolManager);
    
    // Create input array in the format: "Firm: [PE Firm], Company: [Company Name]"
    const inputArray = companies.map(company => `Firm: ${firmName}, Company: ${company}`);
    
    logger.info(`📝 Created input array with ${inputArray.length} items`);
    
    // Prepare userInputs in WorkflowManager format
    const userInputs = {
      input: inputArray
    };
    
    logger.info(`🏃 Executing workflow directly with WorkflowManager for ${companies.length} companies`);
    
    // Execute workflow directly without database persistence or data extraction
    const results = await workflowManager.executeWorkflow(workflowData, userInputs);
    
    logger.info(`✅ Full workflow completed successfully`);
    logger.info(`📊 Results: ${results.length} workflow executions completed`);
    
    return results;
    
  } catch (error) {
    logger.error('❌ Direct workflow execution failed:', error);
    throw error;
  }
}

module.exports = router;