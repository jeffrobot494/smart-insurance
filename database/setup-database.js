#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection setup
const infoPath = path.join(__dirname, 'info.txt');
const infoContent = fs.readFileSync(infoPath, 'utf8');
const dbUrlMatch = infoContent.match(/DATABASE_PUBLIC_URL=(.+)/);

if (!dbUrlMatch) {
  console.error('❌ Could not find DATABASE_PUBLIC_URL in info.txt');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrlMatch[1].trim(),
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  let client;
  
  try {
    console.log('🔧 Setting up Smart Insurance Database...');
    console.log('='.repeat(50));
    
    client = await pool.connect();
    
    // Read and execute SQL schema
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'create-tables.sql'), 'utf8');
    
    console.log('📋 Creating tables and indexes...');
    await client.query(schemaSQL);
    
    console.log('✅ Database schema created successfully');
    
    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log('\n📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    // Check views
    const viewsResult = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    if (viewsResult.rows.length > 0) {
      console.log('\n👁️  Created views:');
      viewsResult.rows.forEach(row => {
        console.log(`  ✓ ${row.table_name}`);
      });
    }
    
    // Check indexes
    const indexesResult = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname;
    `);
    
    if (indexesResult.rows.length > 0) {
      console.log('\n🔍 Created indexes:');
      indexesResult.rows.forEach(row => {
        console.log(`  ✓ ${row.indexname} on ${row.tablename}`);
      });
    }
    
    // Check functions
    const functionsResult = await client.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_type = 'FUNCTION'
      ORDER BY routine_name;
    `);
    
    if (functionsResult.rows.length > 0) {
      console.log('\n⚙️  Created functions:');
      functionsResult.rows.forEach(row => {
        console.log(`  ✓ ${row.routine_name}()`);
      });
    }
    
    // Test the functions
    console.log('\n🧪 Testing database functions...');
    
    // Test search function (should return empty since no data yet)
    const searchResult = await client.query("SELECT * FROM search_companies_by_name('test') LIMIT 1");
    console.log(`  ✓ search_companies_by_name() - Ready (${searchResult.rows.length} results)`);
    
    // Test Schedule A function (should return empty since no data yet)
    const scheduleResult = await client.query("SELECT * FROM get_schedule_a_by_ein(123456789) LIMIT 1");
    console.log(`  ✓ get_schedule_a_by_ein() - Ready (${scheduleResult.rows.length} results)`);
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📈 Next steps:');
    console.log('  1. Run the CSV import script to load data');
    console.log('  2. Test searches with actual company data');
    console.log('  3. Integrate with DataExtractionService');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    
    if (error.code === '42P07') {
      console.log('💡 Note: Tables may already exist. Run DROP TABLE commands first if you want to recreate them.');
    }
    
    process.exit(1);
    
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Clean up pool on exit
process.on('SIGINT', async () => {
  console.log('\n🔄 Closing database connections...');
  await pool.end();
  process.exit(0);
});

// Run setup
setupDatabase().then(() => {
  console.log('🔄 Closing database pool...');
  pool.end();
}).catch(error => {
  console.error('❌ Unexpected error:', error);
  pool.end();
  process.exit(1);
});