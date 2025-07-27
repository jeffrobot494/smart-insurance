# Claude Conversation Loop Requirements and Design

## Executive Summary

The Claude conversation loop is the foundational building block of the Smart Insurance application. This document outlines the comprehensive requirements and design for building a robust, flexible, and maintainable Claude conversation management system.

As identified during the refactoring analysis, the Claude conversation loop represents the core business value of the application. While other components like the database, frontend, and workflows are important infrastructure, they all exist to support and enhance the fundamental capability of interacting with Claude to extract meaningful information from unstructured data sources.

## Core Philosophy

### Why Claude Loop is the Foundation

The Claude conversation loop is the "atom" of our application because:

1. **Business Value Core**: All meaningful work in the application happens through Claude interactions
2. **Independence**: Can be developed and tested without any other application components
3. **Universal Dependency**: Every other component in the system depends on this working correctly
4. **Failure Point**: If Claude interactions are unreliable, the entire application fails
5. **Iteration Speed**: Direct testing of Claude interactions provides fastest development feedback

### Development Approach

Start with the Claude conversation loop as a standalone, perfectly functioning component:
- Test directly with console output
- Validate prompts and tool usage without database dependencies
- Ensure rock-solid reliability before adding complexity
- Build thin layers around the core conversation capability

Once the Claude loop is robust, all other components become simple wrappers:
- **TaskOrchestrator**: Adds retry logic around Claude conversations
- **WorkflowManager**: Chains multiple Claude conversations together
- **DatabaseManager**: Persists Claude's outputs
- **Frontend**: Displays Claude's results

---

## Comprehensive Requirements Analysis

### 1. Core Conversation Flow Requirements

#### Message Exchange
- **Bidirectional Communication**: Send user messages, receive Claude responses
- **Conversation Context**: Maintain full conversation history for Claude
- **Message Formatting**: Proper API message structure with roles (user/assistant)
- **Streaming Support**: Handle both streaming and non-streaming responses

#### Tool Call Detection and Execution
- **Tool Call Parsing**: Detect when Claude wants to use tools vs. providing final answers
- **Tool Call Validation**: Verify tool calls have proper parameters before execution
- **Tool Result Processing**: Format tool results appropriately for Claude consumption
- **Parallel Tool Execution**: Handle multiple simultaneous tool calls efficiently

#### Conversation State Management
- **Continuation Logic**: Determine when to continue conversation vs. when task is complete
- **State Tracking**: Track conversation progress, current task, available tools
- **Termination Conditions**: Recognize completion, failure, or stuck states
- **Context Preservation**: Maintain conversation coherence across multiple exchanges

### 2. Error Handling and Resilience Requirements

#### API Failure Handling
- **Network Resilience**: Handle network timeouts, connection failures
- **Service Downtime**: Graceful handling of Anthropic API unavailability
- **Rate Limiting**: Respect and handle API rate limit responses
- **Authentication Errors**: Handle invalid API keys, expired tokens

#### Tool Execution Error Management
- **Tool Failures**: Continue conversation when individual tools fail
- **Invalid Parameters**: Provide helpful feedback when tool calls are malformed
- **Tool Timeouts**: Handle tools that hang or take too long to respond
- **Missing Tools**: Handle requests for unavailable tools gracefully

#### Retry and Recovery Logic
- **Exponential Backoff**: Intelligent retry timing for API failures
- **Max Retry Limits**: Prevent infinite retry loops
- **Selective Retries**: Distinguish between retryable and permanent failures
- **Conversation Recovery**: Resume conversations after mid-stream failures

#### Response Processing Errors
- **Malformed Responses**: Handle unexpected API response formats
- **Parsing Failures**: Graceful handling of unparseable tool calls or content
- **Empty Responses**: Handle cases where Claude returns no content
- **Context Limit Errors**: Handle token limit exceeded scenarios

### 3. Resource Management Requirements

#### Token Management
- **Token Tracking**: Monitor input and output token usage per conversation
- **Context Limits**: Stay within Claude's context window limits
- **Token Estimation**: Estimate token usage before sending requests
- **Cost Tracking**: Track API usage costs for budgeting and monitoring

#### Rate Limiting and Throttling
- **API Rate Limits**: Respect Anthropic's requests per minute limits
- **Concurrent Request Management**: Limit simultaneous API calls
- **Queue Management**: Queue requests when rate limits are approached
- **Backpressure Handling**: Gracefully handle request backlog

#### Memory and Performance
- **Memory Management**: Handle long conversations without memory leaks
- **Conversation Cleanup**: Release resources when conversations complete
- **Performance Monitoring**: Track response times and throughput
- **Resource Limits**: Set maximum conversation length and duration

#### Timeout Controls
- **Request Timeouts**: Maximum time to wait for API responses
- **Tool Execution Timeouts**: Maximum time for individual tool execution
- **Conversation Timeouts**: Maximum total time for task completion
- **Graceful Timeout Handling**: Clean termination when timeouts occur

### 4. Advanced Conversation Management

#### Flexible Input Processing
- **Multiple Input Formats**: Handle strings, arrays, objects, mixed data types
- **Input Normalization**: Convert various input formats to standard structure
- **Input Validation**: Verify inputs meet task requirements
- **Dynamic Input Adaptation**: Adjust conversation based on input characteristics

Examples of supported input formats:
```javascript
// Single string
"Blackstone"

// Array of strings  
["Blackstone", "KKR", "Apollo"]

// Object with context
{ firmName: "Blackstone", sector: "technology" }

// Array of arrays (firm and context pairs)
[["Blackstone", "private equity"], ["KKR", "buyout firm"]]

// Mixed format
{
  firms: ["Blackstone", "KKR"],
  constraints: "technology sector only",
  outputFormat: "domain_only"
}
```

#### Intelligent Response Classification
- **Response Type Detection**: Distinguish between answers, questions, clarifications, failures
- **Answer Quality Assessment**: Evaluate completeness and correctness of responses
- **Question Handling**: Recognize when Claude asks questions back to the user
- **Failure Recognition**: Detect when Claude admits inability to complete task

Response classification categories:
- **Final Answer**: Claude provides a complete response to the task
- **Question**: Claude asks for clarification or additional information
- **Clarification Request**: Claude needs more context to proceed
- **Failure Admission**: Claude explicitly states inability to complete task
- **Partial Answer**: Claude provides incomplete but useful information
- **Malformed Response**: Response doesn't fit expected patterns

#### Context Management and Optimization
- **Context Pruning**: Remove old messages when approaching token limits
- **Important Message Preservation**: Keep task instructions and key examples
- **Context Summarization**: Compress conversation history when needed
- **Context Window Optimization**: Maximize use of available context space

### 5. Task Configuration and Customization

#### Detailed Task Instructions
- **Clear Objectives**: Specific, unambiguous task descriptions
- **Step-by-Step Guidance**: Detailed process instructions for Claude
- **Context Setting**: Background information and constraints
- **Success Criteria**: Clear definition of successful task completion

#### Examples and Training Data
- **Positive Examples**: Demonstrations of correct task completion
- **Negative Examples**: Examples of what not to do
- **Edge Case Examples**: Handle unusual or difficult scenarios
- **Format Examples**: Show expected output structure and style

#### Tool Integration
- **Tool Descriptions**: Detailed documentation of available tools
- **Tool Usage Examples**: Demonstrate proper tool calling patterns
- **Tool Limitations**: Explain what each tool can and cannot do
- **Tool Selection Guidance**: Help Claude choose appropriate tools

#### Output Formatting and Validation
- **Format Specifications**: Exact requirements for output structure
- **Validation Rules**: Automated checks for output correctness
- **Format Examples**: Multiple examples of properly formatted output
- **Error Feedback**: Specific guidance when output format is incorrect

### 6. Testing and Development Support

#### Rapid Testing Infrastructure
- **Quick Test Setup**: Minimal configuration needed to test conversations
- **Batch Testing**: Run multiple test cases simultaneously
- **Test Result Comparison**: Automated comparison with expected results
- **Regression Testing**: Ensure changes don't break existing functionality

#### Test Suite Management
- **Test Organization**: Group related tests into suites
- **Test Parameterization**: Run same test with different inputs
- **Test Data Management**: Organize and maintain test datasets
- **Test Result Tracking**: Historical view of test performance

#### Development Tools
- **Conversation Replay**: Re-run saved conversations for debugging
- **Mock Tool Responses**: Test with simulated tool data
- **Dry Run Mode**: Test conversation flow without executing tools
- **Interactive Testing**: Manual conversation testing interface

### 7. Logging and Monitoring Requirements

#### Comprehensive Logging
- **Conversation Logging**: Complete record of all interactions
- **Performance Logging**: Response times, token usage, success rates
- **Error Logging**: Detailed error information with context
- **Audit Logging**: Track who initiated what tasks when

#### Log File Management
- **Structured Logging**: JSON format for easy parsing and analysis
- **Log Rotation**: Prevent log files from growing too large
- **Log Retention**: Configurable retention periods for different log types
- **Log Searchability**: Easy searching and filtering of log data

#### Monitoring and Alerting
- **Performance Monitoring**: Track key metrics like success rate and response time
- **Error Rate Monitoring**: Alert when error rates exceed thresholds
- **Cost Monitoring**: Track API usage costs and budget alerts
- **Capacity Monitoring**: Monitor resource usage and scaling needs

### 8. Model Management and Configuration

#### Multi-Model Support
- **Model Selection**: Easy switching between different Claude models
- **Task-Specific Models**: Configure different models for different task types
- **Model Performance Tracking**: Compare performance across models
- **Model Fallback**: Automatic fallback when preferred model unavailable

#### Model Configuration
- **Temperature Control**: Adjust randomness for different task types
- **Token Limits**: Configure max tokens per model type
- **Stop Sequences**: Custom stop sequences for different tasks
- **System Prompts**: Model-specific system prompt optimization

### 9. Security and Safety Requirements

#### Input Sanitization
- **Prompt Injection Prevention**: Protect against malicious prompt manipulation
- **Input Validation**: Verify inputs are safe and expected
- **Content Filtering**: Block inappropriate or dangerous content
- **Escape Sequence Handling**: Properly handle special characters

#### Tool Security
- **Tool Sandboxing**: Limit tool access to safe operations only
- **Permission Management**: Control which tools are available for which tasks
- **Audit Trail**: Log all tool executions for security review
- **Safe Defaults**: Fail safely when security checks fail

#### Data Protection
- **Sensitive Data Handling**: Avoid logging secrets, personal information
- **Data Encryption**: Encrypt sensitive data in logs and storage
- **Access Control**: Restrict access to conversation logs and data
- **Data Retention**: Automatic cleanup of sensitive conversation data

---

## Detailed Design Specifications

### Core ConversationManager Class Structure

```javascript
class ConversationManager {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 100000,
      maxTries: config.maxTries || 3,
      timeout: config.timeout || 30000,
      model: config.model || 'claude-3-5-sonnet-20241022',
      temperature: config.temperature || 0.3,
      ...config
    };
    
    this.inputProcessor = new InputProcessor();
    this.responseClassifier = new ResponseClassifier();
    this.answerValidator = new AnswerValidator();
    this.contextManager = new ContextManager(this.config.maxTokens);
    this.toolManager = new ToolManager();
    this.logger = new ConversationLogger();
    this.tokenTracker = new TokenTracker();
  }

  async executeTask(taskConfig, inputs) {
    const conversationId = this.generateConversationId();
    const normalizedInputs = this.inputProcessor.normalizeInputs(inputs);
    
    try {
      return await this.runConversationLoop(taskConfig, normalizedInputs, conversationId);
    } catch (error) {
      await this.logger.logError(conversationId, error);
      throw error;
    }
  }

  async runConversationLoop(taskConfig, inputs, conversationId) {
    const conversation = this.contextManager.startNewConversation(taskConfig, inputs);
    let attempts = 0;
    
    while (attempts < taskConfig.maxTries) {
      attempts++;
      
      try {
        const result = await this.attemptTaskCompletion(conversation, taskConfig, attempts);
        
        if (result.success) {
          await this.logger.logSuccess(conversationId, result);
          return result;
        }
        
        // Handle various failure scenarios
        if (result.type === 'validation_failure') {
          this.contextManager.addValidationFeedback(conversation, result.feedback);
          continue;
        }
        
        if (result.type === 'question') {
          const answer = await this.handleUserQuestion(result.question);
          this.contextManager.addUserAnswer(conversation, answer);
          continue; // Don't count questions as attempts
        }
        
        if (result.type === 'failure_admission' || attempts >= taskConfig.maxTries) {
          return this.createFailureResult(result, attempts);
        }
        
      } catch (error) {
        if (this.isRetryableError(error) && attempts < taskConfig.maxTries) {
          await this.handleRetryableError(error, attempts);
          continue;
        }
        throw error;
      }
    }
    
    return this.createMaxAttemptsResult(attempts);
  }
}
```

### Input Processing System

```javascript
class InputProcessor {
  normalizeInputs(rawInputs) {
    if (typeof rawInputs === 'string') {
      return { type: 'single_string', data: rawInputs };
    }
    
    if (Array.isArray(rawInputs)) {
      if (rawInputs.length === 0) {
        throw new Error('Empty input array provided');
      }
      
      // Check if it's an array of arrays (paired data)
      if (Array.isArray(rawInputs[0])) {
        return { 
          type: 'paired_arrays', 
          data: rawInputs.map(pair => ({ primary: pair[0], secondary: pair[1] }))
        };
      }
      
      // Simple array of strings
      return { type: 'string_array', data: rawInputs };
    }
    
    if (typeof rawInputs === 'object' && rawInputs !== null) {
      return { type: 'structured_object', data: rawInputs };
    }
    
    throw new Error(`Unsupported input type: ${typeof rawInputs}`);
  }

  formatInputsForPrompt(normalizedInputs, taskConfig) {
    const { type, data } = normalizedInputs;
    
    switch (type) {
      case 'single_string':
        return `Input: ${data}`;
        
      case 'string_array':
        return `Inputs:\n${data.map((item, i) => `${i + 1}. ${item}`).join('\n')}`;
        
      case 'paired_arrays':
        return `Inputs:\n${data.map((pair, i) => 
          `${i + 1}. ${pair.primary} (${pair.secondary})`
        ).join('\n')}`;
        
      case 'structured_object':
        return `Input Data:\n${JSON.stringify(data, null, 2)}`;
        
      default:
        throw new Error(`Unknown input type: ${type}`);
    }
  }
}
```

### Response Classification and Validation

```javascript
class ResponseClassifier {
  classifyResponse(claudeResponse, taskConfig) {
    const content = this.extractContent(claudeResponse);
    
    // Check for questions directed at the user
    if (this.isQuestion(content)) {
      return {
        type: 'question',
        question: this.extractQuestion(content),
        confidence: 0.9
      };
    }
    
    // Check for explicit failure admission
    if (this.isFailureAdmission(content)) {
      return {
        type: 'failure_admission',
        reason: this.extractFailureReason(content),
        confidence: 0.8
      };
    }
    
    // Check for clarification requests
    if (this.isClarificationRequest(content)) {
      return {
        type: 'clarification_request',
        clarification: this.extractClarificationNeeded(content),
        confidence: 0.7
      };
    }
    
    // Check if it looks like a final answer
    if (this.looksLikeFinalAnswer(content, taskConfig)) {
      return {
        type: 'final_answer',
        answer: content,
        confidence: this.assessAnswerConfidence(content, taskConfig)
      };
    }
    
    // If none of the above, consider it malformed
    return {
      type: 'malformed',
      content: content,
      confidence: 0.3
    };
  }

  isQuestion(content) {
    const questionPatterns = [
      /\?$/,
      /could you (provide|tell|clarify|explain)/i,
      /what (is|are|do|does)/i,
      /which (one|type|kind)/i,
      /can you (help|assist|provide)/i
    ];
    
    return questionPatterns.some(pattern => pattern.test(content.trim()));
  }

  isFailureAdmission(content) {
    const failurePatterns = [
      /i cannot/i,
      /i'm unable to/i,
      /i don't have access/i,
      /i can't find/i,
      /this is not possible/i,
      /i'm sorry, but/i
    ];
    
    return failurePatterns.some(pattern => pattern.test(content));
  }
}

class AnswerValidator {
  validateAnswer(answer, taskConfig) {
    const issues = [];
    
    // Format validation
    if (taskConfig.outputFormat) {
      if (!this.matchesFormat(answer, taskConfig.outputFormat)) {
        issues.push({
          type: 'format_mismatch',
          message: `Answer doesn't match required format: ${taskConfig.outputFormat.description}`,
          expected: taskConfig.outputFormat.examples,
          received: answer
        });
      }
    }
    
    // Pattern validation
    if (taskConfig.validation?.pattern) {
      if (!taskConfig.validation.pattern.test(answer)) {
        issues.push({
          type: 'pattern_validation_failed',
          message: 'Answer doesn\'t match required pattern',
          pattern: taskConfig.validation.pattern.toString(),
          received: answer
        });
      }
    }
    
    // Custom validation rules
    if (taskConfig.validation?.customRules) {
      for (const rule of taskConfig.validation.customRules) {
        const ruleResult = rule.validate(answer);
        if (!ruleResult.valid) {
          issues.push({
            type: 'custom_validation_failed',
            message: ruleResult.message,
            rule: rule.name,
            received: answer
          });
        }
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      feedbackForClaude: this.generateValidationFeedback(issues, taskConfig)
    };
  }

  generateValidationFeedback(issues, taskConfig) {
    if (issues.length === 0) return null;
    
    let feedback = "Your answer has the following issues:\n\n";
    
    issues.forEach((issue, index) => {
      feedback += `${index + 1}. ${issue.message}\n`;
      
      if (issue.expected) {
        feedback += `   Expected format examples: ${issue.expected.join(', ')}\n`;
      }
      
      if (issue.received) {
        feedback += `   What you provided: "${issue.received}"\n`;
      }
    });
    
    feedback += "\nPlease provide a corrected answer that addresses these issues.";
    
    if (taskConfig.outputFormat?.examples) {
      feedback += `\n\nRemember, correct answers should look like: ${taskConfig.outputFormat.examples.join(', ')}`;
    }
    
    return feedback;
  }
}
```

### Context Management System

```javascript
class ContextManager {
  constructor(maxTokens = 100000) {
    this.maxTokens = maxTokens;
    this.tokenEstimator = new TokenEstimator();
  }

  startNewConversation(taskConfig, inputs) {
    const conversation = {
      id: this.generateConversationId(),
      messages: [],
      taskConfig,
      inputs,
      metadata: {
        startTime: new Date(),
        attemptCount: 0,
        toolCallCount: 0
      }
    };
    
    // Add initial system message with task instructions
    this.addSystemMessage(conversation, this.buildSystemPrompt(taskConfig, inputs));
    
    return conversation;
  }

  buildSystemPrompt(taskConfig, inputs) {
    let prompt = taskConfig.instructions + "\n\n";
    
    // Add input formatting
    prompt += this.inputProcessor.formatInputsForPrompt(inputs, taskConfig) + "\n\n";
    
    // Add examples if provided
    if (taskConfig.examples) {
      prompt += "Examples of correct responses:\n";
      taskConfig.examples.good.forEach(example => {
        prompt += `✅ ${example}\n`;
      });
      
      if (taskConfig.examples.bad) {
        prompt += "\nExamples of incorrect responses (avoid these):\n";
        taskConfig.examples.bad.forEach(example => {
          prompt += `❌ ${example}\n`;
        });
      }
      prompt += "\n";
    }
    
    // Add output format requirements
    if (taskConfig.outputFormat) {
      prompt += `Output format requirements:\n${taskConfig.outputFormat.description}\n`;
      if (taskConfig.outputFormat.examples) {
        prompt += `Examples: ${taskConfig.outputFormat.examples.join(', ')}\n`;
      }
      prompt += "\n";
    }
    
    // Add tool information
    if (taskConfig.availableTools) {
      prompt += "Available tools:\n";
      taskConfig.availableTools.forEach(tool => {
        prompt += `- ${tool.name}: ${tool.description}\n`;
        if (tool.examples) {
          prompt += `  Examples: ${tool.examples.join(', ')}\n`;
        }
      });
      prompt += "\n";
    }
    
    return prompt;
  }

  addMessage(conversation, role, content) {
    const message = {
      role,
      content,
      timestamp: new Date(),
      tokenCount: this.tokenEstimator.estimate(content)
    };
    
    conversation.messages.push(message);
    this.pruneIfNeeded(conversation);
  }

  addValidationFeedback(conversation, feedback) {
    this.addMessage(conversation, 'user', `${feedback}\n\nPlease try again with the corrected format.`);
  }

  addUserAnswer(conversation, answer) {
    this.addMessage(conversation, 'user', answer);
  }

  pruneIfNeeded(conversation) {
    const totalTokens = this.estimateTotalTokens(conversation);
    
    if (totalTokens > this.maxTokens * 0.9) { // Start pruning at 90% capacity
      this.pruneConversation(conversation);
    }
  }

  pruneConversation(conversation) {
    // Strategy: Keep system message, recent messages, and important examples
    // Remove middle conversation to make room
    
    const systemMessages = conversation.messages.filter(m => m.role === 'system');
    const recentMessages = conversation.messages.slice(-10); // Keep last 10 messages
    const importantMessages = conversation.messages.filter(m => m.important);
    
    // Combine and deduplicate
    const keptMessages = [...systemMessages, ...importantMessages, ...recentMessages]
      .filter((msg, index, arr) => arr.findIndex(m => m.timestamp === msg.timestamp) === index)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    conversation.messages = keptMessages;
    conversation.metadata.pruneCount = (conversation.metadata.pruneCount || 0) + 1;
  }
}
```

### Testing Infrastructure

```javascript
class ConversationTestRunner {
  constructor() {
    this.conversationManager = new ConversationManager();
    this.testResults = [];
  }

  async runTestSuite(testSuite) {
    console.log(`Running test suite: ${testSuite.name}`);
    const results = [];
    
    for (const test of testSuite.tests) {
      console.log(`  Running test: ${test.name}`);
      const result = await this.runSingleTest(test);
      results.push(result);
      
      if (result.success) {
        console.log(`    ✅ PASSED`);
      } else {
        console.log(`    ❌ FAILED: ${result.error}`);
      }
    }
    
    const passCount = results.filter(r => r.success).length;
    console.log(`\nTest suite completed: ${passCount}/${results.length} tests passed`);
    
    return {
      name: testSuite.name,
      totalTests: results.length,
      passedTests: passCount,
      results
    };
  }

  async runSingleTest(test) {
    const startTime = Date.now();
    
    try {
      const result = await this.conversationManager.executeTask(test.taskConfig, test.inputs);
      const executionTime = Date.now() - startTime;
      
      // Validate result against expected output
      const validation = this.validateTestResult(result, test.expectedOutput);
      
      return {
        testName: test.name,
        success: validation.matches,
        result: result.answer,
        expected: test.expectedOutput,
        executionTime,
        tokenUsage: result.tokenUsage,
        conversationId: result.conversationId,
        error: validation.matches ? null : validation.error
      };
      
    } catch (error) {
      return {
        testName: test.name,
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  validateTestResult(actualResult, expectedOutput) {
    if (typeof expectedOutput === 'string') {
      return {
        matches: actualResult.answer === expectedOutput,
        error: actualResult.answer === expectedOutput ? null : `Expected "${expectedOutput}", got "${actualResult.answer}"`
      };
    }
    
    if (expectedOutput instanceof RegExp) {
      const matches = expectedOutput.test(actualResult.answer);
      return {
        matches,
        error: matches ? null : `Expected pattern ${expectedOutput}, got "${actualResult.answer}"`
      };
    }
    
    if (typeof expectedOutput === 'function') {
      try {
        const matches = expectedOutput(actualResult.answer);
        return {
          matches,
          error: matches ? null : `Custom validation function returned false for "${actualResult.answer}"`
        };
      } catch (error) {
        return {
          matches: false,
          error: `Custom validation function threw error: ${error.message}`
        };
      }
    }
    
    return {
      matches: false,
      error: `Unsupported expected output type: ${typeof expectedOutput}`
    };
  }
}

// Example test suite definition
const domainFindingTests = {
  name: "Domain Finding Tests",
  tests: [
    {
      name: "Simple Domain Finding",
      taskConfig: {
        instructions: "Find the official website domain for the given private equity firm",
        maxTries: 3,
        availableTools: [{ name: "web_search", description: "Search the web" }],
        outputFormat: {
          description: "Return only the domain name",
          examples: ["blackstone.com", "kkr.com"]
        }
      },
      inputs: "Blackstone",
      expectedOutput: /blackstone\.com/i
    },
    {
      name: "Complex Firm Name",
      taskConfig: {
        instructions: "Find the official website domain for the given private equity firm",
        maxTries: 3,
        availableTools: [{ name: "web_search", description: "Search the web" }],
        outputFormat: {
          description: "Return only the domain name",
          examples: ["blackstone.com", "kkr.com"]
        }
      },
      inputs: "American Discovery Capital",
      expectedOutput: (result) => result.includes('.com') && result.length > 5
    }
  ]
};
```

### GUI Test Builder Interface

```javascript
// Simple web interface for building and running tests
class TestBuilderGUI {
  constructor() {
    this.testRunner = new ConversationTestRunner();
    this.availableTasks = this.loadAvailableTasks();
  }

  render() {
    return `
      <div class="test-builder">
        <h2>Claude Conversation Test Builder</h2>
        
        <div class="test-config">
          <label>Task Type:</label>
          <select id="taskType" onchange="this.loadTaskConfig()">
            ${this.availableTasks.map(task => 
              `<option value="${task.id}">${task.name}</option>`
            ).join('')}
          </select>
          
          <label>Model:</label>
          <select id="model">
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
            <option value="claude-3-opus-20240229">Claude 3 Opus</option>
          </select>
          
          <label>Max Attempts:</label>
          <input type="number" id="maxTries" value="3" min="1" max="10">
        </div>
        
        <div class="test-inputs">
          <label>Test Inputs (one per line):</label>
          <textarea id="testInputs" rows="10" placeholder="Enter test inputs, one per line:
Blackstone
KKR  
American Discovery Capital"></textarea>
        </div>
        
        <div class="expected-outputs">
          <label>Expected Outputs (optional, one per line):</label>
          <textarea id="expectedOutputs" rows="10" placeholder="Expected outputs corresponding to inputs:
blackstone.com
kkr.com
americandiscovery.com"></textarea>
        </div>
        
        <div class="test-actions">
          <button onclick="this.runTests()" class="run-tests-btn">Run Tests</button>
          <button onclick="this.saveTestSuite()" class="save-tests-btn">Save Test Suite</button>
          <button onclick="this.loadTestSuite()" class="load-tests-btn">Load Test Suite</button>
        </div>
        
        <div id="testResults" class="test-results"></div>
      </div>
    `;
  }

  async runTests() {
    const taskType = document.getElementById('taskType').value;
    const model = document.getElementById('model').value;
    const maxTries = parseInt(document.getElementById('maxTries').value);
    const inputs = document.getElementById('testInputs').value.split('\n').filter(line => line.trim());
    const expectedOutputs = document.getElementById('expectedOutputs').value.split('\n').filter(line => line.trim());
    
    const testSuite = this.buildTestSuite(taskType, model, maxTries, inputs, expectedOutputs);
    
    // Show loading state
    document.getElementById('testResults').innerHTML = '<div class="loading">Running tests...</div>';
    
    try {
      const results = await this.testRunner.runTestSuite(testSuite);
      this.displayTestResults(results);
    } catch (error) {
      document.getElementById('testResults').innerHTML = `<div class="error">Test execution failed: ${error.message}</div>`;
    }
  }

  buildTestSuite(taskType, model, maxTries, inputs, expectedOutputs) {
    const taskConfig = this.getTaskConfig(taskType);
    taskConfig.model = model;
    taskConfig.maxTries = maxTries;
    
    const tests = inputs.map((input, index) => ({
      name: `Test ${index + 1}: ${input}`,
      taskConfig,
      inputs: input,
      expectedOutput: expectedOutputs[index] || null
    }));
    
    return {
      name: `${taskType} Test Suite - ${new Date().toLocaleString()}`,
      tests
    };
  }

  displayTestResults(results) {
    const resultsHtml = `
      <div class="test-summary">
        <h3>${results.name}</h3>
        <p>Passed: ${results.passedTests}/${results.totalTests}</p>
        <p>Success Rate: ${(results.passedTests / results.totalTests * 100).toFixed(1)}%</p>
      </div>
      
      <div class="individual-results">
        ${results.results.map(result => `
          <div class="test-result ${result.success ? 'success' : 'failure'}">
            <h4>${result.testName} ${result.success ? '✅' : '❌'}</h4>
            <p><strong>Result:</strong> ${result.result || 'N/A'}</p>
            ${result.expected ? `<p><strong>Expected:</strong> ${result.expected}</p>` : ''}
            <p><strong>Execution Time:</strong> ${result.executionTime}ms</p>
            ${result.tokenUsage ? `<p><strong>Tokens:</strong> ${result.tokenUsage.input + result.tokenUsage.output}</p>` : ''}
            ${result.error ? `<p class="error"><strong>Error:</strong> ${result.error}</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    
    document.getElementById('testResults').innerHTML = resultsHtml;
  }
}
```

---

## Implementation Priorities

### Phase 1: Core Conversation Loop (Week 1-2)
1. **Basic ConversationManager**: Message exchange, tool calling, response parsing
2. **Input Processing**: Handle different input formats
3. **Response Classification**: Detect answers, questions, failures
4. **Simple Validation**: Basic format and pattern checking

### Phase 2: Robustness Features (Week 3-4)  
1. **Error Handling**: API failures, retries, graceful degradation
2. **Context Management**: Token tracking, conversation pruning
3. **Resource Management**: Rate limiting, timeouts, memory management
4. **Comprehensive Logging**: Structured logs, conversation history

### Phase 3: Testing and Development Tools (Week 5-6)
1. **Test Runner**: Automated test execution and validation
2. **Test Builder GUI**: Web interface for creating and running tests
3. **Development Tools**: Conversation replay, mock responses, debugging utilities
4. **Performance Monitoring**: Metrics collection and analysis

### Phase 4: Advanced Features (Week 7-8)
1. **Multi-Model Support**: Easy model switching and comparison
2. **Advanced Validation**: Custom validation rules, quality assessment
3. **Security Features**: Input sanitization, safe tool execution
4. **Integration Points**: Workflow system integration, database persistence

---

## Success Metrics

### Reliability Metrics
- **Success Rate**: >95% task completion rate for well-defined tasks
- **Error Recovery**: >90% successful recovery from retryable errors
- **Consistency**: <5% variation in results for identical inputs

### Performance Metrics
- **Response Time**: <10 seconds average for simple tasks
- **Token Efficiency**: <20% token waste due to conversation overhead
- **Cost Efficiency**: <$0.50 average cost per successful task completion

### Usability Metrics
- **Test Setup Time**: <2 minutes to set up and run a new test
- **Debugging Time**: <10 minutes to diagnose and fix conversation issues
- **Development Velocity**: 3x faster iteration on conversation improvements

### Quality Metrics
- **Answer Quality**: >90% of answers meet formatting and content requirements
- **False Positive Rate**: <5% incorrect success classifications
- **False Negative Rate**: <10% missed successful completions

---

This comprehensive requirements document provides the foundation for building a robust, flexible, and maintainable Claude conversation management system that will serve as the core of the Smart Insurance application.