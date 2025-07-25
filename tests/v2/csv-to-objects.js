#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get CSV file path from command line arguments
const csvFilePath = process.argv[2];

if (!csvFilePath) {
    console.error('Usage: node csv-to-objects.js "path/to/companies.csv"');
    process.exit(1);
}

if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: CSV file not found at ${csvFilePath}`);
    process.exit(1);
}

// Generate output file path (same directory, same name with .json extension)
const outputFilePath = csvFilePath.replace(/\.csv$/i, '.json');

console.log(`Converting CSV to JSON objects...`);
console.log(`Input: ${csvFilePath}`);
console.log(`Output: ${outputFilePath}`);

// Read and convert CSV to company objects
const companyObjects = convertCSVToObjects(csvFilePath);

// Write to JSON file
fs.writeFileSync(outputFilePath, JSON.stringify(companyObjects, null, 2), 'utf8');

console.log(`✓ Successfully converted ${companyObjects.length} companies to JSON objects`);
console.log(`✓ Output written to: ${outputFilePath}`);

// Function to convert CSV to company objects
function convertCSVToObjects(filePath) {
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
                    console.log(`Private equity firm: "${firmName}"`);
                } else {
                    // All subsequent rows are company names
                    companyObjects.push({
                        name: name,
                        firm: firmName,
                        legal_entity: name,
                        matched: false
                    });
                }
            }
        }
    }
    
    return companyObjects;
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