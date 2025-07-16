const Anthropic = require('@anthropic-ai/sdk');

class ClaudeManager {
  constructor(apiKey = null, model = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = model;
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass it to the constructor.');
    }
    
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  async sendMessage(message, options = {}) {
    try {
      const {
        maxTokens = 1024,
        temperature = 0.7,
        systemPrompt = "You are a general-purpose assistant capable of all sorts of creative tasks and problem-solving. For things you can't do, you have access to tools.",
        conversationHistory = [],
        tools = []
      } = options;

      // Build messages array
      const messages = [...conversationHistory];
      
      // Add the current user message
      messages.push({
        role: 'user',
        content: message
      });

      // Prepare the request parameters
      const requestParams = {
        model: this.model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: messages
      };

      // Add system prompt if provided
      if (systemPrompt) {
        requestParams.system = systemPrompt;
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
      }

      //DEBUG --
      console.log("[DEBUG]: Message to Claude: ", message);

      const response = await this.client.messages.create(requestParams);

      return {
        success: true,
        content: response.content, // Return full content array, not just first text block
        usage: response.usage,
        model: response.model,
        stopReason: response.stop_reason
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorType: error.type || 'unknown'
      };
    }
  }

  setModel(model) {
    this.model = model;
  }

  setTask(task) {
    this.currentTask = task;
  }


  getAvailableModels() {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}

module.exports = ClaudeManager;