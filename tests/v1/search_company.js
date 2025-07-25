#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get company name and optional zip code from command line arguments
const companyName = process.argv[2];
const zipCode = process.argv[3]; // Optional zip code parameter

if (!companyName) {
    console.error('Usage: node search_company.js "Company Name" [zipCode]');
    process.exit(1);
}

// Define datasets to search
const datasets = [
    { path: path.join(__dirname, '..', 'data', 'f_5500_2022_latest.csv'), year: '2022' },
    { path: path.join(__dirname, '..', 'data', 'f_5500_2023_latest.csv'), year: '2023' },
    { path: path.join(__dirname, '..', 'data', 'f_5500_2024_latest.csv'), year: '2024' }
];

console.log(`Searching for company: "${companyName}"${zipCode ? ` with zip code: ${zipCode}` : ''}`);
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
        const foundRecords = searchDataset(dataset.path, companyName, dataset.year, zipCode);
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
function searchDataset(csvPath, companyName, year, zipCode = null) {
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
    
    // Find indices for the fields to display and zip code field
    const zipIndex = headers.findIndex(header => header.replace(/"/g, '') === 'SPONS_DFE_MAIL_US_ZIP');
    
    const displayFields = [
        { name: 'SPONSOR_DFE_NAME', index: sponsorNameIndex },
        { name: 'SPONS_DFE_EIN', index: headers.findIndex(header => header.replace(/"/g, '') === 'SPONS_DFE_EIN') },
        { name: 'PLAN_NAME', index: headers.findIndex(header => header.replace(/"/g, '') === 'PLAN_NAME') },
        { name: 'SPONS_DFE_MAIL_US_STATE', index: headers.findIndex(header => header.replace(/"/g, '') === 'SPONS_DFE_MAIL_US_STATE') },
        { name: 'SPONS_DFE_MAIL_US_ZIP', index: zipIndex }
    ];
    
    let foundRecords = 0;
    const searchLower = companyName.toLowerCase();
    const nameMatches = [];
    
    // First pass: Search by name only
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = parseCSVRow(line);
        
        if (row.length > sponsorNameIndex) {
            const sponsorName = row[sponsorNameIndex].replace(/"/g, '');
            
            if (sponsorName.toLowerCase().includes(searchLower)) {
                nameMatches.push({ row, line: i });
            }
        }
    }
    
    // Second pass: Apply zip code filtering if provided and multiple matches found
    let finalMatches = nameMatches;
    if (zipCode && nameMatches.length > 1 && zipIndex !== -1) {
        finalMatches = nameMatches.filter(match => {
            const rowZip = match.row[zipIndex] ? match.row[zipIndex].replace(/"/g, '').trim() : '';
            // Include if zip matches OR if no zip code in dataset
            return rowZip === zipCode || !rowZip || rowZip.length === 0;
        });
        
        if (finalMatches.length < nameMatches.length) {
            console.log(`Filtered from ${nameMatches.length} to ${finalMatches.length} records using zip code ${zipCode}`);
        }
    }
    
    // Display results
    for (const match of finalMatches) {
        foundRecords++;
        console.log(`\n--- ${year} Record ${foundRecords} ---`);
        
        // Print only the specified fields
        for (const field of displayFields) {
            if (field.index !== -1 && field.index < match.row.length) {
                const value = match.row[field.index].replace(/"/g, '').trim();
                if (value && value.length > 0) {
                    console.log(`${field.name}: ${value}`);
                }
            }
        }
        console.log('-'.repeat(50));
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