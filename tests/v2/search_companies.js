#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Get CSV file path from command line arguments
const csvFilePath = process.argv[2];

if (!csvFilePath) {
    console.error('Usage: node search_companies.js "path/to/companies.csv"');
    process.exit(1);
}

if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: CSV file not found at ${csvFilePath}`);
    process.exit(1);
}

// Define datasets to search
const datasets = [
    { path: path.join(__dirname, '..', 'data', 'f_5500_2022_latest.csv'), year: '2022' },
    { path: path.join(__dirname, '..', 'data', 'f_5500_2023_latest.csv'), year: '2023' },
    { path: path.join(__dirname, '..', 'data', 'f_5500_2024_latest.csv'), year: '2024' }
];

async function main() {
    // Read company objects and firm name from CSV file
    const { firmName, companyObjects } = readCompanyObjectsFromCSV(csvFilePath);
    console.log(`Private equity firm: "${firmName}"`);
    console.log(`Found ${companyObjects.length} portfolio companies to search for.`);
    console.log('='.repeat(70));

    // Track results for each company
    const companyResults = {};

    // Search for each company
    for (const companyObj of companyObjects) {
        const companyName = companyObj.name;
        console.log(`\nSearching for company: "${companyName}"`);
        console.log('-'.repeat(50));
        
        const sponsorNames = new Set();
        let totalRecords = 0;
        
        // Search through each dataset
        for (const dataset of datasets) {
            if (!fs.existsSync(dataset.path)) {
                console.log(`⚠️  Warning: Dataset not found at ${dataset.path}`);
                continue;
            }

            try {
                const { foundRecords, uniqueSponsors } = searchDataset(dataset.path, companyName, dataset.year);
                totalRecords += foundRecords;
                
                // Add all unique sponsor names to our set
                uniqueSponsors.forEach(sponsor => sponsorNames.add(sponsor));
                
            } catch (error) {
                console.error(`Error searching ${dataset.year} dataset:`, error.message);
            }
        }
        
        // Store results for this company
        companyResults[companyName] = {
            totalRecords,
            uniqueSponsors: Array.from(sponsorNames),
            sponsorCount: sponsorNames.size
        };
        
        // Update the matched field in the company object
        if (totalRecords > 0 && sponsorNames.size === 1) {
            companyObj.matched = true;
        }
    }

    // Generate summary
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));

    let unambiguousCount = 0;
    let ambiguousCount = 0;
    let notFoundCount = 0;

    for (const [companyName, result] of Object.entries(companyResults)) {
        let status;
        if (result.totalRecords === 0) {
            status = 'not found';
            notFoundCount++;
        } else if (result.sponsorCount === 1) {
            status = 'unambiguous match - all records match';
            unambiguousCount++;
        } else {
            status = `ambiguous match - ${result.sponsorCount} different sponsors found amongst ${result.totalRecords} records`;
            ambiguousCount++;
        }
        
        console.log(`${companyName}: ${status}`);
    }

    const totalCompanies = companyObjects.length;
    console.log('\nTotal:');
    console.log(`    ${Math.round((unambiguousCount / totalCompanies) * 100)}% unambiguous`);
    console.log(`    ${Math.round((ambiguousCount / totalCompanies) * 100)}% ambiguous`);
    console.log(`    ${Math.round((notFoundCount / totalCompanies) * 100)}% not found`);

    // Process unmatched companies with legal entity lookup
    await processUnmatchedCompanies(firmName, companyObjects);

    console.log('\n' + '='.repeat(70));
    console.log('FINAL COMPANY OBJECTS');
    console.log('='.repeat(70));
    companyObjects.forEach((company, index) => {
        console.log(`${index + 1}. ${JSON.stringify(company, null, 2)}`);
    });
}

// Run the main function
main().catch(console.error);

// Function to process unmatched companies with legal entity lookup
async function processUnmatchedCompanies(firmName, companyObjects) {
    const unmatchedCompanies = companyObjects.filter(company => !company.matched);
    
    if (unmatchedCompanies.length === 0) {
        console.log('\nNo unmatched companies to process for legal entity lookup.');
        return;
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('LEGAL ENTITY LOOKUP FOR UNMATCHED COMPANIES');
    console.log('='.repeat(70));
    console.log(`Processing ${unmatchedCompanies.length} unmatched companies...`);
    
    for (const company of unmatchedCompanies) {
        console.log(`\nLooking up legal entity for: ${company.name}`);
        
        try {
            const scriptPath = path.join(__dirname, 'legal_entity_lookup.js');
            const { stdout } = await execAsync(`node "${scriptPath}" "${company.name}" "${firmName}"`);
            
            // Extract the legal entity from the output (last line should contain the result)
            const lines = stdout.trim().split('\n');
            const legalEntityResult = lines[lines.length - 1].trim();
            
            if (legalEntityResult && legalEntityResult !== '') {
                company.legal_entity = legalEntityResult;
                console.log(`✓ Found: ${legalEntityResult}`);
            } else {
                console.log(`✗ No result found`);
            }
            
        } catch (error) {
            console.error(`✗ Error looking up ${company.name}:`, error.message);
        }
        
        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Function to read company objects from CSV file (first column only)
function readCompanyObjectsFromCSV(filePath) {
    const csvData = fs.readFileSync(filePath, 'utf8');
    const lines = csvData.split('\n');
    
    let firmName = '';
    const companyObjects = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse the first column only
        const row = parseCSVRow(line);
        if (row.length > 0) {
            const name = row[0].replace(/"/g, '').trim();
            if (name) {
                if (i === 0 || (firmName === '' && companyObjects.length === 0)) {
                    // First non-empty row is the firm name
                    firmName = name;
                } else {
                    // All subsequent rows are company names
                    companyObjects.push({
                        name: name,
                        legal_entity: "",
                        matched: false
                    });
                }
            }
        }
    }
    
    return { firmName, companyObjects };
}

// Function to search a single dataset
function searchDataset(csvPath, companyName, year) {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    
    if (lines.length < 2) {
        throw new Error('CSV file appears to be empty or invalid');
    }
    
    const headers = lines[0].split(',');
    const sponsorNameIndex = headers.findIndex(header => 
        header.replace(/"/g, '') === 'SPONSOR_DFE_NAME'
    );
    
    if (sponsorNameIndex === -1) {
        throw new Error('Could not find SPONSOR_DFE_NAME column in CSV');
    }
    
    // Find indices for the fields to display
    const displayFields = [
        { name: 'SPONSOR_DFE_NAME', index: sponsorNameIndex },
        { name: 'SPONS_DFE_EIN', index: headers.findIndex(header => header.replace(/"/g, '') === 'SPONS_DFE_EIN') },
        { name: 'PLAN_NAME', index: headers.findIndex(header => header.replace(/"/g, '') === 'PLAN_NAME') },
        { name: 'SPONS_DFE_MAIL_US_STATE', index: headers.findIndex(header => header.replace(/"/g, '') === 'SPONS_DFE_MAIL_US_STATE') },
        { name: 'SPONS_DFE_MAIL_US_ZIP', index: headers.findIndex(header => header.replace(/"/g, '') === 'SPONS_DFE_MAIL_US_ZIP') }
    ];
    
    let foundRecords = 0;
    const searchLower = companyName.toLowerCase();
    const uniqueSponsors = new Set();
    
    // Search through all records
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = parseCSVRow(line);
        
        if (row.length > sponsorNameIndex) {
            const sponsorName = row[sponsorNameIndex].replace(/"/g, '');
            
            if (sponsorName.toLowerCase().includes(searchLower)) {
                foundRecords++;
                uniqueSponsors.add(sponsorName);
                
                console.log(`\n--- ${year} Record ${foundRecords} ---`);
                
                // Print the specified fields
                for (const field of displayFields) {
                    if (field.index !== -1 && field.index < row.length) {
                        const value = row[field.index].replace(/"/g, '').trim();
                        if (value && value.length > 0) {
                            console.log(`${field.name}: ${value}`);
                        }
                    }
                }
                console.log('-'.repeat(50));
            }
        }
    }
    
    if (foundRecords === 0) {
        console.log(`No records found in ${year} dataset`);
    } else {
        console.log(`Found ${foundRecords} record(s) in ${year} dataset`);
    }
    
    return { foundRecords, uniqueSponsors: Array.from(uniqueSponsors) };
}

// Simple CSV parser to handle quoted fields
function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    // Add the last field
    result.push(current);
    
    return result;
}