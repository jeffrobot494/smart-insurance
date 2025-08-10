const { server: logger } = require('../utils/logger');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const TaskExecution = require('../workflow/TaskExecution');
const ToolManager = require('../workflow/ToolManager');

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
    
    // Return clean results
    res.json({
      success: true,
      results: results,
      metadata: {
        workflow_used: `${workflow}.json`,
        execution_time_ms: executionTime,
        companies_processed: input.length,
        timestamp: new Date().toISOString()
      }
    });
    
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
    
    // Parse JSON from Claude's response
    const parsedResult = parseJsonResult(taskResult.result);
    
    logger.info(`✅ Task completed successfully`);
    
    return parsedResult;
    
  } catch (error) {
    logger.error('❌ Isolated workflow execution failed:', error);
    throw error;
  }
}

/**
 * Parse JSON from Claude's text response, handling various formats
 */
function parseJsonResult(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return responseText; // Return as-is if not a string
  }
  
  try {
    // First try: parse the entire response as JSON
    return JSON.parse(responseText.trim());
  } catch (error) {
    // Second try: look for JSON in markdown code blocks
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                     responseText.match(/```\s*([\s\S]*?)\s*```/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (parseError) {
        logger.info('📝 Found code block but failed to parse as JSON');
      }
    }
    
    // Third try: look for JSON-like content between braces
    const braceMatch = responseText.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (parseError) {
        logger.info('📝 Found braces but failed to parse as JSON');
      }
    }
    
    // If all parsing attempts fail, return the original text
    logger.info('📝 Could not parse response as JSON, returning as text');
    return {
      raw_response: responseText,
      parsed: false,
      note: "Response could not be parsed as JSON"
    };
  }
}

module.exports = router;