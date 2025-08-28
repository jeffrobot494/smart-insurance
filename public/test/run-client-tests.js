#!/usr/bin/env node
// Command-line test runner for client-side error handling
// Note: This runs in a headless browser environment using jsdom

const fs = require('fs');
const path = require('path');

// Check if jsdom is available
let jsdom;
try {
    jsdom = require('jsdom');
} catch (error) {
    console.log('🔧 Setting up headless browser environment...');
    console.log('jsdom is required to run client tests in Node.js');
    console.log('To install: npm install jsdom');
    console.log('');
    console.log('Alternative: Open /public/test/run-client-tests.html in a browser');
    process.exit(0);
}

const { JSDOM } = jsdom;

// Setup DOM environment
function setupDOM() {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Client Error Handling Tests</title>
            <style>
                /* Minimal CSS for testing */
                .notification-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1000;
                    max-width: 400px;
                }
                .notification {
                    background: white;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    transform: translateX(100%);
                    opacity: 0;
                    transition: all 0.3s ease;
                    border-left: 4px solid #007bff;
                }
                .notification-error { border-left-color: #dc3545; }
                .notification-success { border-left-color: #28a745; }
                .notification-show {
                    transform: translateX(0);
                    opacity: 1;
                }
            </style>
        </head>
        <body>
        </body>
        </html>
    `;
    
    const dom = new JSDOM(html, {
        url: 'http://localhost:3000',
        pretendToBeVisual: true,
        resources: 'usable'
    });
    
    return dom.window;
}

// Load JavaScript files
function loadScript(window, filePath) {
    try {
        const fullPath = path.resolve(__dirname, '..', filePath);
        const scriptContent = fs.readFileSync(fullPath, 'utf8');
        
        // Create a script context with window globals
        const scriptWithWindow = `
            (function(window, document) {
                ${scriptContent}
            })(this, this.document);
        `;
        
        // Execute the script in the window context
        window.eval(scriptWithWindow);
        
        return true;
    } catch (error) {
        console.error(`Failed to load ${filePath}:`, error.message);
        return false;
    }
}

async function runClientTests() {
    console.log('🚀 Starting Client-Side Error Handling Tests (Headless)');
    console.log('========================================================\n');
    
    // Setup DOM environment
    const window = setupDOM();
    global.window = window;
    global.document = window.document;
    
    // Load required scripts in order
    const scriptsToLoad = [
        'js/utils.js',
        'js/api.js',
        'js/components/base/BaseComponent.js',
        'js/components/pipeline/ActionButtons.js',
        'js/components/NotificationManager.js',
        'test/client-error-handling-tests.js'
    ];
    
    console.log('📚 Loading required scripts...');
    
    let allLoaded = true;
    for (const scriptPath of scriptsToLoad) {
        const loaded = loadScript(window, scriptPath);
        if (loaded) {
            console.log(`  ✅ ${scriptPath}`);
        } else {
            console.log(`  ❌ ${scriptPath}`);
            allLoaded = false;
        }
    }
    
    if (!allLoaded) {
        console.log('\n❌ Some scripts failed to load. Tests cannot continue.');
        process.exit(1);
    }
    
    console.log('\n🧪 Running test suite...\n');
    
    try {
        // Access the test function from the window context
        const testFunction = window.runClientErrorTests;
        
        if (typeof testFunction !== 'function') {
            throw new Error('runClientErrorTests function not found. Check script loading.');
        }
        
        // Run the tests
        const success = await testFunction();
        
        console.log('\n========================================================');
        if (success) {
            console.log('🎉 All client-side error handling tests passed!');
            console.log('The error handling system is ready for production.');
            process.exit(0);
        } else {
            console.log('💥 Some tests failed. Please review the implementation.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n💥 Test execution failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Handle command line execution
if (require.main === module) {
    runClientTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runClientTests };