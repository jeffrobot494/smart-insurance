#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get EIN from command line arguments
const ein = process.argv[2];

if (!ein) {
    console.error('Usage: node search_ein.js "EIN_NUMBER"');
    console.error('Example: node search_ein.js "231352636"');
    process.exit(1);
}

// Remove any non-digit characters from EIN for consistent matching
const cleanEIN = ein.replace(/\D/g, '');

if (cleanEIN.length !== 9) {
    console.error('Error: EIN must be 9 digits');
    console.error('Example: 231352636 or 23-1352636');
    process.exit(1);
}

// Define datasets to search
const datasets = [
    { path: path.join(__dirname, 'data', 'F_SCH_A_2022_latest.csv'), year: '2022' },
    { path: path.join(__dirname, 'data', 'F_SCH_A_2023_latest.csv'), year: '2023' },
    { path: path.join(__dirname, 'data', 'F_SCH_A_2024_latest.csv'), year: '2024' }
];

console.log(`Searching for EIN: ${cleanEIN}`);
console.log('='.repeat(50));

let totalFoundRecords = 0;

// Search through each dataset
for (const dataset of datasets) {
    console.log(`\n📊 Searching ${dataset.year} dataset...`);
    
    // Check if file exists
    if (!fs.existsSync(dataset.path)) {
        console.log(`⚠️  Warning: Dataset not found at ${dataset.path}`);
        continue;
    }

    try {
        const foundRecords = searchDataset(dataset.path, cleanEIN, dataset.year);
        totalFoundRecords += foundRecords;
        
        if (foundRecords === 0) {
            console.log(`No records found in ${dataset.year} dataset`);
        } else {
            console.log(`Found ${foundRecords} record(s) in ${dataset.year} dataset`);
        }
    } catch (error) {
        console.error(`Error searching ${dataset.year} dataset:`, error.message);
    }
}

console.log('\n' + '='.repeat(50));
console.log(`🔍 Total records found across all datasets: ${totalFoundRecords}`);

// Function to search a single dataset
function searchDataset(csvPath, cleanEIN, year) {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    
    if (lines.length < 2) {
        throw new Error('CSV file appears to be empty or invalid');
    }
    
    const headers = lines[0].split(',');
    const einIndex = headers.findIndex(header => 
        header.replace(/"/g, '') === 'SCH_A_EIN'
    );
    
    if (einIndex === -1) {
        throw new Error('Could not find SCH_A_EIN column in CSV');
    }
    
    let foundRecords = 0;
    
    // Search through all data rows
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = parseCSVRow(line);
        
        if (row.length > einIndex) {
            const recordEIN = row[einIndex].replace(/"/g, '').replace(/\D/g, '');
            
            if (recordEIN === cleanEIN) {
                foundRecords++;
                console.log(`\n--- ${year} Record ${foundRecords} ---`);
                
                // Print the entire record with headers (only non-empty values)
                for (let j = 0; j < Math.min(headers.length, row.length); j++) {
                    const header = headers[j].replace(/"/g, '');
                    const value = row[j].replace(/"/g, '').trim();
                    
                    // Only print if value is not empty
                    if (value && value.length > 0) {
                        console.log(`${header}: ${value}`);
                    }
                }
                console.log('-'.repeat(50));
            }
        }
    }
    
    return foundRecords;
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