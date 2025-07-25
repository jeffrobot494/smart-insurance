#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get JSON file path from command line arguments
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
    console.error('Usage: node legal_entity_lookup.js "path/to/companies.json"');
    process.exit(1);
}

if (!fs.existsSync(jsonFilePath)) {
    console.error(`Error: JSON file not found at ${jsonFilePath}`);
    process.exit(1);
}

// Read API key from .env file
function loadPerplexityApiKey() {
    const envPath = path.join(__dirname, '..', '..', 'server', '.env');
    
    if (!fs.existsSync(envPath)) {
        console.error('Error: .env file not found at', envPath);
        process.exit(1);
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
        if (line.startsWith('PERPLEXITY_API_KEY=')) {
            return line.split('=')[1];
        }
    }
    
    console.error('Error: PERPLEXITY_API_KEY not found in .env file');
    process.exit(1);
}

// Function to trim citations from Perplexity responses
function trimCitations(text) {
    // Remove citations like [1], [2], [1][2], etc.
    return text.replace(/\[\d+\](\[\d+\])*/g, '').trim();
}

// Make API call to Perplexity
async function lookupLegalEntity(companyName, firmName) {
    const apiKey = loadPerplexityApiKey();
    const prompt = `What legal entity is DBA ${companyName}, the portfolio company of ${firmName}? Return ONLY the legal entity name or most likely legal entity name with no commentary. For example, the response should look like: 'Insurance Systems Inc.'`;
    
    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 100
            })
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
            const result = data.choices[0].message.content.trim();
            return trimCitations(result);
        } else {
            throw new Error('No valid response from API');
        }
        
    } catch (error) {
        throw new Error(`API call failed: ${error.message}`);
    }
}

// Main function to process all unmatched companies
async function main() {
    // Read company objects from JSON file
    const companyObjects = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    const unmatchedCompanies = companyObjects.filter(company => !company.matched);
    
    console.log(`Loaded ${companyObjects.length} companies from JSON file.`);
    console.log(`Found ${unmatchedCompanies.length} unmatched companies to process.`);
    
    if (unmatchedCompanies.length === 0) {
        console.log('No unmatched companies to process for legal entity lookup.');
        return;
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('LEGAL ENTITY LOOKUP FOR UNMATCHED COMPANIES');
    console.log('='.repeat(70));
    
    let processedCount = 0;
    let successCount = 0;
    
    for (const company of unmatchedCompanies) {
        processedCount++;
        console.log(`\n[${processedCount}/${unmatchedCompanies.length}] Looking up: ${company.name}`);
        
        try {
            const legalEntity = await lookupLegalEntity(company.name, company.firm);
            
            if (legalEntity && legalEntity.trim() !== '') {
                company.legal_entity = legalEntity.trim();
                successCount++;
                console.log(`✓ Found: ${legalEntity.trim()}`);
            } else {
                console.log(`✗ No result found`);
            }
            
        } catch (error) {
            console.error(`✗ Error: ${error.message}`);
        }
        
        // Add delay to avoid overwhelming the API
        if (processedCount < unmatchedCompanies.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // Write updated objects back to JSON file
    fs.writeFileSync(jsonFilePath, JSON.stringify(companyObjects, null, 2), 'utf8');
    
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Processed: ${processedCount} companies`);
    console.log(`Successful lookups: ${successCount}`);
    console.log(`Failed lookups: ${processedCount - successCount}`);
    console.log(`✓ Updated company objects written back to: ${jsonFilePath}`);
}

// Run the main function
main().catch(console.error);