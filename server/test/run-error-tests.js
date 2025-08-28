#!/usr/bin/env node
// Test runner for error handling system
require('../utils/load-env');

const ErrorHandlingTestSuite = require('./error-handling-tests');

async function runTests() {
  console.log('🚀 Starting Error Handling Test Suite');
  console.log('================================================\n');
  
  try {
    const testSuite = new ErrorHandlingTestSuite();
    const success = await testSuite.runTests();
    
    if (success) {
      console.log('\n🎉 All tests passed! Error handling system is ready.');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed. Please review the implementation.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Test suite crashed:', error);
    process.exit(1);
  }
}

runTests();