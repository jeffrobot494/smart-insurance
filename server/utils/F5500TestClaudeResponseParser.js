const { server: logger } = require('./logger');

class F5500TestClaudeResponseParser {
  /**
   * Parse JSON from Claude's response or extract from conversation history if response is empty
   * @param {string} responseText - Claude's text response
   * @param {Object} taskResult - Full task result with conversation history
   * @returns {Object|string} Parsed JSON data or original response
   */
  static parseResult(responseText, taskResult = null) {
    // If Claude provided a text response, try to parse it
    if (responseText && typeof responseText === 'string' && responseText.trim()) {
      const parsed = this.parseTextResponse(responseText);
      if (parsed !== null) {
        return parsed;
      }
    }
    
    // If Claude's response was empty, extract from the tool results in conversation history
    if (taskResult && taskResult.conversationHistory) {
      logger.info('📝 Claude response was empty, extracting from tool results');
      const toolResult = this.extractFromToolResults(taskResult.conversationHistory);
      if (toolResult !== null) {
        return toolResult;
      }
    }
    
    // If all parsing attempts fail, return the original text or empty object
    logger.info('📝 Could not parse response as JSON, returning as text');
    return responseText || {
      raw_response: responseText,
      parsed: false,
      note: "Response could not be parsed as JSON"
    };
  }

  /**
   * Try to parse JSON from Claude's text response
   * @param {string} responseText 
   * @returns {Object|null} Parsed JSON or null if parsing failed
   */
  static parseTextResponse(responseText) {
    try {
      // First try: parse the entire response as JSON
      return JSON.parse(responseText.trim());
    } catch (error) {
      // Second try: look for JSON in markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (parseError) {
          logger.info('📝 Found code block but failed to parse as JSON');
        }
      }
      
      // Third try: look for JSON-like content between braces
      const braceMatch = responseText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          return JSON.parse(braceMatch[0]);
        } catch (parseError) {
          logger.info('📝 Found braces but failed to parse as JSON');
        }
      }
    }
    
    return null; // Parsing failed
  }

  /**
   * Extract JSON data from tool results in conversation history
   * @param {Array} conversationHistory 
   * @returns {Object|null} Parsed JSON or null if extraction failed
   */
  static extractFromToolResults(conversationHistory) {
    // Find the last tool result in the conversation
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const message = conversationHistory[i];
      if (message.role === 'user' && Array.isArray(message.content)) {
        for (const contentItem of message.content) {
          if (contentItem.type === 'tool_result' && contentItem.content) {
            try {
              // Parse the tool result content
              const toolResponse = JSON.parse(contentItem.content);
              
              // Extract the actual data from the MCP tool response structure
              if (toolResponse.content && Array.isArray(toolResponse.content)) {
                const textContent = toolResponse.content.find(c => c.type === 'text');
                if (textContent && textContent.text) {
                  return JSON.parse(textContent.text);
                }
              }
            } catch (parseError) {
              logger.info('📝 Failed to parse tool result as JSON');
            }
          }
        }
      }
    }
    
    return null; // No tool result found
  }

  /**
   * Check if a response contains valid JSON data
   * @param {Object|string} result 
   * @returns {boolean}
   */
  static isValidResult(result) {
    if (!result) return false;
    if (typeof result === 'string' && result.trim() === '') return false;
    if (typeof result === 'object' && result.parsed === false) return false;
    return true;
  }
}

module.exports = F5500TestClaudeResponseParser;