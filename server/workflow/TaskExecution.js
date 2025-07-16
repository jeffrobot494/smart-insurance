const ClaudeManager = require('../ClaudeManager');

class TaskExecution {
  constructor(task) {
    this.task = task;
    this.claudeManager = new ClaudeManager();
    this.conversationHistory = [];
    this.status = 'pending';
    this.maxIterations = 10;
  }

  async run(inputs = {}) {
    try {
      this.status = 'running';
      
      // Build initial prompt
      let initialPrompt = this.task.instructions;
      
      if (Object.keys(inputs).length > 0) {
        initialPrompt += '\n\nInputs:\n';
        for (const [key, value] of Object.entries(inputs)) {
          initialPrompt += `${key}: ${value}\n`;
        }
      }

      // Start conversation
      this.conversationHistory.push({
        role: 'user',
        content: initialPrompt
      });

      let iterations = 0;
      
      // Main conversation loop - continues while Claude makes tool calls
      while (iterations < this.maxIterations) {
        // Send message to Claude with tools available
        const response = await this.claudeManager.sendMessage('', {
          conversationHistory: this.conversationHistory,
          maxTokens: 2048,
          temperature: 0.3,
          tools: this.getAvailableTools() // We'll need to add this
        });

        if (!response.success) {
          throw new Error(`Claude API error: ${response.error}`);
        }

        // Parse Claude's response for text and tool calls
        const { responseText, toolCalls } = this.parseClaudeResponse(response.content);

        // Add Claude's response to conversation
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content
        });

        // If no tool calls, task is complete
        if (toolCalls.length === 0) {
          this.status = 'completed';
          return {
            success: true,
            taskId: this.task.id,
            taskName: this.task.name,
            outputKey: this.task.outputKey,
            result: responseText,
            conversationHistory: this.conversationHistory
          };
        }

        // Execute tool calls
        const toolResults = await this.executeToolCalls(toolCalls);
        
        // Add tool results back to conversation
        this.conversationHistory.push({
          role: 'user',
          content: toolResults
        });

        iterations++;
      }

      // Max iterations reached
      this.status = 'failed';
      return {
        success: false,
        taskId: this.task.id,
        error: 'Maximum iterations reached',
        errorType: 'max_iterations'
      };

    } catch (error) {
      this.status = 'failed';
      return {
        success: false,
        taskId: this.task.id,
        error: error.message,
        errorType: 'execution_error'
      };
    }
  }

  parseClaudeResponse(content) {
    let responseText = '';
    let toolCalls = [];

    // Handle both string content and structured content
    if (typeof content === 'string') {
      responseText = content;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          responseText += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push(block);
        }
      }
    }

    return { responseText, toolCalls };
  }

  async executeToolCalls(toolCalls) {
    const toolResults = [];

    for (const toolCall of toolCalls) {
      try {
        console.log(`  🔧 Executing ${toolCall.name}...`);
        
        // Execute the tool (we'll need to implement tool execution)
        const result = await this.executeTool(toolCall.name, toolCall.input);
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result, null, 2)
        });
        
        console.log(`  ✓ ${toolCall.name} completed`);
      } catch (error) {
        console.error(`  ✗ ${toolCall.name} failed:`, error.message);
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: `Error: ${error.message}`,
          is_error: true
        });
      }
    }

    return toolResults;
  }

  async executeTool(toolName, parameters) {
    if (!this.toolManager) {
      throw new Error('ToolManager not available. Ensure TaskExecution is configured with a ToolManager.');
    }
    
    return await this.toolManager.callTool(toolName, parameters);
  }

  getAvailableTools() {
    if (!this.toolManager) {
      return [];
    }
    
    return this.toolManager.getAvailableTools();
  }

  setToolManager(toolManager) {
    this.toolManager = toolManager;
  }
}

module.exports = TaskExecution;