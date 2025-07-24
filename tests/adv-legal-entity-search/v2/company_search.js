const fs = require('fs');
const path = require('path');

async function processCompanies(csvFilePath) {
    // Read CSV file and extract first column
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const companies = lines.map(line => line.split(',')[0].trim()).filter(name => name);
    
    if (companies.length < 2) {
        console.log('Need at least 2 entries (firm + companies)');
        return;
    }
    
    const firm = companies[0];
    const companyObjects = [];
    
    // Process each company starting from index 1
    for (let i = 1; i < companies.length; i++) {
        const companyName = companies[i];
        
        // Create initial company object
        const companyObj = {
            "name": companyName,
            "legal-entity": "",
            "zip-code": "",
            "years": []
        };
        
        try {
            // Call Perplexity API for zip code
            const zipCode = await getZipCodeFromPerplexity(companyName, firm);
            companyObj["zip-code"] = zipCode;
        } catch (error) {
            console.error(`Error getting zip code for ${companyName}:`, error.message);
        }
        
        companyObjects.push(companyObj);
    }
    
    console.log('Final company objects:', JSON.stringify(companyObjects, null, 2));
    return companyObjects;
}

function removeCitations(text) {
    // Remove citation patterns like [1], [2], [1][2], etc.
    return text.replace(/\[\d+\](\[\d+\])*/g, '').trim();
}

async function getZipCodeFromPerplexity(company, firm) {
    const apiKey = "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";
    const message = `Please find the zip code of the company ${company}, which is a portfolio company of the private equity firm ${firm}. Return ONLY the zip code in your response - no commentary. The zip code is a five digit number.`;
    
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
                    content: message
                }
            ]
        })
    });
    
    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    const rawContent = data.choices[0].message.content.trim();
    return removeCitations(rawContent);
}

// Example usage
if (require.main === module) {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.log('Usage: node company_search.js <csv-file-path>');
        process.exit(1);
    }
    
    processCompanies(csvPath).catch(console.error);
}

module.exports = { processCompanies };