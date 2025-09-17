#!/usr/bin/env node

/**
 * PipelineStateManager Test Script
 * Tests validation logic, concurrency handling, and edge cases without full workflow execution
 */

const axios = require('axios');
const colors = require('colors');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3000/api/pipeline';
const TEST_TIMEOUT = 5000; // 5 seconds max per test

// Load password from server/.env file
function loadAuthPassword() {
    try {
        const envPath = path.join(__dirname, 'server', '.env');
        if (!fs.existsSync(envPath)) {
            console.warn('⚠️  server/.env file not found, falling back to environment variable'.yellow);
            return process.env.AUTH_PASSWORD;
        }

        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('AUTH_PASSWORD=')) {
                const password = trimmed.split('=')[1];
                console.log('🔑 Loaded password from server/.env'.gray);
                return password;
            }
        }

        console.warn('⚠️  AUTH_PASSWORD not found in server/.env, falling back to environment variable'.yellow);
        return process.env.AUTH_PASSWORD;
    } catch (error) {
        console.warn(`⚠️  Error reading server/.env: ${error.message}, falling back to environment variable`.yellow);
        return process.env.AUTH_PASSWORD;
    }
}

class StateManagerTester {
    constructor() {
        this.testResults = [];
        this.testPipelines = []; // Track created pipelines for cleanup
        this.startTime = Date.now();
        this.sessionCookie = null; // Store session cookie for auth
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    async authenticate() {
        try {
            // First, try to get the login page to get session
            const loginResponse = await axios.get('http://localhost:3000/login', {
                timeout: TEST_TIMEOUT,
                withCredentials: true
            });

            // Extract session cookie
            const cookies = loginResponse.headers['set-cookie'];
            if (cookies) {
                this.sessionCookie = cookies[0].split(';')[0];
                console.log('🍪 Session cookie obtained'.gray);
            }

            // Login with the password from server/.env or environment
            const password = loadAuthPassword();
            console.log(`🔑 Attempting login with password: ${password ? '[SET]' : '[NOT SET]'}`.gray);

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
                console.log('🍪 Authentication cookie updated'.gray);
            }

            return authResponse.data.success;
        } catch (error) {
            console.error('Authentication failed:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return false;
        }
    }

    async makeRequest(method, url, data = null) {
        const startTime = Date.now();
        try {
            const config = {
                method,
                url: `${BASE_URL}${url}`,
                timeout: TEST_TIMEOUT,
                headers: {
                    'Content-Type': 'application/json'
                },
                withCredentials: true
            };

            if (this.sessionCookie) {
                config.headers['Cookie'] = this.sessionCookie;
            }

            if (data) {
                config.data = data;
            }

            console.log(`🌐 ${method} ${url} ${data ? JSON.stringify(data) : ''}`.gray);
            const response = await axios(config);
            const duration = Date.now() - startTime;
            console.log(`   ➡️ ${response.status} (${duration}ms)`.gray);
            return { success: true, data: response.data, status: response.status, duration };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorData = error.response?.data || error.message;
            console.log(`   ⚠️ ${error.response?.status || 'ERROR'} (${duration}ms): ${typeof errorData === 'object' ? JSON.stringify(errorData) : errorData}`.gray);
            return {
                success: false,
                error: errorData,
                status: error.response?.status || 500,
                duration
            };
        }
    }

    async createTestPipeline(firmName = null) {
        const name = firmName || `Test-Firm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const result = await this.makeRequest('POST', '', { firm_name: name });

        if (result.success && result.data.pipeline) {
            this.testPipelines.push(result.data.pipeline.pipeline_id);
            return result.data.pipeline;
        }
        return null;
    }

    async setTestPipelineStatus(pipelineId, status) {
        // Direct database update for testing failed states
        const result = await this.makeRequest('POST', `/${pipelineId}/update`, {
            updates: { status }
        });
        return result.success;
    }

    logTest(name, passed, details = '') {
        const icon = passed ? '✅' : '❌';
        const color = passed ? 'green' : 'red';
        console.log(`${icon} ${name}`[color]);
        if (details) {
            console.log(`   ${details}`.gray);
        }
        this.testResults.push({ name, passed, details });
    }

    async debugOperationStatus() {
        console.log('🔍 DEBUG: Checking operation status...'.cyan);
        try {
            // Check if StateManager has any operations in progress by trying a safe operation first
            const testPipeline = await this.createTestPipeline('Debug-Status-Check');
            if (testPipeline) {
                // Try an invalid operation first to check for SYSTEM_BUSY without starting anything
                const result = await this.makeRequest('POST', `/${testPipeline.pipeline_id}/legal-resolution`);
                if (!result.success && result.error?.code === 'SYSTEM_BUSY') {
                    console.log('   ⚠️  Global operations are BLOCKED'.yellow);
                } else if (!result.success && result.error?.code === 'INVALID_STATE') {
                    console.log('   🟢 Operations are available (got expected INVALID_STATE)'.green);
                } else {
                    console.log(`   ❓ Unexpected response: ${result.error?.error || 'Success?'}`.gray);
                }
                // Clean up the test pipeline
                await this.makeRequest('DELETE', `/${testPipeline.pipeline_id}`);
                this.testPipelines = this.testPipelines.filter(id => id !== testPipeline.pipeline_id);
            }
        } catch (error) {
            console.log(`   🔴 Debug check failed: ${error.message}`.red);
        }
    }

    async waitForOperationsToComplete(maxWaitMs = 5000) {
        console.log('⏳ Waiting for operations to complete...'.yellow);
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const testPipeline = await this.createTestPipeline('Wait-Test');
            if (testPipeline) {
                const result = await this.makeRequest('POST', `/${testPipeline.pipeline_id}/research`);
                await this.makeRequest('DELETE', `/${testPipeline.pipeline_id}`);
                this.testPipelines = this.testPipelines.filter(id => id !== testPipeline.pipeline_id);

                if (result.success || (result.error?.code !== 'SYSTEM_BUSY' && result.error?.code !== 'OPERATION_IN_PROGRESS')) {
                    console.log(`🟢 Operations completed (waited ${Date.now() - startTime}ms)`.green);
                    return true;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between checks
        }

        // Timeout reached - try to cancel operations instead of giving up
        console.log(`⏰ Timeout waiting for operations (${maxWaitMs}ms) - attempting to cancel...`.yellow);
        const cancelled = await this.cancelAllRunningOperations();
        if (cancelled) {
            console.log(`🟢 Successfully cancelled running operations`.green);
            return true;
        } else {
            console.log(`🔴 Failed to cancel operations`.red);
            return false;
        }
    }

    async cancelAllRunningOperations() {
        console.log('🛑 Attempting to cancel all running operations...'.yellow);
        try {
            // Try to find and cancel any running pipelines
            for (const pipelineId of this.testPipelines) {
                const cancelResult = await this.makeRequest('POST', `/${pipelineId}/cancel`, { reason: 'test_cleanup' });
                if (cancelResult.success) {
                    console.log(`   🟢 Cancelled pipeline ${pipelineId}`.green);
                } else if (cancelResult.error?.code === 'INVALID_STATE') {
                    // Pipeline not running, that's fine
                    console.log(`   ℹ️  Pipeline ${pipelineId} not running`.gray);
                } else {
                    console.log(`   🔴 Failed to cancel ${pipelineId}: ${cancelResult.error?.error}`.red);
                }
            }

            // Wait a moment for cancellations to take effect
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check if operations are now available
            const testPipeline = await this.createTestPipeline('Cancel-Check');
            if (testPipeline) {
                const result = await this.makeRequest('POST', `/${testPipeline.pipeline_id}/legal-resolution`);
                await this.makeRequest('DELETE', `/${testPipeline.pipeline_id}`);
                this.testPipelines = this.testPipelines.filter(id => id !== testPipeline.pipeline_id);

                if (result.error?.code === 'INVALID_STATE') {
                    console.log('   🟢 Operations are now available'.green);
                    return true;
                } else if (result.error?.code === 'SYSTEM_BUSY') {
                    console.log('   ⚠️  Operations still blocked'.yellow);
                    return false;
                }
            }
        } catch (error) {
            console.log(`   🔴 Cancel operation failed: ${error.message}`.red);
        }
        return false;
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test pipelines...'.yellow);

        // First, try to cancel any running operations
        await this.cancelAllRunningOperations();

        // Then delete all test pipelines
        for (const pipelineId of this.testPipelines) {
            try {
                await this.makeRequest('DELETE', `/${pipelineId}`);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    // ============================================
    // TEST CATEGORIES
    // ============================================

    async testGlobalOperationBlocking() {
        console.log('\n🌐 Testing Global Operation Blocking'.cyan.bold);

        await this.debugOperationStatus();

        // Create two test pipelines
        console.log('   🔧 Creating test pipelines...'.gray);
        const pipeline1 = await this.createTestPipeline('Global-Block-Test-1');
        const pipeline2 = await this.createTestPipeline('Global-Block-Test-2');
        console.log(`   📝 Created pipelines: ${pipeline1?.pipeline_id}, ${pipeline2?.pipeline_id}`.gray);

        if (!pipeline1 || !pipeline2) {
            this.logTest('Setup pipelines for global blocking test', false, 'Failed to create test pipelines');
            return;
        }

        // Start research on first pipeline
        console.log('   🚀 Starting research on pipeline 1...'.gray);
        const start1 = await this.makeRequest('POST', `/${pipeline1.pipeline_id}/research`);
        console.log(`   📊 Pipeline 1 result: ${start1.success ? 'SUCCESS' : 'FAILED'} ${start1.error?.code || ''}`.gray);
        this.logTest('Start research on pipeline 1', start1.success,
            start1.success ? 'Research started successfully' : start1.error?.error);

        if (!start1.success) {
            console.log('   🔴 First pipeline failed, skipping rest of test'.red);
            return;
        }

        // Try to start research on second pipeline immediately (should be blocked)
        console.log('   🚀 Attempting research on pipeline 2 (should be blocked)...'.gray);
        const start2 = await this.makeRequest('POST', `/${pipeline2.pipeline_id}/research`);
        console.log(`   📊 Pipeline 2 result: ${start2.success ? 'SUCCESS' : 'FAILED'} ${start2.error?.code || ''} - ${start2.error?.error || ''}`.gray);
        this.logTest('Global blocking prevents second workflow',
            !start2.success && start2.error?.code === 'SYSTEM_BUSY',
            start2.error?.error || 'Expected SYSTEM_BUSY error');

        // Test that non-workflow operations still work
        console.log('   🔧 Testing non-workflow operations during blocking...'.gray);
        const createDuringWorkflow = await this.createTestPipeline('Global-Block-Test-3');
        this.logTest('Create pipeline during workflow execution',
            createDuringWorkflow !== null,
            'Pipeline creation should work during workflow execution');

        // Test delete of non-running pipeline
        const deleteDuringWorkflow = await this.makeRequest('DELETE', `/${pipeline2.pipeline_id}`);
        console.log(`   🗑️ Delete result: ${deleteDuringWorkflow.success ? 'SUCCESS' : 'FAILED'} ${deleteDuringWorkflow.error?.code || ''}`.gray);
        this.logTest('Delete non-running pipeline during workflow',
            deleteDuringWorkflow.success,
            'Non-running pipeline deletion should work during workflow');

        // Remove from tracking since we deleted it
        this.testPipelines = this.testPipelines.filter(id => id !== pipeline2.pipeline_id);

        // Wait for the research operation to complete before continuing
        console.log('   ⏳ Waiting for operations to complete...'.gray);
        await this.waitForOperationsToComplete();
    }

    async testStateValidation() {
        console.log('\n🔄 Testing State Validation'.cyan.bold);

        await this.debugOperationStatus();

        console.log('   🔧 Creating test pipeline for state validation...'.gray);
        const pipeline = await this.createTestPipeline('State-Validation-Test');
        if (!pipeline) {
            this.logTest('Setup pipeline for state validation', false);
            return;
        }
        console.log(`   📝 Pipeline status: ${pipeline.status}`.gray);

        // Test invalid transitions
        console.log('   🚫 Testing invalid legal resolution on pending pipeline...'.gray);
        const invalidLegal = await this.makeRequest('POST', `/${pipeline.pipeline_id}/legal-resolution`);
        console.log(`   📊 Legal resolution result: ${invalidLegal.success ? 'SUCCESS' : 'FAILED'} ${invalidLegal.error?.code || ''}`.gray);
        this.logTest('Block legal resolution on pending pipeline',
            !invalidLegal.success && invalidLegal.error?.code === 'INVALID_STATE',
            invalidLegal.error?.error || 'Expected INVALID_STATE error');

        console.log('   🚫 Testing invalid data extraction on pending pipeline...'.gray);
        const invalidData = await this.makeRequest('POST', `/${pipeline.pipeline_id}/data-extraction`);
        console.log(`   📊 Data extraction result: ${invalidData.success ? 'SUCCESS' : 'FAILED'} ${invalidData.error?.code || ''}`.gray);
        this.logTest('Block data extraction on pending pipeline',
            !invalidData.success && invalidData.error?.code === 'INVALID_STATE',
            invalidData.error?.error || 'Expected INVALID_STATE error');

        // Test reset on non-failed pipeline
        console.log('   🚫 Testing invalid reset on pending pipeline...'.gray);
        const invalidReset = await this.makeRequest('POST', `/${pipeline.pipeline_id}/reset`);
        console.log(`   📊 Reset result: ${invalidReset.success ? 'SUCCESS' : 'FAILED'} ${invalidReset.error?.code || ''}`.gray);
        this.logTest('Block reset on pending pipeline',
            !invalidReset.success && invalidReset.error?.code === 'INVALID_STATE',
            invalidReset.error?.error || 'Expected INVALID_STATE error');
    }

    async testButtonSpamProtection() {
        console.log('\n🖱️  Testing Button Spam Protection'.cyan.bold);

        await this.debugOperationStatus();

        console.log('   🔧 Creating test pipeline for button spam test...'.gray);
        const pipeline = await this.createTestPipeline('Button-Spam-Test');
        if (!pipeline) {
            this.logTest('Setup pipeline for button spam test', false);
            return;
        }

        // Start research
        console.log('   🚀 Starting first research request...'.gray);
        const first = await this.makeRequest('POST', `/${pipeline.pipeline_id}/research`);
        console.log(`   📊 First request result: ${first.success ? 'SUCCESS' : 'FAILED'} ${first.error?.code || ''}`.gray);
        this.logTest('First research request succeeds', first.success,
            first.success ? 'First request accepted' : first.error?.error);

        if (!first.success) {
            console.log('   🔴 First request failed, skipping spam test'.red);
            return;
        }

        // Immediate second request (simulate double-click)
        console.log('   🖱️ Sending immediate second request (simulating double-click)...'.gray);
        const second = await this.makeRequest('POST', `/${pipeline.pipeline_id}/research`);
        console.log(`   📊 Second request result: ${second.success ? 'SUCCESS' : 'FAILED'} ${second.error?.code || ''} - ${second.error?.error || ''}`.gray);
        this.logTest('Button spam protection blocks duplicate request',
            !second.success && (second.error?.code === 'OPERATION_IN_PROGRESS' || second.error?.code === 'SYSTEM_BUSY'),
            second.error?.error || 'Expected OPERATION_IN_PROGRESS or SYSTEM_BUSY');

        console.log('   ⏳ Waiting for operation to complete...'.gray);
        await this.waitForOperationsToComplete();
    }

    async testPipelineNotFound() {
        console.log('\n🔍 Testing Pipeline Not Found'.cyan.bold);

        const fakeId = 999999;

        const tests = [
            { method: 'POST', path: `/research`, name: 'Research on non-existent pipeline' },
            { method: 'POST', path: `/legal-resolution`, name: 'Legal resolution on non-existent pipeline' },
            { method: 'POST', path: `/data-extraction`, name: 'Data extraction on non-existent pipeline' },
            { method: 'POST', path: `/reset`, name: 'Reset on non-existent pipeline' },
            { method: 'DELETE', path: '', name: 'Delete non-existent pipeline' }
        ];

        for (const test of tests) {
            const result = await this.makeRequest(test.method, `/${fakeId}${test.path}`);
            this.logTest(test.name,
                !result.success && result.error?.code === 'PIPELINE_NOT_FOUND',
                result.error?.error || 'Expected PIPELINE_NOT_FOUND error');
        }
    }

    async testDeleteSafety() {
        console.log('\n🗑️  Testing Delete Safety'.cyan.bold);

        await this.debugOperationStatus();

        console.log('   🔧 Creating test pipeline for delete safety test...'.gray);
        const pipeline = await this.createTestPipeline('Delete-Safety-Test');
        if (!pipeline) {
            this.logTest('Setup pipeline for delete safety test', false);
            return;
        }

        // Start research to make pipeline "running"
        console.log('   🚀 Starting research to make pipeline running...'.gray);
        const startResult = await this.makeRequest('POST', `/${pipeline.pipeline_id}/research`);
        console.log(`   📊 Research start result: ${startResult.success ? 'SUCCESS' : 'FAILED'} ${startResult.error?.code || ''}`.gray);
        this.logTest('Start research for delete safety test', startResult.success,
            startResult.success ? 'Pipeline is now running' : startResult.error?.error);

        if (!startResult.success) {
            console.log('   🔴 Failed to start research, skipping delete test'.red);
            return;
        }

        // Try to delete running pipeline
        console.log('   🚫 Attempting to delete running pipeline...'.gray);
        const deleteResult = await this.makeRequest('DELETE', `/${pipeline.pipeline_id}`);
        console.log(`   📊 Delete result: ${deleteResult.success ? 'SUCCESS' : 'FAILED'} ${deleteResult.error?.code || ''} - ${deleteResult.error?.error || ''}`.gray);
        this.logTest('Block delete of running pipeline',
            !deleteResult.success && deleteResult.error?.code === 'INVALID_STATE',
            deleteResult.error?.error || 'Expected INVALID_STATE error');

        console.log('   ⏳ Waiting for operation to complete...'.gray);
        await this.waitForOperationsToComplete();
    }

    async testResetRestrictions() {
        console.log('\n🔄 Testing Reset Restrictions'.cyan.bold);

        await this.debugOperationStatus();

        console.log('   🔧 Creating test pipeline for reset restrictions...'.gray);
        const pipeline = await this.createTestPipeline('Reset-Restrictions-Test');
        if (!pipeline) {
            this.logTest('Setup pipeline for reset restrictions', false);
            return;
        }

        // Test reset on various invalid states
        const invalidStates = ['pending', 'research_complete', 'legal_resolution_complete', 'data_extraction_complete'];
        console.log(`   📝 Testing reset on invalid states: ${invalidStates.join(', ')}`.gray);

        for (const status of invalidStates) {
            console.log(`   🔄 Setting pipeline status to: ${status}`.gray);
            await this.setTestPipelineStatus(pipeline.pipeline_id, status);
            const resetResult = await this.makeRequest('POST', `/${pipeline.pipeline_id}/reset`);
            console.log(`   📊 Reset on ${status}: ${resetResult.success ? 'SUCCESS' : 'FAILED'} ${resetResult.error?.code || ''}`.gray);
            this.logTest(`Block reset on ${status} pipeline`,
                !resetResult.success && resetResult.error?.code === 'INVALID_STATE',
                resetResult.error?.error || 'Expected INVALID_STATE error');
        }

        // Test valid reset on failed state
        console.log('   🔧 Testing valid reset on failed state...'.gray);
        await this.setTestPipelineStatus(pipeline.pipeline_id, 'research_failed');
        const validReset = await this.makeRequest('POST', `/${pipeline.pipeline_id}/reset`);
        console.log(`   📊 Reset on failed: ${validReset.success ? 'SUCCESS' : 'FAILED'} ${validReset.error?.code || ''}`.gray);
        this.logTest('Allow reset on failed pipeline', validReset.success,
            validReset.success ? 'Reset successful' : validReset.error?.error);
    }

    async testCancelOperation() {
        console.log('\n⏹️  Testing Cancel Operation'.cyan.bold);

        await this.debugOperationStatus();

        console.log('   🔧 Creating test pipeline for cancel test...'.gray);
        const pipeline = await this.createTestPipeline('Cancel-Test');
        if (!pipeline) {
            this.logTest('Setup pipeline for cancel test', false);
            return;
        }

        // Test cancel on non-running pipeline (should fail with INVALID_STATE)
        console.log('   🚫 Testing cancel on non-running pipeline...'.gray);
        const invalidCancelResult = await this.makeRequest('POST', `/${pipeline.pipeline_id}/cancel`, { reason: 'test' });
        console.log(`   📊 Cancel on pending result: ${invalidCancelResult.success ? 'SUCCESS' : 'FAILED'} ${invalidCancelResult.error?.code || ''}`.gray);
        this.logTest('Block cancel on non-running pipeline',
            !invalidCancelResult.success && invalidCancelResult.error?.code === 'INVALID_STATE',
            invalidCancelResult.error?.error || 'Expected INVALID_STATE error');

        // Start research to make pipeline cancellable
        console.log('   🚀 Starting research to make pipeline cancellable...'.gray);
        const startResult = await this.makeRequest('POST', `/${pipeline.pipeline_id}/research`);
        console.log(`   📊 Research start result: ${startResult.success ? 'SUCCESS' : 'FAILED'} ${startResult.error?.code || ''}`.gray);

        if (startResult.success) {
            // Test cancel on running pipeline (should succeed)
            console.log('   🛑 Testing cancel on running pipeline...'.gray);
            const validCancelResult = await this.makeRequest('POST', `/${pipeline.pipeline_id}/cancel`, { reason: 'test_cancel' });
            console.log(`   📊 Cancel on running result: ${validCancelResult.success ? 'SUCCESS' : 'FAILED'} ${validCancelResult.error?.code || ''}`.gray);
            this.logTest('Cancel running pipeline succeeds',
                validCancelResult.success,
                validCancelResult.success ? 'Cancel successful' : validCancelResult.error?.error);
        } else {
            console.log('   🔴 Could not start research, skipping running cancel test'.red);
            this.logTest('Cancel running pipeline succeeds', false, 'Could not create running pipeline to test');
        }
    }

    async testResponseTiming() {
        console.log('\n⏱️  Testing Response Timing'.cyan.bold);

        const pipeline = await this.createTestPipeline();
        if (!pipeline) {
            this.logTest('Setup pipeline for timing test', false);
            return;
        }

        // Test that validation responses are immediate
        const startTime = Date.now();
        const invalidResult = await this.makeRequest('POST', `/${pipeline.pipeline_id}/legal-resolution`);
        const responseTime = Date.now() - startTime;

        this.logTest('Validation responses are immediate',
            responseTime < 1000, // Should be much faster than 1 second
            `Response time: ${responseTime}ms (should be < 1000ms)`);
    }

    // ============================================
    // MAIN TEST RUNNER
    // ============================================

    async runAllTests() {
        console.log('🧪 PipelineStateManager Test Suite'.rainbow.bold);
        console.log('=' .repeat(50));

        // Authenticate first
        console.log('🔐 Authenticating...'.yellow);
        const authenticated = await this.authenticate();
        if (!authenticated) {
            console.error('🔴 Authentication failed. Please check AUTH_PASSWORD environment variable.'.red);
            console.log('💡 Set AUTH_PASSWORD environment variable or update the password in the script.'.gray);
            return;
        }
        console.log('🟢 Authentication successful'.green);

        try {
            // If operations are blocked at start, try to cancel them
            const testPipeline = await this.createTestPipeline('Initial-Block-Check');
            if (testPipeline) {
                const result = await this.makeRequest('POST', `/${testPipeline.pipeline_id}/legal-resolution`);
                if (result.error?.code === 'SYSTEM_BUSY') {
                    console.log('🛑 Operations blocked at start - attempting to cancel running operations...'.yellow);
                    await this.cancelAllRunningOperations();
                }
                await this.makeRequest('DELETE', `/${testPipeline.pipeline_id}`);
                this.testPipelines = this.testPipelines.filter(id => id !== testPipeline.pipeline_id);
            }

            await this.testGlobalOperationBlocking();
            await this.testStateValidation();
            await this.testButtonSpamProtection();
            await this.testPipelineNotFound();
            await this.testDeleteSafety();
            await this.testResetRestrictions();
            await this.testCancelOperation();
            await this.testResponseTiming();

        } catch (error) {
            console.error('🔴 Test suite error:'.red, error.message);
        }

        await this.cleanup();
        this.printResults();
    }

    printResults() {
        const executionTime = Date.now() - this.startTime;
        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        const success = passed === total;

        console.log('\n' + '='.repeat(50));
        console.log(`📊 Test Results: ${passed}/${total} passed`[success ? 'green' : 'red']);
        console.log(`⏱️  Execution time: ${executionTime}ms`.gray);

        if (!success) {
            console.log('\n🔴 Failed tests:'.red);
            this.testResults
                .filter(r => !r.passed)
                .forEach(test => console.log(`   • ${test.name}`.red));
        }

        console.log('\n' + (success ? '🟢 All tests passed!' : '🔴 Some tests failed').bold);
    }
}

// ============================================
// SCRIPT EXECUTION
// ============================================

async function main() {
    // Check if server is running by trying to reach the login page
    try {
        await axios.get('http://localhost:3000/login', { timeout: 3000 });
    } catch (error) {
        console.error('🔴 Server not running or not accessible. Please start the server first.'.red);
        console.log('💡 Try: npm start'.gray);
        process.exit(1);
    }

    const tester = new StateManagerTester();
    await tester.runAllTests();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Test script error:'.red, error.message);
        process.exit(1);
    });
}

module.exports = StateManagerTester;