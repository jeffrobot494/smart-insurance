const { workflow: logger, temporary: tempLogger } = require('../utils/logger');
const ClaudeManager = require('../mcp/ClaudeManager');
const WorkflowAPIError = require('../ErrorHandling/WorkflowAPIError');

class TaskExecution {
  constructor(task) {
    this.task = task;
    this.allowedTools = task.allowed_tools || null;
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
      let consecutiveFailures = 0;
      const maxRetries = 3;
      
      // Main conversation loop - continues while Claude makes tool calls
      while (iterations < this.maxIterations) {
        try {
          // Simple error simulation for testing
          if (process.env.ERROR_SIMULATION === 'true') {
            throw new WorkflowAPIError({
              apiName: 'Claude API',
              originalError: new Error('credit balance low'),
              statusCode: 402,
              errorType: 'balance_low'
            });
          }
          
          // Log the full prompt being sent to Claude
          tempLogger.info(`🚀 PROMPT TO CLAUDE:\n${JSON.stringify(this.conversationHistory, null, 2)}`);
          
          // Send message to Claude with tools available
          const response = await this.claudeManager.sendMessage('', {
            conversationHistory: this.conversationHistory,
            maxTokens: 2048,
            temperature: 0.3,
            tools: this.getAvailableTools()
          });

          if (!response.success) {
            const claudeError = new Error(response.error);
            claudeError.type = response.errorType;
            
            throw new WorkflowAPIError({
              apiName: 'Claude API',
              originalError: claudeError,
              statusCode: response.status || response.error?.status, // Anthropic returns HTTP status codes
              errorType: 'llm_api_error'
            });
          }

          // Reset failure counter on success
          consecutiveFailures = 0;

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

        } catch (error) {
          consecutiveFailures++;
          logger.info(`⚠️ API call failed (attempt ${consecutiveFailures}/${maxRetries + 1}): ${error.message}`);
          
          if (consecutiveFailures > maxRetries) {
            throw error; // Max retries exceeded, propagate error
          }
          
          // Wait before retry with exponential backoff
          const delay = Math.pow(2, consecutiveFailures - 1) * 1000; // 1s, 2s, 4s
          logger.info(`🔄 Retrying in ${delay}ms...`);
          await this.sleep(delay);
          
          // Don't increment iterations on retry
          continue;
        }

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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        logger.info(`  🔧 Executing ${toolCall.name}...`);
        
        // Execute the tool (we'll need to implement tool execution)
        const result = await this.executeTool(toolCall.name, toolCall.input);
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result, null, 2)
        });
        
        logger.info(`  ✓ ${toolCall.name} completed`);
      } catch (error) {
        // Check if it's a WorkflowAPIError that should bubble up to Manager.js
        if (error.isWorkflowError) {
          throw error; // Let it bubble up to WorkflowManager, then to Manager.js
        }
        
        // Only convert non-API errors to tool results (programming errors, etc.)
        logger.error(`  ✗ ${toolCall.name} failed:`, error.message);
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
    
    // Validate tool is allowed if restrictions are in place
    if (this.allowedTools && !this.allowedTools.includes(toolName)) {
      throw new Error(`Tool '${toolName}' is not allowed for this task. Allowed tools: ${this.allowedTools.join(', ')}`);
    }
    
    return await this.toolManager.callTool(toolName, parameters);
  }

  getAvailableTools() {
    if (!this.toolManager) {
      return [];
    }
    
    const allTools = this.toolManager.getAvailableTools();
    
    // If no allowed_tools specified, return all tools (backward compatibility)
    if (!this.allowedTools || !Array.isArray(this.allowedTools)) {
      return allTools;
    }
    
    // Filter tools to only include allowed ones
    return allTools.filter(tool => this.allowedTools.includes(tool.name));
  }

  setToolManager(toolManager) {
    this.toolManager = toolManager;
  }
}

module.exports = TaskExecution;