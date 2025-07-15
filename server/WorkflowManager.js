const TaskExecution = require('./TaskExecution');
const SaveTaskResults = require('./SaveTaskResults');
const MCPServerManager = require('./MCPServerManager');
const ToolManager = require('./ToolManager');

class WorkflowManager {
  constructor(workflowData) {
    this.workflowData = workflowData;
    this.tasks = workflowData.workflow.tasks;
    this.currentIndex = 0;
    this.resultsSaver = new SaveTaskResults();
    
    // Initialize MCP servers and tool manager
    this.mcpServerManager = null;
    this.toolManager = null;
  }

  async initializeTools() {
    if (!this.mcpServerManager) {
      this.mcpServerManager = new MCPServerManager();
      await this.mcpServerManager.initialize();
      this.toolManager = new ToolManager(this.mcpServerManager);
    }
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

  async executeWorkflow(userInputs = {}) {
    await this.initializeTools();
    
    // userInputs.input is always an array
    const inputList = userInputs.input || [];
    const allResults = [];
    
    console.log(`📋 Processing ${inputList.length} input(s) through ${this.getAllTasks().length} tasks\n`);
    
    for (let i = 0; i < inputList.length; i++) {
      const currentInput = inputList[i];
      console.log(`\n🔄 Processing item ${i + 1}/${inputList.length}: ${currentInput}`);
      
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
        tasks: taskResults
      });
    }
    
    // Save all results at once
    this.resultsSaver.saveBatchResults(allResults);
    
    console.log('🏁 Workflow execution completed');
    console.log(`📊 Processed ${allResults.length} items`);
    
    return allResults;
  }

  cleanup() {
    if (this.mcpServerManager) {
      this.mcpServerManager.cleanup();
    }
  }
}

module.exports = WorkflowManager;