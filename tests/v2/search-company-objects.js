#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get JSON file path from command line arguments
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
    console.error('Usage: node search-company-objects.js "path/to/companies.json"');
    process.exit(1);
}

if (!fs.existsSync(jsonFilePath)) {
    console.error(`Error: JSON file not found at ${jsonFilePath}`);
    process.exit(1);
}

// Define datasets to search
const datasets = [
    { path: path.join(__dirname, '..', 'data', 'f_5500_2022_latest.csv'), year: '2022' },
    { path: path.join(__dirname, '..', 'data', 'f_5500_2023_latest.csv'), year: '2023' },
    { path: path.join(__dirname, '..', 'data', 'f_5500_2024_latest.csv'), year: '2024' }
];

// Read company objects from JSON file
const companyObjects = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
console.log(`Loaded ${companyObjects.length} companies from JSON file.`);
console.log('='.repeat(70));

// Track results for each company
const companyResults = {};

// Search for each company
for (const companyObj of companyObjects) {
    const companyName = companyObj.legal_entity;
    
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
    
    // Store results for this company (use the display name for results key)
    const displayName = companyObj.name;
    companyResults[displayName] = {
        totalRecords,
        uniqueSponsors: Array.from(sponsorNames),
        sponsorCount: sponsorNames.size
    };
    
    // Update the matched field in the company object
    if (totalRecords > 0 && sponsorNames.size === 1) {
        companyObj.matched = true;
    }
}

// Write updated objects back to JSON file
fs.writeFileSync(jsonFilePath, JSON.stringify(companyObjects, null, 2), 'utf8');
console.log(`\n✓ Updated company objects written back to: ${jsonFilePath}`);

// Generate summary
console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));

let unambiguousCount = 0;
let ambiguousCount = 0;
let notFoundCount = 0;

for (const [displayName, result] of Object.entries(companyResults)) {
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
    
    console.log(`${displayName}: ${status}`);
}

const totalCompanies = companyObjects.length;
console.log('\nTotal:');
console.log(`    ${Math.round((unambiguousCount / totalCompanies) * 100)}% unambiguous`);
console.log(`    ${Math.round((ambiguousCount / totalCompanies) * 100)}% ambiguous`);
console.log(`    ${Math.round((notFoundCount / totalCompanies) * 100)}% not found`);

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
            }
        }
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