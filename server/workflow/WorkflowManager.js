const { workflow: logger } = require('../utils/logger');
const TaskExecution = require('./TaskExecution');

class WorkflowManager {
  constructor(toolManager) {
    this.currentIndex = 0;
    this.toolManager = toolManager; // Use injected ToolManager
  }


  getCurrentTask() {
    if (this.currentIndex < this.tasks.length) {
      return this.tasks[this.currentIndex];
    }
    return null;
  }

  getNextTask() {
    if (this.currentIndex < this.tasks.length) {
      const task = this.tasks[this.currentIndex];
      this.currentIndex++;
      return task;
    }
    return null;
  }

  getAllTasks(){
    return this.tasks;
  }

  hasMoreTasks() {
    return this.currentIndex < this.tasks.length;
  }

  reset() {
    this.currentIndex = 0;
  }

  async executeWorkflow(workflowData, userInput, pipelineId = null) {
    this.workflowData = workflowData;
    if (!this.workflowData) {
      throw new Error('workflowData must be provided to WorkflowManager');
    }

    if (!this.toolManager) {
      throw new Error('ToolManager must be provided to WorkflowManager');
    }
    
    this.tasks = workflowData.workflow.tasks;

    // userInput is now a single value, not an array
    const currentInput = userInput.input;
    if (!currentInput) {
      throw new Error('input is required');
    }
    
    logger.info(`📋 Processing single input: ${currentInput}`);
    
    // Reset task index for execution
    this.reset();
    
    // Execute workflow for this single input
    const itemInputs = { input: currentInput };
    const taskResults = {};
    let output = null;
    
    while (this.hasMoreTasks()) {
      const task = this.getNextTask();
      
      logger.info(`🎯 Executing Task ${task.id}: ${task.name}`);
      
      // Gather inputs for this task
      const inputs = {};
      task.inputKeys.forEach(key => {
        if (itemInputs[key]) {
          inputs[key] = itemInputs[key];
          logger.info(`📥 Input ${key}: ${itemInputs[key]}`);
        }
      });
      
      try {
        const execution = new TaskExecution(task);
        execution.setToolManager(this.toolManager);
        
        const result = await execution.run(inputs, pipelineId);
        
        if (result.success) {
          logger.info(`✅ Task ${task.id} completed successfully`);
          logger.info(`📤 Output (${task.outputKey}): ${result.result}`);
          itemInputs[task.outputKey] = result.result;
          taskResults[task.id] = result;
          
          // Check if this is the last task and set output
          if (!this.hasMoreTasks()) {
            output = result.result;
          }
        } else {
          logger.error(`❌ Task ${task.id} failed: ${result.error}`);
          taskResults[task.id] = result;
          break;
        }
      } catch (error) {
        // Check if it's a WorkflowAPIError that should bubble up to Manager.js
        if (error.isWorkflowError) {
          throw error; // Let it bubble up to Manager.js
        }
        
        // Only log and break for non-API errors (programming errors, etc.)
        logger.error(`💥 Task ${task.id} threw an error: ${error.message}`);
        break;
      }
      
      logger.info(''); // Empty line for readability
    }
    
    // Return single result object instead of array
    const result = {
      workflow_name: workflowData.workflow.name,
      input: currentInput,
      output: output,
      tasks: taskResults,
      pipelineId: pipelineId || null
    };
    
    logger.info('🏁 Workflow execution completed');
    
    return result; // Single result object, not array
  }

}

module.exports = WorkflowManager;