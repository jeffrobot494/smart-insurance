#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const csv = require('csv-parser');
require('dotenv').config();

class PerplexityCompanyVerifier {
    constructor() {
        this.perplexityApiKey = process.env.PERPLEXITY_API_KEY;
        
        if (!this.perplexityApiKey) {
            console.error('Error: PERPLEXITY_API_KEY not found in environment variables.');
            console.error('Make sure you have a .env file with PERPLEXITY_API_KEY set.');
            process.exit(1);
        }

        this.client = new OpenAI({
            apiKey: this.perplexityApiKey,
            baseURL: 'https://api.perplexity.ai'
        });

        this.results = [];
    }

    async readCsvFile(filePath) {
        return new Promise((resolve, reject) => {
            const companies = [];
            
            if (!fs.existsSync(filePath)) {
                reject(new Error(`CSV file not found: ${filePath}`));
                return;
            }

            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Assume the first column contains company names
                    const companyName = Object.values(row)[0]?.trim();
                    if (companyName) {
                        companies.push(companyName);
                    }
                })
                .on('end', () => {
                    console.log(`✓ Loaded ${companies.length} companies from CSV`);
                    resolve(companies);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    async queryPerplexity(question, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.client.chat.completions.create({
                    model: 'sonar-pro',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a financial research assistant. Provide accurate, factual answers based on current information. Be concise and specific. If information is not available or uncertain, clearly state so.'
                        },
                        {
                            role: 'user',
                            content: question
                        }
                    ],
                    max_tokens: 300
                });

                return response.choices[0].message.content.trim();
            } catch (error) {
                console.error(`  ⚠️ Attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === retries) {
                    return `Error: ${error.message}`;
                }
                
                // Wait before retry (exponential backoff)
                await this.delay(1000 * Math.pow(2, attempt - 1));
            }
        }
    }

    async verifyCompany(peFirm, company, index, total) {
        console.log(`\n📋 Processing company ${index + 1}/${total}: ${company}`);
        
        const questions = [
            `Is ${peFirm} actively and currently invested in ${company}? Your MUST be ONLY either "yes" or "no" - no additional text.`,
            `Is ${peFirm} a majority or minority shareholder in ${company}? Your MUST be ONLY either "majority", "minority", or "unknown" - no additional text.`,
            `What is the name of the legal entity that would file Department of Labor documents for ${company}? Your answer MUST be ONLY the exact legal name - no additional text.`
        ];

        const answers = [];
        
        for (let i = 0; i < questions.length; i++) {
            console.log(`  🔍 Query ${i + 1}/3...`);
            const answer = await this.queryPerplexity(questions[i]);
            answers.push(answer);
            
            // Rate limiting - wait between queries
            if (i < questions.length - 1) {
                await this.delay(1500);
            }
        }

        const result = {
            company: company,
            activeInvestment: answers[0],
            shareholderStatus: answers[1],
            legalEntity: answers[2]
        };

        this.results.push(result);
        console.log(`  ✓ Completed verification for ${company}`);
        
        return result;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatResults() {
        console.log('\n' + '='.repeat(120));
        console.log('PERPLEXITY COMPANY VERIFICATION RESULTS');
        console.log('='.repeat(120));
        
        // Calculate column widths
        const maxCompanyWidth = Math.max(20, Math.max(...this.results.map(r => r.company.length)));
        const maxActiveWidth = Math.max(25, Math.max(...this.results.map(r => r.activeInvestment.length)));
        const maxShareholderWidth = Math.max(20, Math.max(...this.results.map(r => r.shareholderStatus.length)));
        const maxLegalWidth = Math.max(30, Math.max(...this.results.map(r => r.legalEntity.length)));

        // Headers
        const companyHeader = 'Company'.padEnd(maxCompanyWidth);
        const activeHeader = 'Active Investment'.padEnd(maxActiveWidth);
        const shareholderHeader = 'Shareholder Status'.padEnd(maxShareholderWidth);
        const legalHeader = 'Legal Entity (DOL)'.padEnd(maxLegalWidth);
        
        console.log(`| ${companyHeader} | ${activeHeader} | ${shareholderHeader} | ${legalHeader} |`);
        console.log(`|${'-'.repeat(maxCompanyWidth + 2)}|${'-'.repeat(maxActiveWidth + 2)}|${'-'.repeat(maxShareholderWidth + 2)}|${'-'.repeat(maxLegalWidth + 2)}|`);
        
        // Data rows
        this.results.forEach(result => {
            const company = result.company.padEnd(maxCompanyWidth);
            const active = this.truncateText(result.activeInvestment, maxActiveWidth).padEnd(maxActiveWidth);
            const shareholder = this.truncateText(result.shareholderStatus, maxShareholderWidth).padEnd(maxShareholderWidth);
            const legal = this.truncateText(result.legalEntity, maxLegalWidth).padEnd(maxLegalWidth);
            
            console.log(`| ${company} | ${active} | ${shareholder} | ${legal} |`);
        });
        
        console.log('='.repeat(120));
        console.log(`Total companies verified: ${this.results.length}`);
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }

    async run(peFirm, csvFilePath) {
        try {
            console.log('🚀 Starting Perplexity Company Verification');
            console.log(`PE Firm: ${peFirm}`);
            console.log(`CSV File: ${csvFilePath}`);
            
            const companies = await this.readCsvFile(csvFilePath);
            
            if (companies.length === 0) {
                console.error('No companies found in CSV file.');
                return;
            }

            console.log(`\n📊 Verifying ${companies.length} companies against ${peFirm}...\n`);
            
            for (let i = 0; i < companies.length; i++) {
                await this.verifyCompany(peFirm, companies[i], i, companies.length);
                
                // Longer delay between companies to respect rate limits
                if (i < companies.length - 1) {
                    console.log('  ⏳ Waiting before next company...');
                    await this.delay(3000);
                }
            }

            this.formatResults();
            
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    }
}

// Command line interface
function showUsage() {
    console.log('\nUsage: node perplexity-company-verification.js <PE_FIRM_NAME> <CSV_FILE_PATH>');
    console.log('\nExample:');
    console.log('  node perplexity-company-verification.js "Blackstone Group" companies.csv');
    console.log('\nThe CSV file should have company names in the first column.');
    console.log('Make sure PERPLEXITY_API_KEY is set in your .env file.\n');
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length !== 2) {
        console.error('Error: Invalid number of arguments.');
        showUsage();
        process.exit(1);
    }
    
    const [peFirm, csvFilePath] = args;
    
    if (!peFirm.trim()) {
        console.error('Error: PE firm name cannot be empty.');
        showUsage();
        process.exit(1);
    }
    
    const verifier = new PerplexityCompanyVerifier();
    verifier.run(peFirm.trim(), csvFilePath);
}

if (require.main === module) {
    main();
}

module.exports = PerplexityCompanyVerifier;