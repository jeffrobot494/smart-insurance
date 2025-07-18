const TaskExecution = require('./TaskExecution');
const SaveTaskResults = require('./SaveTaskResults');
const DatabaseManager = require('../data-extraction/DatabaseManager');

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

  async executeWorkflow(workflowData, userInputs = {}) {
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
    
    console.log(`📋 Processing ${inputList.length} input(s) through ${this.getAllTasks().length} tasks\n`);
    
    for (let i = 0; i < inputList.length; i++) {
      const currentInput = inputList[i];
      console.log(`\n🔄 Processing item ${i + 1}/${inputList.length}: ${currentInput}`);
      
      // Create workflow execution record in database
      const workflowExecutionId = await this.databaseManager.createWorkflowExecution(this.workflowData.workflow.name);
      
      // Reset task index for each input
      this.reset();
      
      // Execute workflow for this single input
      const itemInputs = { input: currentInput };
      const taskResults = {};
      
      while (this.hasMoreTasks()) {
        const task = this.getNextTask();
        
        console.log(`🎯 Executing Task ${task.id}: ${task.name}`);
        console.log(`📝 Instructions: ${task.instructions}`);
        
        // Gather inputs for this task
        const inputs = {};
        task.inputKeys.forEach(key => {
          if (itemInputs[key]) {
            inputs[key] = itemInputs[key];
            console.log(`📥 Input ${key}: ${itemInputs[key]}`);
          }
        });
        
        try {
          const execution = new TaskExecution(task);
          execution.setToolManager(this.toolManager);
          const result = await execution.run(inputs);
          
          if (result.success) {
            console.log(`✅ Task ${task.id} completed successfully`);
            console.log(`📤 Output (${task.outputKey}): ${result.result}`);
            itemInputs[task.outputKey] = result.result;
            taskResults[task.id] = result;
          } else {
            console.error(`❌ Task ${task.id} failed: ${result.error}`);
            taskResults[task.id] = result;
            break;
          }
        } catch (error) {
          console.error(`💥 Task ${task.id} threw an error: ${error.message}`);
          break;
        }
        
        console.log(''); // Empty line for readability
      }
      
      allResults.push({
        itemIndex: i,
        input: currentInput,
        tasks: taskResults,
        workflowExecutionId: workflowExecutionId
      });
    }
    
    // Save all results at once
    await this.resultsSaver.saveBatchResults(allResults);
    
    console.log('🏁 Workflow execution completed');
    console.log(`📊 Processed ${allResults.length} items`);
    
    return allResults;
  }

}

module.exports = WorkflowManager;