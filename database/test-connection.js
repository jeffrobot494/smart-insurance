#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Read database info from info.txt
const infoPath = path.join(__dirname, 'info.txt');
const infoContent = fs.readFileSync(infoPath, 'utf8');

// Parse DATABASE_PUBLIC_URL from info.txt
const dbUrlMatch = infoContent.match(/DATABASE_PUBLIC_URL=(.+)/);
if (!dbUrlMatch) {
  console.error('❌ Could not find DATABASE_PUBLIC_URL in info.txt');
  process.exit(1);
}

const databaseUrl = dbUrlMatch[1].trim();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false // Railway requires SSL but with self-signed certs
  },
  max: 10, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

async function testConnection() {
  let client;
  
  try {
    console.log('🔍 Testing database connection...');
    console.log(`📡 Connecting to: ${databaseUrl.replace(/:[^:]*@/, ':****@')}`);
    
    // Get a client from the pool
    client = await pool.connect();
    
    console.log('✅ Successfully connected to PostgreSQL database');
    
    // Test basic query
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    console.log('🕐 Current time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
    
    // Check if test table exists
    const tableCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'test_table'
      );
    `);
    
    const tableExists = tableCheckResult.rows[0].exists;
    console.log(`📋 Test table exists: ${tableExists}`);
    
    if (!tableExists) {
      console.log('🔨 Creating test table...');
      
      await client.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✅ Test table created successfully');
      
      // Insert test data
      await client.query(`
        INSERT INTO test_table (name, email) VALUES 
        ('John Doe', 'john@example.com'),
        ('Jane Smith', 'jane@example.com');
      `);
      
      console.log('📝 Test data inserted');
    }
    
    // Query test data
    const dataResult = await client.query('SELECT * FROM test_table ORDER BY id');
    console.log('📊 Test table contents:');
    console.log(dataResult.rows);
    
    // Show table structure
    const structureResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'test_table'
      ORDER BY ordinal_position;
    `);
    
    console.log('🏗️  Table structure:');
    structureResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });
    
    console.log('\n🎉 Database connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database connection test failed:');
    console.error('Error:', error.message);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Suggestion: Check if the database is running and the connection details are correct');
    } else if (error.code === '3D000') {
      console.error('💡 Suggestion: Database does not exist');
    } else if (error.code === '28P01') {
      console.error('💡 Suggestion: Authentication failed - check username/password');
    }
    
    process.exit(1);
    
  } finally {
    // Return client to pool
    if (client) {
      client.release();
    }
  }
}

// Clean up pool on exit
process.on('SIGINT', async () => {
  console.log('\n🔄 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});

// Run the test
testConnection().then(() => {
  console.log('🔄 Closing database pool...');
  pool.end();
}).catch(error => {
  console.error('❌ Unexpected error:', error);
  pool.end();
  process.exit(1);
});