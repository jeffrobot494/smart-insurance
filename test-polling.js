#!/usr/bin/env node

/**
 * Test script to poll the server-side polling endpoint every second
 * Usage: node test-polling.js [workflowId]
 * Example: node test-polling.js 123
 */

const POLL_INTERVAL = 1000; // 1 second
const SERVER_URL = 'http://localhost:3000';

async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const urlParsed = new URL(url);
    
    const options = {
      hostname: urlParsed.hostname,
      port: urlParsed.port,
      path: urlParsed.pathname,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function pollWorkflow(workflowId) {
  const url = `${SERVER_URL}/api/polling/${workflowId}`;
  
  console.log(`🚀 Starting polling test for workflow ID: ${workflowId}`);
  console.log(`📡 Polling ${url} every ${POLL_INTERVAL}ms...`);
  console.log(`⏹️  Press Ctrl+C to stop\n`);
  
  let pollCount = 0;
  
  const poll = async () => {
    try {
      pollCount++;
      const response = await makeRequest(url);
      
      if (response.status !== 200) {
        console.log(`❌ [${new Date().toLocaleTimeString()}] HTTP ${response.status}: ${JSON.stringify(response.data)}`);
        return;
      }
      
      const data = response.data;
      
      if (data.messages && data.messages.length > 0) {
        console.log(`\n🔔 [${new Date().toLocaleTimeString()}] Poll #${pollCount} - Received ${data.messageCount} messages:`);
        data.messages.forEach((msg, index) => {
          const timestamp = new Date(msg.timestamp).toLocaleTimeString();
          const firmInfo = msg.firmId !== null ? `Firm ${msg.firmId}` : 'General';
          console.log(`  ${index + 1}. [${timestamp}] ${msg.type.toUpperCase()}: ${msg.message} (${firmInfo})`);
        });
        console.log('');
      } else {
        // Show periodic "still polling" message every 10 polls when no messages
        if (pollCount % 10 === 0) {
          console.log(`⏱️  [${new Date().toLocaleTimeString()}] Poll #${pollCount} - No new messages (still polling...)`);
        } else {
          process.stdout.write('.');
        }
      }
    } catch (error) {
      console.error(`\n❌ [${new Date().toLocaleTimeString()}] Polling error:`, error.message);
    }
  };

  // Start polling immediately, then every interval
  poll();
  setInterval(poll, POLL_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Polling test stopped');
  process.exit(0);
});

// Get workflow ID from command line arguments
const workflowId = process.argv[2];

if (!workflowId) {
  console.log('❌ Error: Please provide a workflow ID');
  console.log('Usage: node test-polling.js <workflowId>');
  console.log('Example: node test-polling.js 123');
  process.exit(1);
}

// Validate workflow ID is a number
if (isNaN(workflowId)) {
  console.log('❌ Error: Workflow ID must be a number');
  process.exit(1);
}

// Start polling
pollWorkflow(workflowId);