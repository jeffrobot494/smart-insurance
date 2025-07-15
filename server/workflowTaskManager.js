const TaskExecution = require('./TaskExecution');
const SaveTaskResults = require('./SaveTaskResults');

class WorkflowTaskManager {
  constructor(workflowData) {
    this.workflowData = workflowData;
    this.tasks = workflowData.workflow.tasks;
    this.currentIndex = 0;
    this.resultsSaver = new SaveTaskResults();
    
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
    // Initialize results with user inputs so first task can access them
    const results = { ...userInputs };
    
    console.log(`📋 Found ${this.getAllTasks().length} tasks to execute\n`);
    
    // Loop through all tasks in the workflow
    while (this.hasMoreTasks()) {
      const task = this.getNextTask();
      
      console.log(`🎯 Executing Task ${task.id}: ${task.name}`);
      console.log(`📝 Instructions: ${task.instructions}`);
      
      // Gather inputs for this task from previous results
      const inputs = {};
      task.inputKeys.forEach(key => {
        if (results[key]) {
          inputs[key] = results[key];
          console.log(`📥 Input ${key}: ${results[key]}`);
        }
      });
      
      try {
        // Create and run TaskExecution
        const execution = new TaskExecution(task);
        const result = await execution.run(inputs);
        
        if (result.success) {
          console.log(`✅ Task ${task.id} completed successfully`);
          console.log(`📤 Output (${task.outputKey}): ${result.result}`);
          
          // Store result for future tasks
          results[task.outputKey] = result.result;
          
          // Save individual task result
          this.resultsSaver.saveTaskResults(task.id, result);
        } else {
          console.error(`❌ Task ${task.id} failed: ${result.error}`);
          console.log('🛑 Stopping workflow execution due to task failure');
          break;
        }
        
      } catch (error) {
        console.error(`💥 Task ${task.id} threw an error: ${error.message}`);
        console.log('🛑 Stopping workflow execution due to error');
        break;
      }
      
      console.log(''); // Empty line for readability
    }
    
    console.log('🏁 Workflow execution completed');
    console.log('📊 Final results:', results);
    
    return results;
  }
}

module.exports = WorkflowTaskManager;