# Broker Deduplication Implementation

## Problem
Same brokers appear with name variations: "J.P. Morgan" vs "JPMorgan Chase", causing inaccurate broker counts.

## Solution
Use Claude API to standardize broker names while preserving each company's broker relationships.

## Implementation

### BrokerDeduplicationService.js
```javascript
const ClaudeManager = require('../mcp/ClaudeManager');

class BrokerDeduplicationService {
  constructor() {
    this.claudeManager = new ClaudeManager();
  }

  async deduplicateBrokers(companies) {
    // Extract all unique broker names
    const brokerNames = [...new Set(
      companies.flatMap(c => 
        Object.values(c?.form5500_data?.scheduleA?.details || {})
          .flat()
          .flatMap(record => record.brokers || [])
          .map(broker => broker.name)
          .filter(Boolean)
      )
    )];

    if (brokerNames.length === 0) return companies;

    // Claude prompt
    const prompt = `Deduplicate these insurance broker names. Many refer to the same firm with slight variations.

Return ONLY valid JSON: {"original_name": "canonical_name", ...}

Broker names:
${brokerNames.join('\n')}

Rules:
- Group obvious variations (J.P. Morgan = JPMorgan Chase)
- Use most complete name as canonical
- If unsure, keep separate
- Map unchanged names to themselves`;
    
    const response = await this.claudeManager.sendMessage(prompt, { maxTokens: 2048, temperature: 0.1 });
    const mapping = JSON.parse(response.content.match(/\{[\s\S]*\}/)[0]);

    // Apply mapping to each company's data
    return companies.map(company => {
      const updated = JSON.parse(JSON.stringify(company));
      Object.values(updated?.form5500_data?.scheduleA?.details || {}).forEach(yearRecords =>
        yearRecords.forEach(record =>
          (record.brokers || []).forEach(broker => {
            if (mapping[broker.name]) broker.name = mapping[broker.name];
          })
        )
      );
      return updated;
    });
  }
}

module.exports = BrokerDeduplicationService;
```

### DataExtractionService.js Changes
```javascript
// Add import
const BrokerDeduplicationService = require('./BrokerDeduplicationService');

// Add to constructor
this.brokerDeduplicationService = new BrokerDeduplicationService();

// Add after report generation
reportData.companies = await this.brokerDeduplicationService.deduplicateBrokers(reportData.companies);
```

## Result
- Before: ["J.P. Morgan", "JPMorgan Chase", "Aon Corp", "Aon Corporation"] = 4 brokers
- After: ["JPMorgan Chase", "JPMorgan Chase", "Aon Corporation", "Aon Corporation"] = 2 unique brokers
- Each company keeps its own broker relationships with standardized names