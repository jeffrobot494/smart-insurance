const { database: logger } = require('../utils/logger');
const ClaudeManager = require('../mcp/ClaudeManager');

/**
 * Service for deduplicating broker names across portfolio companies using Claude API
 */
class BrokerDeduplicationService {
  constructor() {
    this.claudeManager = new ClaudeManager();
  }

  /**
   * Main entry point: Deduplicate brokers across all companies
   * @param {Array} companies - Array of company objects with form5500_data.scheduleA.details
   * @returns {Array} Companies with deduplicated broker information
   */
  async deduplicateBrokers(companies) {
    try {
      logger.info('🔍 Starting broker deduplication process...');
      
      // Extract all unique broker names across all companies
      const brokerNames = [...new Set(
        companies.flatMap(c => 
          Object.values(c?.form5500_data?.scheduleA?.details || {})
            .flat()
            .flatMap(record => record.brokers || [])
            .map(broker => broker.name)
            .filter(Boolean)
        )
      )].sort();

      if (brokerNames.length === 0) {
        logger.info('ℹ️  No brokers found across companies, skipping deduplication');
        return companies;
      }

      logger.info(`📋 Found ${brokerNames.length} unique broker name variations to analyze`);

      // Use Claude API to create deduplication mapping
      const mapping = await this.createDeduplicationMapping(brokerNames);

      // Apply mapping to all companies
      const deduplicatedCompanies = this.applyMappingToCompanies(companies, mapping);

      const finalBrokerNames = [...new Set(
        deduplicatedCompanies.flatMap(c => 
          Object.values(c?.form5500_data?.scheduleA?.details || {})
            .flat()
            .flatMap(record => record.brokers || [])
            .map(broker => broker.name)
            .filter(Boolean)
        )
      )];

      const reduction = brokerNames.length - finalBrokerNames.length;
      logger.info(`✅ Broker deduplication completed: ${brokerNames.length} → ${finalBrokerNames.length} unique brokers (${reduction} duplicates merged)`);

      return deduplicatedCompanies;

    } catch (error) {
      logger.error('❌ Broker deduplication failed:', error.message);
      logger.info('🔄 Returning original companies due to deduplication failure');
      return companies;
    }
  }

  /**
   * Use Claude API to create a mapping of similar broker names
   * @param {Array} brokerNames - Array of unique broker names
   * @returns {Object} Mapping where keys are original names, values are canonical names
   */
  async createDeduplicationMapping(brokerNames) {
    const prompt = `Deduplicate these insurance broker names. Many refer to the same firm with slight variations.

Return ONLY valid JSON: {"original_name": "canonical_name", ...}

Broker names:
${brokerNames.join('\n')}

Rules:
- Group obvious variations (J.P. Morgan = JPMorgan Chase)
- Use most complete name as canonical
- If unsure, keep separate
- Map unchanged names to themselves`;

    logger.info('🤖 Sending broker list to Claude for deduplication analysis...');

    const response = await this.claudeManager.sendMessage(prompt, { 
      maxTokens: 6144, // Increased for very large broker lists
      temperature: 0.1 
    });

    if (!response.success) {
      throw new Error(`Claude API failed: ${response.error}`);
    }

    // Log Claude's raw response for debugging
    logger.info('🤖 Claude response received, parsing...');
    logger.debug('Raw Claude response:', JSON.stringify(response.content, null, 2));

    // Parse Claude's response
    const mapping = this.parseClaudeResponse(response.content, brokerNames);

    logger.info(`📊 Claude identified ${Object.keys(mapping).length} broker name mappings`);

    return mapping;
  }

  /**
   * Parse Claude's response to extract the deduplication mapping
   * @param {string|Array} content - Claude's response content
   * @param {Array} originalNames - Original broker names for validation
   * @returns {Object} Mapping of original names to canonical names
   */
  parseClaudeResponse(content, originalNames) {
    try {
      // Handle different response formats from Claude
      let responseText = '';
      
      if (typeof content === 'string') {
        responseText = content;
      } else if (Array.isArray(content)) {
        // Handle array of content blocks
        for (const block of content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      } else if (content && typeof content === 'object') {
        // Handle object with indexed text blocks (like {"0": {"type": "text", "text": "..."}})
        const keys = Object.keys(content).sort((a, b) => parseInt(a) - parseInt(b));
        for (const key of keys) {
          const block = content[key];
          if (block && block.type === 'text') {
            responseText += block.text;
          }
        }
      }

      // Log the extracted text for debugging
      logger.debug('Extracted response text length:', responseText.length);
      logger.debug('First 500 chars:', responseText.substring(0, 500));
      logger.debug('Last 500 chars:', responseText.substring(Math.max(0, responseText.length - 500)));

      // Remove markdown code blocks if present
      responseText = responseText.replace(/```json\s*\n?/gi, '').replace(/\n?\s*```/g, '');

      // Find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in Claude response');
      }

      logger.debug('JSON match length:', jsonMatch[0].length);
      
      let jsonString = jsonMatch[0];
      
      // Check if JSON appears to be truncated (doesn't end with })
      if (!jsonString.trim().endsWith('}')) {
        logger.warn('⚠️ JSON appears to be truncated, attempting to fix...');
        // Try to find the last complete key-value pair and close the JSON
        const lastCommaIndex = jsonString.lastIndexOf(',');
        if (lastCommaIndex > 0) {
          jsonString = jsonString.substring(0, lastCommaIndex) + '\n}';
          logger.info('🔧 Attempted to fix truncated JSON');
        }
      }
      
      const mapping = JSON.parse(jsonString);

      // Validate and clean the mapping
      return this.validateMapping(mapping, originalNames);

    } catch (error) {
      logger.error('❌ Failed to parse Claude response:', error.message);
      logger.error('Raw response content that failed to parse:', JSON.stringify(content, null, 2));
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  /**
   * Validate Claude's mapping and ensure all original names are included
   * @param {Object} mapping - Raw mapping from Claude
   * @param {Array} originalNames - Original broker names
   * @returns {Object} Validated mapping
   */
  validateMapping(mapping, originalNames) {
    const validatedMapping = {};

    // Add all original names, using mapping if available
    originalNames.forEach(name => {
      if (mapping[name] && typeof mapping[name] === 'string') {
        validatedMapping[name] = mapping[name].trim();
      } else {
        // Map to itself if not in Claude's response
        validatedMapping[name] = name;
      }
    });

    return validatedMapping;
  }

  /**
   * Apply the deduplication mapping to all companies
   * @param {Array} companies - Original companies with broker data
   * @param {Object} mapping - Mapping of original to canonical names
   * @returns {Array} Companies with deduplicated broker names
   */
  applyMappingToCompanies(companies, mapping) {
    logger.info('🔄 Applying broker deduplication mapping to all companies...');

    return companies.map(company => {
      // Deep clone the company to avoid modifying the original
      const updatedCompany = JSON.parse(JSON.stringify(company));

      const scheduleADetails = updatedCompany?.form5500_data?.scheduleA?.details;

      if (!scheduleADetails) {
        return updatedCompany;
      }

      // Process all years and records
      Object.values(scheduleADetails).forEach(yearRecords => {
        if (!Array.isArray(yearRecords)) return;

        yearRecords.forEach(record => {
          const brokers = record.brokers;
          if (!Array.isArray(brokers)) return;

          // Update broker names using the mapping
          brokers.forEach(broker => {
            if (broker.name && mapping[broker.name]) {
              const originalName = broker.name;
              const canonicalName = mapping[broker.name];
              
              if (canonicalName !== originalName) {
                broker.name = canonicalName;
                logger.debug(`📝 Renamed broker: "${originalName}" → "${canonicalName}"`);
              }
            }
          });
        });
      });

      return updatedCompany;
    });
  }
}

module.exports = BrokerDeduplicationService;