#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Load environment from server directory
const serverDir = path.join(__dirname, '..', 'server');
process.chdir(serverDir);
require(path.join(serverDir, 'utils', 'load-env'));

class PerplexityComparison {
    constructor() {
        this.process = null;
        this.tools = [];
    }

    async init() {
        const mcpPath = path.join(__dirname, '..', 'server', 'mcp', 'perplexity');
        
        this.process = spawn('python', ['perplexity-search.py'], {
            cwd: mcpPath,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env
        });

        await this.send({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: { protocolVersion: '2024-11-05' }});
        await this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const toolsResult = await this.send({ jsonrpc: '2.0', id: 'tools', method: 'tools/list' });
        this.tools = toolsResult.tools;
    }

    async send(message) {
        return new Promise((resolve, reject) => {
            const handler = (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === message.id) {
                            this.process.stdout.removeListener('data', handler);
                            resolve(response.result || response);
                            return;
                        }
                    } catch {}
                }
            };

            this.process.stdout.on('data', handler);
            this.process.stdin.write(JSON.stringify(message) + '\n');

            setTimeout(() => {
                this.process.stdout.removeListener('data', handler);
                reject(new Error('Timeout'));
            }, 30000);
        });
    }

    async callTool(name, args) {
        const result = await this.send({
            jsonrpc: '2.0',
            id: `call_${Date.now()}`,
            method: 'tools/call',
            params: { name, arguments: args }
        });
        return result;
    }

    async compare(prompt) {
        console.log(`\n=== SEARCH_WEB ===`);
        try {
            const webResult = await this.callTool('search_web', { query: prompt });
            console.log(JSON.stringify(webResult, null, 2));
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }

        console.log(`\n=== ASK_FACTUAL_QUESTION ===`);
        try {
            const factualResult = await this.callTool('ask_factual_question', { question: prompt });
            console.log(JSON.stringify(factualResult, null, 2));
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    }

    cleanup() {
        if (this.process) this.process.kill();
    }
}

const prompt = process.argv.slice(2).join(' ');
if (!prompt) {
    console.log('Usage: node perplexity-tool-comparison.js "Your question"');
    process.exit(1);
}

const comp = new PerplexityComparison();
comp.init()
    .then(() => comp.compare(prompt))
    .then(() => comp.cleanup())
    .catch(err => {
        console.error(err.message);
        comp.cleanup();
    });