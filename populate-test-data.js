#!/usr/bin/env node

// Script to populate database with 100 completed pipelines for testing pagination
const axios = require('axios');

// Configuration
const SERVER_URL = 'http://localhost:3000'; // Adjust if different
const NUM_PIPELINES = 100;

// Fake data generators
const FAKE_FIRMS = [
    'Acme Private Capital', 'Blackstone Holdings', 'Goldman Sachs Capital Partners', 'KKR & Co Inc',
    'Apollo Global Management', 'Carlyle Group', 'TPG Capital', 'Bain Capital', 'Vista Equity Partners',
    'Silver Lake Partners', 'Warburg Pincus', 'General Atlantic', 'CVC Capital Partners', 'Advent International',
    'Apax Partners', 'Permira', 'EQT Partners', 'Nordic Capital', 'BC Partners', 'Cinven',
    'Hellman & Friedman', 'Leonard Green Partners', 'Providence Equity Partners', 'Thoma Bravo',
    'Francisco Partners', 'Great Hill Partners', 'JMI Equity', 'Insight Venture Partners',
    'Battery Ventures', 'Bessemer Venture Partners', 'Accel Partners', 'Andreessen Horowitz',
    'Kleiner Perkins', 'Sequoia Capital', 'Greylock Partners', 'NEA', 'IVP', 'Lightspeed Venture Partners',
    'Index Ventures', 'Balderton Capital', 'Atomico', 'Creandum', 'Northzone', 'Partech',
    'DN Capital', 'Mangrove Capital Partners', 'Wellington Partners', 'Target Partners',
    'High-Tech Grunderfonds', 'Rocket Internet', 'Global Founders Capital', 'Point Nine Capital',
    'Cherry Ventures', 'Earlybird Venture Capital', 'Redline Capital', 'Foundry Group',
    'Union Square Ventures', 'First Round Capital', 'SV Angel', 'Y Combinator', 'Techstars',
    'Alpha Partners', 'Beta Capital', 'Gamma Ventures', 'Delta Investments', 'Epsilon Holdings',
    'Zeta Capital Partners', 'Theta Venture Partners', 'Lambda Capital', 'Sigma Investments',
    'Omega Holdings Group', 'Pinnacle Capital', 'Summit Ventures', 'Ridge Partners', 'Valley Capital',
    'Mountain View Equity', 'Coastal Investment Partners', 'Northern Capital', 'Southern Ventures',
    'Eastern Equity Partners', 'Western Capital Group', 'Central Investment Holdings',
    'Atlantic Ventures', 'Pacific Capital Partners', 'Arctic Investment Group', 'Tropical Ventures',
    'Continental Capital', 'Global Equity Partners', 'International Ventures', 'Worldwide Holdings',
    'Universal Capital Group', 'Premier Investment Partners', 'Elite Ventures', 'Prestige Capital',
    'Excellence Partners', 'Innovation Ventures', 'Technology Capital', 'Digital Investment Partners',
    'Cyber Ventures', 'Cloud Capital', 'Data Equity Partners', 'Analytics Ventures',
    'AI Investment Group', 'Machine Learning Capital', 'Quantum Ventures', 'Blockchain Partners',
    'Crypto Capital Group', 'Fintech Ventures', 'Healthtech Partners', 'Biotech Capital',
    'Cleantech Ventures', 'Greentech Partners', 'Renewable Energy Capital', 'Sustainable Ventures'
];

const FAKE_COMPANIES = [
    'TechCorp Solutions', 'DataFlow Systems', 'CloudMax Technologies', 'SecureNet Inc',
    'InnovateTech LLC', 'NextGen Software', 'DigitalWave Corp', 'SmartSystems Ltd',
    'CyberGuard Technologies', 'DataVault Inc', 'StreamTech Solutions', 'NetCore Systems',
    'CloudBridge Corp', 'TechFusion LLC', 'DigitalEdge Inc', 'InfoTech Solutions',
    'ByteStream Systems', 'CodeCraft Technologies', 'WebFlow Corp', 'AppLogic Inc',
    'SystemCore LLC', 'TechBridge Solutions', 'DataLink Systems', 'CloudSync Technologies',
    'DigitalCore Inc', 'InfoStream LLC', 'TechNet Solutions', 'CyberFlow Systems',
    'DataTech Corp', 'CloudEdge Technologies', 'SmartFlow Inc', 'TechStream LLC',
    'DigitalNet Solutions', 'InfoTech Systems', 'CodeFlow Corp', 'WebTech Inc',
    'AppStream LLC', 'DataCore Solutions', 'CloudTech Systems', 'CyberNet Corp',
    'TechFlow Technologies', 'DigitalStream Inc', 'InfoFlow LLC', 'SystemTech Solutions',
    'DataNet Systems', 'CloudFlow Corp', 'TechCore Inc', 'DigitalTech LLC',
    'InfoNet Solutions', 'CyberTech Systems', 'StreamCore Corp', 'WebCore Inc',
    'AppTech LLC', 'DataStream Solutions', 'CloudCore Systems', 'TechEdge Corp',
    'DigitalFlow Inc', 'InfoCore LLC', 'SystemFlow Solutions', 'CyberCore Systems',
    'NetTech Corp', 'StreamTech Inc', 'WebFlow LLC', 'AppCore Solutions',
    'DataEdge Systems', 'CloudNet Corp', 'TechStream Inc', 'DigitalCore LLC',
    'InfoEdge Solutions', 'SystemNet Systems', 'CyberStream Corp', 'FlowTech Inc',
    'CoreTech LLC', 'EdgeTech Solutions', 'NetCore Systems', 'StreamCore Corp'
];

const INDUSTRIES = [
    'Technology', 'Healthcare', 'Financial Services', 'Manufacturing', 'Retail',
    'Energy', 'Real Estate', 'Telecommunications', 'Media', 'Transportation',
    'Education', 'Hospitality', 'Agriculture', 'Construction', 'Aerospace',
    'Automotive', 'Biotechnology', 'Pharmaceutical', 'Consumer Goods', 'Food & Beverage'
];

const STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// Utility functions
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max, decimals = 2) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateFakeCompanies(count) {
    const companies = [];
    const usedNames = new Set();
    
    for (let i = 0; i < count; i++) {
        let name = getRandomElement(FAKE_COMPANIES);
        while (usedNames.has(name)) {
            name = getRandomElement(FAKE_COMPANIES) + ` ${getRandomInt(1, 999)}`;
        }
        usedNames.add(name);
        
        // Generate realistic Form 5500 data
        const hasForm5500 = Math.random() > 0.3; // 70% have Form 5500 data
        
        companies.push({
            name: name,
            confidence: getRandomElement(['high', 'medium', 'low']),
            industry: getRandomElement(INDUSTRIES),
            location: `${getRandomElement(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'])}, ${getRandomElement(STATES)}`,
            hasForm5500: hasForm5500,
            exited: Math.random() > 0.85, // 15% are exited
            form5500_data: hasForm5500 ? {
                plan_name: `${name} 401(k) Plan`,
                plan_sponsor: name,
                participants: getRandomInt(50, 2500),
                total_assets: getRandomFloat(500000, 50000000, 0),
                total_contributions: getRandomFloat(100000, 5000000, 0),
                administrative_expenses: getRandomFloat(10000, 500000, 0),
                investment_expenses: getRandomFloat(25000, 800000, 0),
                plan_year: getRandomElement([2022, 2021, 2020]),
                filing_date: `${getRandomInt(2021, 2023)}-${String(getRandomInt(1, 12)).padStart(2, '0')}-${String(getRandomInt(1, 28)).padStart(2, '0')}`
            } : null
        });
    }
    
    return companies;
}

// Main script functions
async function createPipeline(firmName) {
    try {
        console.log(`Creating pipeline for: ${firmName}`);
        const response = await axios.post(`${SERVER_URL}/api/pipeline`, {
            firm_name: firmName
        });
        
        if (response.data.success) {
            return response.data.pipeline;
        } else {
            throw new Error(`Failed to create pipeline: ${response.data.error}`);
        }
    } catch (error) {
        console.error(`Error creating pipeline for ${firmName}:`, error.message);
        throw error;
    }
}

async function updatePipelineWithFakeData(pipelineId, firmName) {
    try {
        console.log(`Updating pipeline ${pipelineId} with fake data`);
        
        // Generate 3-15 fake companies per pipeline
        const companyCount = getRandomInt(3, 15);
        const fakeCompanies = generateFakeCompanies(companyCount);
        
        const updates = {
            status: 'data_extraction_complete',
            companies: fakeCompanies
            // Removed updated_at - let the database handle this automatically
        };
        
        const response = await axios.post(`${SERVER_URL}/api/pipeline/${pipelineId}/update`, {
            updates: updates
        });
        
        if (response.data.success) {
            console.log(`✅ Updated pipeline ${pipelineId} with ${companyCount} companies`);
            return response.data;
        } else {
            throw new Error(`Failed to update pipeline: ${response.data.error}`);
        }
    } catch (error) {
        console.error(`Error updating pipeline ${pipelineId}:`, error.message);
        throw error;
    }
}

async function populateTestData() {
    console.log(`🚀 Starting to populate ${NUM_PIPELINES} test pipelines...`);
    console.log(`Server: ${SERVER_URL}`);
    console.log();
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 1; i <= NUM_PIPELINES; i++) {
        try {
            const firmName = getRandomElement(FAKE_FIRMS);
            console.log(`\n[${i}/${NUM_PIPELINES}] Processing: ${firmName}`);
            
            // Create pipeline
            const pipeline = await createPipeline(firmName);
            console.log(`   Created pipeline ${pipeline.pipeline_id}`);
            
            // Wait a moment to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Update with fake data
            await updatePipelineWithFakeData(pipeline.pipeline_id, firmName);
            
            successCount++;
            console.log(`   ✅ Successfully completed pipeline ${pipeline.pipeline_id}`);
            
        } catch (error) {
            errorCount++;
            console.error(`   ❌ Error processing pipeline ${i}: ${error.message}`);
        }
        
        // Brief pause between pipelines
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`\n🎉 Population complete!`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total: ${NUM_PIPELINES}`);
    
    if (successCount > 0) {
        console.log(`\n💡 Test your pagination at: ${SERVER_URL}/api/pipeline?status=data_extraction_complete&limit=20&offset=0`);
    }
}

// Run the script
if (require.main === module) {
    populateTestData()
        .then(() => {
            console.log('\n✨ Script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Script failed:', error.message);
            process.exit(1);
        });
}

module.exports = {
    populateTestData,
    createPipeline,
    updatePipelineWithFakeData
};