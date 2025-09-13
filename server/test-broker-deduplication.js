#!/usr/bin/env node

/**
 * Test script for broker deduplication functionality
 * Usage: node test-broker-deduplication.js [pipeline_id]
 */

require('dotenv').config({ path: './server/.env' });
const { database: logger } = require('./utils/logger');
const BrokerDeduplicationService = require('./data-extraction/BrokerDeduplicationService');
const DatabaseManager = require('./data-extraction/DatabaseManager');

async function testBrokerDeduplication(pipelineId) {
  const deduplicationService = new BrokerDeduplicationService();
  const databaseManager = DatabaseManager.getInstance();

  try {
    await databaseManager.initialize();

    if (pipelineId) {
      console.log(`\n🧪 Testing broker deduplication on pipeline ${pipelineId}...\n`);

      // Get pipeline data
      const pipeline = await databaseManager.getPipeline(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }

      if (!pipeline.companies || pipeline.companies.length === 0) {
        console.log('❌ No companies found in pipeline');
        return;
      }

      console.log(`📊 Pipeline: ${pipeline.firm_name}`);
      console.log(`📊 Companies: ${pipeline.companies.length}`);

      // Extract broker names BEFORE deduplication
      const originalBrokerNames = [...new Set(
        pipeline.companies.flatMap(c => 
          Object.values(c?.form5500_data?.scheduleA?.details || {})
            .flat()
            .flatMap(record => record.brokers || [])
            .map(broker => broker.name)
            .filter(Boolean)
        )
      )].sort();

      console.log(`\n📋 BEFORE Deduplication:`);
      console.log(`   Unique broker names: ${originalBrokerNames.length}`);
      if (originalBrokerNames.length > 0) {
        console.log(`   Sample names:`);
        originalBrokerNames.slice(0, 8).forEach(name => console.log(`     - ${name}`));
        if (originalBrokerNames.length > 8) console.log(`     ... and ${originalBrokerNames.length - 8} more`);
      }

      if (originalBrokerNames.length === 0) {
        console.log('ℹ️  No brokers found, test complete');
        return;
      }

      // Apply deduplication
      console.log(`\n🔄 Applying deduplication...`);
      const deduplicatedCompanies = await deduplicationService.deduplicateBrokers(pipeline.companies);

      // Extract broker names AFTER deduplication
      const finalBrokerNames = [...new Set(
        deduplicatedCompanies.flatMap(c => 
          Object.values(c?.form5500_data?.scheduleA?.details || {})
            .flat()
            .flatMap(record => record.brokers || [])
            .map(broker => broker.name)
            .filter(Boolean)
        )
      )].sort();

      console.log(`\n✅ AFTER Deduplication:`);
      console.log(`   Unique broker names: ${finalBrokerNames.length}`);
      if (finalBrokerNames.length > 0) {
        console.log(`   Sample names:`);
        finalBrokerNames.slice(0, 8).forEach(name => console.log(`     - ${name}`));
        if (finalBrokerNames.length > 8) console.log(`     ... and ${finalBrokerNames.length - 8} more`);
      }

      // Results
      const reduction = originalBrokerNames.length - finalBrokerNames.length;
      const reductionPercent = originalBrokerNames.length > 0 ? Math.round((reduction / originalBrokerNames.length) * 100) : 0;

      console.log(`\n📈 RESULTS:`);
      console.log(`   Duplicates merged: ${reduction}`);
      console.log(`   Reduction: ${reductionPercent}%`);
      
      if (reduction > 0) {
        console.log(`   ✅ SUCCESS: Found and merged ${reduction} duplicate broker names`);
      } else {
        console.log(`   ✅ SUCCESS: No duplicates found (clean data)`);
      }

    } else {
      // Test with mock data
      console.log(`\n🧪 Testing with mock data...\n`);

      const mockCompanies = [
        {
          name: "Company A",
          form5500_data: {
            scheduleA: {
              details: {
                "2023": [
                  {
                    brokers: [
                      { name: "COBBS ALLEN & HALL INC", commission: "50000.00" },
                      { name: "Aon Corp", commission: "25000.00" }
                    ]
                  }
                ]
              }
            }
          }
        },
        {
          name: "Company B",
          form5500_data: {
            scheduleA: {
              details: {
                "2024": [
                  {
                    brokers: [
                      { name: "COBBS, ALLEN AND HALL, INC.", commission: "75000.00" },
                      { name: "Aon Corporation", commission: "30000.00" }
                    ]
                  }
                ]
              }
            }
          }
        }
      ];

      const originalNames = ["COBBS ALLEN & HALL INC", "Aon Corp", "COBBS, ALLEN AND HALL, INC.", "Aon Corporation"];
      console.log(`📋 BEFORE: ${originalNames.length} unique names`);
      console.log(`   Names: ${originalNames.join(', ')}`);

      const deduplicatedCompanies = await deduplicationService.deduplicateBrokers(mockCompanies);

      const finalNames = [...new Set(
        deduplicatedCompanies.flatMap(c => 
          Object.values(c?.form5500_data?.scheduleA?.details || {})
            .flat()
            .flatMap(record => record.brokers || [])
            .map(broker => broker.name)
            .filter(Boolean)
        )
      )];

      console.log(`\n✅ AFTER: ${finalNames.length} unique names`);
      console.log(`   Names: ${finalNames.join(', ')}`);

      const reduction = originalNames.length - finalNames.length;
      console.log(`\n📈 RESULT: ${reduction} duplicates merged`);
      
      if (reduction > 0) {
        console.log(`✅ SUCCESS: Mock test passed`);
      } else {
        console.log(`⚠️  No deduplication occurred`);
      }
    }

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    throw error;
  } finally {
    await databaseManager.close();
  }
}

// CLI execution
if (require.main === module) {
  const pipelineId = process.argv[2] ? parseInt(process.argv[2]) : null;
  testBrokerDeduplication(pipelineId).catch(console.error);
}

module.exports = { testBrokerDeduplication };