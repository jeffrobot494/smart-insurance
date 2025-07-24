#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get CSV file path from command line arguments
const csvFile = process.argv[2];

if (!csvFile) {
    console.error('Usage: node batch_research.js "companies.csv"');
    console.error('CSV file should have company names in the first column');
    process.exit(1);
}

// Check if CSV file exists
if (!fs.existsSync(csvFile)) {
    console.error(`Error: CSV file not found at ${csvFile}`);
    process.exit(1);
}

// Read and parse CSV file
try {
    console.log('🔍 Batch Company Research Tool');
    console.log('='.repeat(50));
    console.log(`Reading companies from: ${csvFile}`);
    
    const csvData = fs.readFileSync(csvFile, 'utf8');
    
    // DEBUG: Print the entire CSV content
    console.log('\n📋 DEBUG: Complete CSV file content:');
    console.log('='.repeat(80));
    console.log(csvData);
    console.log('='.repeat(80));
    console.log(`Total file size: ${csvData.length} characters`);
    console.log();
    
    const lines = csvData.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        console.error('Error: CSV file appears to be empty');
        process.exit(1);
    }
    
    // Extract company names (assume first column, handle CSV parsing)
    // Parse each line and look for the END delimiter within the CSV fields
    const companies = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parsed = parseCSVRow(line);
        const companyName = parsed[0] ? parsed[0].replace(/"/g, '').trim() : null;
        
        if (!companyName) continue;
        
        // Check if this is the END delimiter
        if (companyName.toUpperCase().includes('COMPANY NAMES END HERE')) {
            break;
        }
        
        // Check if this is the START delimiter
        if (companyName.toUpperCase().includes('COMPANY NAMES START HERE')) {
            continue;
        }
        
        // Filter out commentary and non-company entries
        const nameUpper = companyName.toUpperCase();
        const commentaryPatterns = [
            'ADDITIONAL CONTEXT:',
            'NOTES:',
            'THESE COMPANIES',
            'THE COMPANY OPERATES',
            'SOME INVESTMENT',
            'WOULD YOU LIKE',
            'TAKE ANY ADDITIONAL',
            'GATHER MORE SPECIFIC',
            'SOURCED FROM VERIFIED',
            'AMERICAN DISCOVERY CAPITAL',
            'AMERICAN DISCOVERY FUND',
            'CLOSED IN 20',
            'THE FIRM FOCUSES',
            'MAJORITY AND SIGNIFICANT',
            'FOUNDER-LED',
            'FAMILY-OWNED',
            'BUSINESS SERVICES',
            'SOFTWARE SECTORS',
            'PERFORM ANY ADDITIONAL',
            'RESEARCH ON SPECIFIC',
            'FROM THIS LIST',
            'IDENTIFIED FROM MULTIPLE',
            'PRESS RELEASES',
            'COMPANY WEBSITES',
            'OFFICIAL ANNOUNCEMENTS'
        ];
        
        let isCommentary = false;
        for (const pattern of commentaryPatterns) {
            if (nameUpper.includes(pattern)) {
                isCommentary = true;
                break;
            }
        }
        
        if (isCommentary) {
            continue;
        }
        
        // Filter out lines that look like numbered lists of commentary
        if (/^\d+\.\s*(notes|these|the company|some|would you|take any|gather|sourced)/i.test(companyName)) {
            continue;
        }
        
        companies.push(companyName);
    }
    
    if (companies.length === 0) {
        console.error('Error: No valid company names found in CSV');
        process.exit(1);
    }
    
    // DEBUG: Show parsing results
    console.log('\n📋 DEBUG: Parsing results:');
    console.log('='.repeat(50));
    console.log(`Total lines found: ${lines.length}`);
    console.log(`Valid companies extracted: ${companies.length}`);
    console.log();
    
    console.log('📋 DEBUG: All parsed lines with status:');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parsed = parseCSVRow(line);
        const companyName = parsed[0] ? parsed[0].replace(/"/g, '').trim() : null;
        
        let status = '';
        if (!companyName) {
            status = '❌ EMPTY';
        } else if (companyName.toUpperCase().includes('COMPANY NAMES END HERE')) {
            status = '🛑 END DELIMITER - STOPPED HERE';
        } else if (companyName.toUpperCase().includes('COMPANY NAMES START HERE')) {
            status = '🚀 START DELIMITER - SKIPPED';
        } else if (companies.includes(companyName)) {
            status = '✅ ACCEPTED';
        } else {
            status = '⚠️  FILTERED OUT (commentary)';
        }
        
        console.log(`  Line ${i + 1}: "${companyName}" ${status}`);
    }
    console.log();
    
    console.log(`📋 Final company list (${companies.length} companies):`);
    companies.forEach((company, index) => {
        console.log(`  ${index + 1}. ${company}`);
    });
    console.log();
    
    const results = [];
    let processed = 0;
    
    // STEP 1: Search company names in Form 5500 data
    console.log('📋 STEP 1: Searching company names in Form 5500 data');
    console.log('='.repeat(50));
    
    for (const company of companies) {
        processed++;
        console.log(`[${processed}/${companies.length}] Researching: ${company}`);
        
        try {
            // Execute search_company.js and capture output
            const searchScript = path.join(__dirname, 'search_company.js');
            const output = execSync(`node "${searchScript}" "${company}"`, { 
                encoding: 'utf8',
                timeout: 30000 // 30 second timeout
            });
            
            // Parse the output to extract EIN and years
            const result = parseSearchOutput(output, company);
            results.push(result);
            
            console.log(`   ✓ Found ${result.years.length} year(s) of data`);
            
        } catch (error) {
            console.log(`   ✗ Error searching company: ${error.message}`);
            results.push({
                company: company,
                ein: 'ERROR',
                years: [],
                schARecords: {},
                error: error.message
            });
        }
    }
    
    // STEP 2: Search EINs in SCH_A data
    console.log('\n📊 STEP 2: Searching EINs in SCH_A data');
    console.log('='.repeat(50));
    
    const companiesWithEIN = results.filter(r => r.ein && r.ein !== 'ERROR' && r.ein !== 'Not Found');
    
    for (let i = 0; i < companiesWithEIN.length; i++) {
        const result = companiesWithEIN[i];
        console.log(`[${i + 1}/${companiesWithEIN.length}] Searching EIN ${result.ein} for ${result.company}`);
        
        try {
            // Execute search_ein.js and capture output
            const searchEinScript = path.join(__dirname, 'search_ein.js');
            const output = execSync(`node "${searchEinScript}" "${result.ein}"`, { 
                encoding: 'utf8',
                timeout: 30000 // 30 second timeout
            });
            
            // Parse the output to extract SCH_A records by year
            const schAData = parseEinSearchOutput(output);
            result.schARecords = schAData.counts;
            result.schADetails = schAData.details;
            
            const totalSchARecords = Object.values(schAData.counts).reduce((sum, count) => sum + count, 0);
            console.log(`   ✓ Found ${totalSchARecords} SCH_A record(s) across all years`);
            
        } catch (error) {
            console.log(`   ✗ Error searching EIN: ${error.message}`);
            result.schARecords = {};
            result.schADetails = {};
            result.schAError = error.message;
        }
    }
    
    // Generate detailed Schedule A tables for each company
    console.log('\n📊 STEP 3: Generating Schedule A record details');
    console.log('='.repeat(50));
    
    for (const result of companiesWithEIN) {
        if (result.schADetails && Object.keys(result.schADetails).length > 0) {
            generateScheduleATable(result.schADetails, result.company);
        }
    }
    
    // Generate enhanced summary report
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE RESEARCH SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\nCompany Name | EIN | Form 5500 Years | SCH_A Records by Year');
    console.log('-'.repeat(80));
    
    for (const result of results) {
        const yearsStr = result.years.length > 0 ? result.years.join(', ') : 'None';
        const ein = result.ein || 'Not Found';
        
        // Format SCH_A records
        let schAStr = 'N/A';
        if (result.schARecords && Object.keys(result.schARecords).length > 0) {
            const schAEntries = Object.entries(result.schARecords)
                .filter(([year, count]) => count > 0)
                .map(([year, count]) => `${year}:${count}`)
                .join(', ');
            schAStr = schAEntries || 'None';
        }
        
        console.log(`${result.company.padEnd(25)} | ${ein.padEnd(12)} | ${yearsStr.padEnd(15)} | ${schAStr}`);
    }
    
    // Enhanced statistics
    const successfulSearches = results.filter(r => r.years.length > 0).length;
    const companiesWithEINCount = results.filter(r => r.ein && r.ein !== 'ERROR' && r.ein !== 'Not Found').length;
    const companiesWithSchARecords = results.filter(r => 
        r.schARecords && Object.values(r.schARecords).some(count => count > 0)
    ).length;
    
    console.log('\n' + '='.repeat(80));
    console.log('📈 STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total companies processed: ${results.length}`);
    console.log(`Companies with Form 5500 records: ${successfulSearches}`);
    console.log(`Companies with EIN identified: ${companiesWithEINCount}`);
    console.log(`Companies with SCH_A records: ${companiesWithSchARecords}`);
    
    // Export results to JSON for further processing
    const outputFile = csvFile.replace('.csv', '_research_results.json');
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed results exported to: ${outputFile}`);
    
} catch (error) {
    console.error('Error processing CSV file:', error.message);
    process.exit(1);
}

// Function to parse search_company.js output
function parseSearchOutput(output, companyName) {
    const result = {
        company: companyName,
        ein: null,
        years: [],
        recordCount: 0,
        schARecords: {}
    };
    
    const lines = output.split('\n');
    
    for (const line of lines) {
        // Look for successful records found
        const recordMatch = line.match(/Found (\d+) record\(s\) in (\d{4}) dataset/);
        if (recordMatch) {
            const count = parseInt(recordMatch[1]);
            const year = recordMatch[2];
            if (count > 0 && !result.years.includes(year)) {
                result.years.push(year);
                result.recordCount += count;
            }
            continue;
        }
        
        // Look for EIN in the detailed output
        const einMatch = line.match(/SPONSOR_EIN:\s*([0-9]+)/);
        if (einMatch && !result.ein) {
            result.ein = einMatch[1];
            continue;
        }
        
        // Alternative EIN patterns
        const einMatch2 = line.match(/EIN:\s*([0-9]+)/);
        if (einMatch2 && !result.ein) {
            result.ein = einMatch2[1];
        }
    }
    
    return result;
}

// Function to parse search_ein.js output (enhanced to capture full records)
function parseEinSearchOutput(output) {
    const schARecords = {};
    const schADetails = {};
    const lines = output.split('\n');
    
    let currentYear = null;
    let currentRecord = null;
    let recordData = {};
    let headers = [];
    let recordValues = [];
    
    for (const line of lines) {
        // Look for year dataset headers
        const yearMatch = line.match(/📊 Searching (\d{4}) dataset/);
        if (yearMatch) {
            currentYear = yearMatch[1];
            continue;
        }
        
        // Look for record headers
        const recordMatch = line.match(/--- (\d{4}) Record (\d+) ---/);
        if (recordMatch) {
            // Save previous record if it exists
            if (currentRecord && currentYear && recordValues.length > 0) {
                if (!schADetails[currentYear]) {
                    schADetails[currentYear] = [];
                }
                schADetails[currentYear].push({ 
                    headers: [...headers], 
                    values: [...recordValues],
                    fieldsMap: {...recordData}
                });
            }
            
            // Start new record
            currentYear = recordMatch[1];
            currentRecord = recordMatch[2];
            recordData = {};
            headers = [];
            recordValues = [];
            continue;
        }
        
        // Look for successful records found per year (for counts)
        const countMatch = line.match(/Found (\d+) record\(s\) in (\d{4}) dataset/);
        if (countMatch) {
            const count = parseInt(countMatch[1]);
            const year = countMatch[2];
            if (count > 0) {
                schARecords[year] = count;
            }
        }
        
        // Parse field data if we're in a record
        if (currentRecord && line.includes(':')) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const fieldName = line.substring(0, colonIndex).trim();
                const fieldValue = line.substring(colonIndex + 1).trim();
                recordData[fieldName] = fieldValue;
                headers.push(fieldName);
                recordValues.push(fieldValue);
            }
        }
    }
    
    // Don't forget the last record
    if (currentRecord && currentYear && recordValues.length > 0) {
        if (!schADetails[currentYear]) {
            schADetails[currentYear] = [];
        }
        schADetails[currentYear].push({ 
            headers: [...headers], 
            values: [...recordValues],
            fieldsMap: {...recordData}
        });
    }
    
    return { counts: schARecords, details: schADetails };
}

// Function to extract key Schedule A values and generate table
function generateScheduleATable(schADetails, companyName) {
    if (!schADetails || Object.keys(schADetails).length === 0) {
        return;
    }
    
    console.log(`\n📋 Schedule A Records for ${companyName}`);
    console.log('='.repeat(80));
    
    // Define the columns we want (1-based indexing: 7, 11, 14, 62, 86)
    const keyColumns = [
        'INS_CARRIER_NAME',                // Column 7
        'INS_PRSN_COVERED_EOY_CNT',       // Column 11
        'INS_BROKER_COMM_TOT_AMT',        // Column 14
        'WLFR_TYPE_BNFT_OTH_TEXT',        // Column 62
        'WLFR_TOT_CHARGES_PAID_AMT'       // Column 86
    ];
    
    for (const [year, records] of Object.entries(schADetails)) {
        console.log(`\n${year} Records (${records.length} total):`);
        console.log('-'.repeat(80));
        
        // Print header
        console.log('Carrier Name | Persons Covered | Broker Commission | Benefit Type | Total Charges');
        console.log('-'.repeat(80));
        
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            
            // Extract the key values from the fieldsMap
            const carrierName = (record.fieldsMap[keyColumns[0]] || '').substring(0, 15);
            const personsCovered = (record.fieldsMap[keyColumns[1]] || '').substring(0, 12);
            const brokerComm = (record.fieldsMap[keyColumns[2]] || '').substring(0, 15);
            const benefitType = (record.fieldsMap[keyColumns[3]] || '').substring(0, 15);
            const totalCharges = (record.fieldsMap[keyColumns[4]] || '').substring(0, 12);
            
            console.log(`${carrierName.padEnd(15)} | ${personsCovered.padEnd(12)} | ${brokerComm.padEnd(15)} | ${benefitType.padEnd(15)} | ${totalCharges.padEnd(12)}`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
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
    
    result.push(current);
    return result;
}