const { workflow: logger } = require('../utils/logger');
const TaskExecution = require('./TaskExecution');
const SaveTaskResults = require('./SaveTaskResults');
const DatabaseManager = require('../data-extraction/DatabaseManager');
const pollingService = require('../services/PollingService');

class WorkflowManager {
  constructor(toolManager) {
    this.currentIndex = 0;
    this.resultsSaver = new SaveTaskResults();
    this.toolManager = toolManager; // Use injected ToolManager
    this.databaseManager = DatabaseManager.getInstance();
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

  async executeWorkflow(workflowData, userInputs = {}, preGeneratedIds = null) {
    this.workflowData = workflowData;
    if (!this.workflowData) {
      throw new Error('workflorData must be provided to WorkflowManager');
    }

    if (!this.toolManager) {
      throw new Error('ToolManager must be provided to WorkflowManager');
    }
    
    this.tasks = workflowData.workflow.tasks;

    // userInputs.input is always an array
    const inputList = userInputs.input || [];
    const allResults = [];
    
    logger.info(`📋 Processing ${inputList.length} input(s) through ${this.getAllTasks().length} tasks\n`);
    
    for (let i = 0; i < inputList.length; i++) {
      const currentInput = inputList[i];
      logger.info(`\n🔄 Processing item ${i + 1}/${inputList.length}: ${currentInput}`);
      
      let workflowExecutionId;
      
      if (preGeneratedIds && preGeneratedIds.length > i) {
        // Use pre-generated ID and update status
        workflowExecutionId = preGeneratedIds[i];
        logger.info(`🆔 Using pre-generated workflow execution ID: ${workflowExecutionId}`);
        await this.databaseManager.query(
          'UPDATE workflow_executions SET status = $1 WHERE id = $2',
          ['running', workflowExecutionId]
        );
      } else {
        // Create new workflow execution record in database
        workflowExecutionId = await this.databaseManager.createWorkflowExecution(this.workflowData.workflow.name);
      }
      
      // Add polling message for workflow start
      pollingService.addMessage(workflowExecutionId, i, 'progress', `Starting research for ${currentInput}`);
      
      // Reset task index for each input
      this.reset();
      
      // Execute workflow for this single input
      const itemInputs = { input: currentInput };
      const taskResults = {};
      
      while (this.hasMoreTasks()) {
        const task = this.getNextTask();
        
        logger.info(`🎯 Executing Task ${task.id}: ${task.name}`);
        logger.info(`📝 Instructions: ${task.instructions}`);
        
        // Add polling message for task start
        pollingService.addMessage(workflowExecutionId, i, 'progress', `Task ${task.id}/${this.tasks.length}: ${task.name}`);
        
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
          const result = await execution.run(inputs);
          
          if (result.success) {
            logger.info(`✅ Task ${task.id} completed successfully`);
            logger.info(`📤 Output (${task.outputKey}): ${result.result}`);
            itemInputs[task.outputKey] = result.result;
            taskResults[task.id] = result;
            
            // Add polling message for task success
            pollingService.addMessage(workflowExecutionId, i, 'progress', `✅ Completed ${task.name}`);
          } else {
            logger.error(`❌ Task ${task.id} failed: ${result.error}`);
            taskResults[task.id] = result;
            
            // Add polling message for task failure
            pollingService.addMessage(workflowExecutionId, i, 'error', `❌ ${task.name} failed: ${result.error}`);
            break;
          }
        } catch (error) {
          logger.error(`💥 Task ${task.id} threw an error: ${error.message}`);
          
          // Add polling message for task exception
          pollingService.addMessage(workflowExecutionId, i, 'error', `💥 ${task.name} error: ${error.message}`);
          break;
        }
        
        logger.info(''); // Empty line for readability
      }
      
      allResults.push({
        itemIndex: i,
        input: currentInput,
        tasks: taskResults,
        workflowExecutionId: workflowExecutionId
      });
      
      // Add polling message for individual firm completion
      const completedTasks = Object.keys(taskResults).length;
      if (completedTasks === this.tasks.length) {
        pollingService.addMessage(workflowExecutionId, i, 'complete', `🎉 Research completed for ${currentInput}`);
      } else {
        pollingService.addMessage(workflowExecutionId, i, 'error', `⚠️ Research incomplete for ${currentInput} (${completedTasks}/${this.tasks.length} tasks)`);
      }
    }
    
    // Note: Results saving moved to Manager.js for better control over conversion
    // await this.resultsSaver.saveBatchResults(allResults);
    
    logger.info('🏁 Workflow execution completed');
    logger.info(`📊 Processed ${allResults.length} items`);
    
    return allResults;
  }

}

module.exports = WorkflowManager;