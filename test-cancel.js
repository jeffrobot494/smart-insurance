#!/usr/bin/env node

/**
 * Simple Cancel Test Script
 * Tests the cancel endpoint for a specific pipeline ID
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3000/api/pipeline';
const TEST_TIMEOUT = 5000;

// Load password from server/.env file
function loadAuthPassword() {
    try {
        const envPath = path.join(__dirname, 'server', '.env');
        if (!fs.existsSync(envPath)) {
            console.warn('⚠️  server/.env file not found, falling back to environment variable');
            return process.env.AUTH_PASSWORD;
        }

        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('AUTH_PASSWORD=')) {
                const password = trimmed.split('=')[1];
                console.log('🔑 Loaded password from server/.env');
                return password;
            }
        }

        console.warn('⚠️  AUTH_PASSWORD not found in server/.env, falling back to environment variable');
        return process.env.AUTH_PASSWORD;
    } catch (error) {
        console.warn(`⚠️  Error reading server/.env: ${error.message}, falling back to environment variable`);
        return process.env.AUTH_PASSWORD;
    }
}

class CancelTester {
    constructor() {
        this.sessionCookie = null;
    }

    async authenticate() {
        try {
            // Get login page to establish session
            const loginResponse = await axios.get('http://localhost:3000/login', {
                timeout: TEST_TIMEOUT,
                withCredentials: true
            });

            // Extract session cookie
            const cookies = loginResponse.headers['set-cookie'];
            if (cookies) {
                this.sessionCookie = cookies[0].split(';')[0];
                console.log('🍪 Session cookie obtained');
            }

            // Login with password
            const password = loadAuthPassword();
            console.log(`🔐 Attempting login with password: ${password ? '[SET]' : '[NOT SET]'}`);

            const authResponse = await axios.post('http://localhost:3000/auth/login',
                { password },
                {
                    headers: {
                        'Cookie': this.sessionCookie || '',
                        'Content-Type': 'application/json'
                    },
                    timeout: TEST_TIMEOUT,
                    withCredentials: true
                }
            );

            // Update session cookie from login response
            const authCookies = authResponse.headers['set-cookie'];
            if (authCookies) {
                this.sessionCookie = authCookies[0].split(';')[0];
                console.log('🍪 Authentication cookie updated');
            }

            return authResponse.data.success;
        } catch (error) {
            console.error('❌ Authentication failed:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return false;
        }
    }

    async cancelPipeline(pipelineId, reason = 'test_cancel') {
        try {
            console.log(`🛑 Attempting to cancel pipeline ${pipelineId}...`);

            const response = await axios.post(`${BASE_URL}/${pipelineId}/cancel`,
                { reason },
                {
                    headers: {
                        'Cookie': this.sessionCookie || '',
                        'Content-Type': 'application/json'
                    },
                    timeout: TEST_TIMEOUT,
                    withCredentials: true
                }
            );

            console.log('✅ Cancel request successful!');
            console.log('📋 Response:', JSON.stringify(response.data, null, 2));
            return { success: true, data: response.data };

        } catch (error) {
            console.log('❌ Cancel request failed!');
            const errorData = error.response?.data || error.message;
            console.log('📋 Error:', JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData };
        }
    }
}

async function main() {
    // Check command line arguments
    const pipelineId = process.argv[2];
    if (!pipelineId) {
        console.error('❌ Usage: node test-cancel.js <pipeline_id>');
        console.error('📝 Example: node test-cancel.js 123');
        process.exit(1);
    }

    // Validate pipeline ID is a number
    if (isNaN(parseInt(pipelineId))) {
        console.error('❌ Pipeline ID must be a number');
        process.exit(1);
    }

    console.log('🧪 Cancel Test Script');
    console.log(`🎯 Target Pipeline ID: ${pipelineId}`);
    console.log('=' .repeat(40));

    // Check if server is running
    try {
        await axios.get('http://localhost:3000/login', { timeout: 3000 });
        console.log('✅ Server is running');
    } catch (error) {
        console.error('❌ Server not running or not accessible. Please start the server first.');
        console.log('💡 Try: npm start');
        process.exit(1);
    }

    const tester = new CancelTester();

    // Authenticate
    console.log('\n🔐 Authenticating...');
    const authenticated = await tester.authenticate();
    if (!authenticated) {
        console.error('❌ Authentication failed. Please check AUTH_PASSWORD.');
        process.exit(1);
    }
    console.log('✅ Authentication successful');

    // Test cancel
    console.log('\n🛑 Testing cancel endpoint...');
    const result = await tester.cancelPipeline(pipelineId);

    // Summary
    console.log('\n' + '='.repeat(40));
    if (result.success) {
        console.log('🟢 CANCEL TEST PASSED');
        console.log(`📊 Pipeline ${pipelineId} cancel request succeeded`);
    } else {
        console.log('🔴 CANCEL TEST FAILED');
        console.log(`📊 Pipeline ${pipelineId} cancel request failed`);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Test script error:', error.message);
        process.exit(1);
    });
}

module.exports = CancelTester;