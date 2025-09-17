const { workflow: logger, temporary: tempLogger } = require('../utils/logger');
const ClaudeManager = require('../mcp/ClaudeManager');
const WorkflowAPIError = require('../ErrorHandling/WorkflowAPIError');
const WorkflowCancellationManager = require('../ErrorHandling/WorkflowCancellationManager');
const WorkflowCancelled = require('../ErrorHandling/WorkflowCancelled');

class TaskExecution {
  constructor(task) {
    this.task = task;
    this.allowedTools = task.allowed_tools || null;
    this.claudeManager = new ClaudeManager();
    this.conversationHistory = [];
    this.status = 'pending';
    this.maxIterations = task.maxIterations || 11;
    this.cancellationManager = WorkflowCancellationManager.getInstance();
    this.pipelineId = null; // Set during run()
  }

  /**
   * Check if workflow is cancelled and throw error if so
   */
  checkCancellation() {
    if (this.pipelineId && this.cancellationManager.isCancelled(this.pipelineId)) {
      logger.info(`🛑 Workflow cancelled for pipeline ${this.pipelineId} - terminating task execution`);
      throw new WorkflowCancelled(this.pipelineId, 'user_requested');
    }
  }

  async run(inputs = {}, pipelineId = null) {
    try {
      this.status = 'running';
      this.pipelineId = pipelineId; // Store for cancellation checks

      // Check for cancellation before starting
      this.checkCancellation();
      
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
          // Add iteration context before each Claude call (except the first)
          if (iterations > 0) {
            const remainingIterations = this.maxIterations - iterations - 1;
            const iterationContext = `\n[SYSTEM: This is tool call iteration ${iterations + 1} of ${this.maxIterations}. You have ${remainingIterations} more iterations remaining. If you're close to the limit, ensure your next response provides a complete final answer rather than making more tool calls.]`;
            
            // Add as a user message to maintain conversation flow
            this.conversationHistory.push({
              role: 'user',
              content: iterationContext
            });
          }
          
          // Simple error simulation for testing
          if (process.env.ERROR_SIMULATION_ANTHROPIC === 'true') {
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

          // Check for cancellation after receiving Claude's response
          this.checkCancellation();

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

          // Check for cancellation after tool execution
          this.checkCancellation();

          // Add tool results back to conversation
          this.conversationHistory.push({
            role: 'user',
            content: toolResults
          });

        } catch (error) {
          // Check if it's a WorkflowCancelled error - these should NOT be retried
          if (error.isWorkflowCancelled) {
            logger.info(`WorkflowCancelled detected - no retries, bubbling up: ${error.message}`);
            throw error; // Bubble up immediately - don't retry cancellation
          }

          // Check if it's a WorkflowAPIError - these should NOT be retried
          if (error.isWorkflowError) {
            logger.info(`WorkflowAPIError detected - no retries, bubbling up: ${error.message}`);
            throw error; // Bubble up immediately - don't retry API credit/auth issues
          }
          
          // Only retry transient errors (network, temporary server issues, etc.)
          consecutiveFailures++;
          logger.info(`⚠️ API call failed (attempt ${consecutiveFailures}/${maxRetries + 1}): ${error.message}`);
          
          if (consecutiveFailures > maxRetries) {
            logger.error(`Max retries exceeded for transient error, re-throwing: ${error.message}`);
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
      // Check if it's a WorkflowAPIError that should bubble up to Manager.js
      if (error.isWorkflowError) {
        // Don't set status to 'failed' - this isn't a TaskExecution failure
        throw error; // Let it bubble up to WorkflowManager, then to Manager.js
      }
      
      // Only handle non-API errors (programming errors, etc.)
      this.status = 'failed'; // Only set failed status for actual TaskExecution failures
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
        logger.info(`  🔧 Executing ${toolCall.name} with params: ${JSON.stringify(toolCall.input)}`);
        
        // Execute the tool (we'll need to implement tool execution)
        const result = await this.executeTool(toolCall.name, toolCall.input);
        
        // Handle MCP response format - extract text content if it's wrapped
        let content;
        if (result && result.content && Array.isArray(result.content) && result.content[0] && result.content[0].text) {
          // MCP response format: extract the text directly
          content = result.content[0].text;
        } else {
          // Regular result: stringify it
          content = JSON.stringify(result);
        }
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: content
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