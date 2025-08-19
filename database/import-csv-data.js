#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');
const BatchProcessor = require('./BatchProcessor');
const DataMapper = require('./DataMapper');

/**
 * CSV Data Import Script
 * Imports Form 5500 and Schedule A data into PostgreSQL database
 */
class CSVImporter {
  constructor() {
    this.pool = null;
    this.batchProcessor = null;
    this.dataMapper = new DataMapper();
    this.dataPath = path.join(__dirname, '..', 'tests', 'data');
    this.stats = {
      totalProcessed: 0,
      totalErrors: 0,
      startTime: null,
      fileStats: {}
    };
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    // Read database connection info
    const infoPath = path.join(__dirname, 'info.txt');
    const infoContent = fs.readFileSync(infoPath, 'utf8');
    const dbUrlMatch = infoContent.match(/DATABASE_PUBLIC_URL=(.+)/);

    if (!dbUrlMatch) {
      throw new Error('Could not find DATABASE_PUBLIC_URL in info.txt');
    }

    this.pool = new Pool({
      connectionString: dbUrlMatch[1].trim(),
      ssl: {
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    // Test connection
    const client = await this.pool.connect();
    console.log('✅ Database connection established');
    client.release();

    // Initialize batch processor
    this.batchProcessor = new BatchProcessor(this.pool, {
      batchSize: 1000,
      maxRetries: 3
    });
  }

  /**
   * Get list of files to import
   */
  getFilesToImport() {
    return [
      { 
        filename: 'f_5500_2022_latest.csv', 
        year: 2022, 
        type: 'form5500',
        tableName: 'form_5500_records'
      },
      { 
        filename: 'f_5500_2023_latest.csv', 
        year: 2023, 
        type: 'form5500',
        tableName: 'form_5500_records'
      },
      { 
        filename: 'f_5500_2024_latest.csv', 
        year: 2024, 
        type: 'form5500',
        tableName: 'form_5500_records'
      },
      { 
        filename: 'F_SCH_A_2022_latest.csv', 
        year: 2022, 
        type: 'schedule_a',
        tableName: 'schedule_a_records'
      },
      { 
        filename: 'F_SCH_A_2023_latest.csv', 
        year: 2023, 
        type: 'schedule_a',
        tableName: 'schedule_a_records'
      },
      { 
        filename: 'F_SCH_A_2024_latest.csv', 
        year: 2024, 
        type: 'schedule_a',
        tableName: 'schedule_a_records'
      }
    ];
  }

  /**
   * Clear existing data from tables
   */
  async clearExistingData() {
    console.log('🧹 Clearing existing data...');
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear tables in correct order (due to potential foreign key constraints)
      await client.query('DELETE FROM schedule_a_records');
      await client.query('DELETE FROM form_5500_records');
      
      // Reset sequences
      await client.query('ALTER SEQUENCE form_5500_records_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE schedule_a_records_id_seq RESTART WITH 1');
      
      await client.query('COMMIT');
      console.log('✅ Existing data cleared');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Import a single CSV file
   * @param {Object} fileInfo - File information object
   */
  async importFile(fileInfo) {
    const filePath = path.join(this.dataPath, fileInfo.filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }

    console.log(`\n📂 Importing ${fileInfo.filename}...`);
    console.log(`📊 Year: ${fileInfo.year}, Type: ${fileInfo.type}`);

    const fileStats = {
      processed: 0,
      errors: 0,
      skipped: 0,
      startTime: Date.now()
    };

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let headers = null;
    let lineNumber = 0;
    let mappingStats = null;

    try {
      for await (const line of rl) {
        lineNumber++;
        
        if (lineNumber === 1) {
          // Parse headers
          headers = this.parseCSVRow(line);
          
          // Get mapping statistics
          const sampleCsvRow = this.createSampleObject(headers);
          mappingStats = this.dataMapper.getMappingStats(sampleCsvRow, fileInfo.type);
          
          console.log(`📋 CSV columns: ${headers.length}`);
          console.log(`🎯 Mapping coverage: ${mappingStats.coveragePercent}%`);
          
          if (mappingStats.unmappedFields.length > 0) {
            console.log(`⚠️  Unmapped fields (first 10): ${mappingStats.unmappedFields.join(', ')}`);
          }
          
          continue;
        }

        // Process data row
        try {
          const csvRow = this.parseCSVRow(line);
          const csvObject = this.createRowObject(headers, csvRow);
          
          // Map to database record
          let dbRecord;
          if (fileInfo.type === 'form5500') {
            dbRecord = this.dataMapper.mapForm5500Record(csvObject, fileInfo.year);
          } else {
            dbRecord = this.dataMapper.mapScheduleARecord(csvObject, fileInfo.year);
          }

          // Add to batch processor
          await this.batchProcessor.addRecord(dbRecord, fileInfo.tableName);
          
          fileStats.processed++;
          
        } catch (error) {
          fileStats.errors++;
          
          if (fileStats.errors <= 5) {
            console.error(`⚠️  Error processing line ${lineNumber}: ${error.message}`);
          } else if (fileStats.errors === 6) {
            console.error('⚠️  Suppressing further error messages for this file...');
          }
        }
      }

      // Process any remaining records in batch
      await this.batchProcessor.processBatch();
      
      const duration = Date.now() - fileStats.startTime;
      const rate = fileStats.processed / (duration / 1000);
      
      console.log(`✅ File import completed`);
      console.log(`📊 Processed: ${fileStats.processed.toLocaleString()} records`);
      console.log(`❌ Errors: ${fileStats.errors}`);
      console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);
      console.log(`🚀 Rate: ${rate.toFixed(2)} records/second`);
      
      this.stats.fileStats[fileInfo.filename] = {
        ...fileStats,
        duration,
        rate,
        mappingStats
      };
      
    } catch (error) {
      console.error(`❌ Error importing file ${fileInfo.filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Parse CSV row handling quoted fields
   * @param {string} row - CSV row string
   * @returns {Array} Array of field values
   */
  parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Create object from headers and row data
   * @param {Array} headers - Column headers
   * @param {Array} row - Row data
   * @returns {Object} Object with header keys and row values
   */
  createRowObject(headers, row) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].replace(/"/g, '').trim();
      const value = row[i] ? row[i].replace(/"/g, '').trim() : '';
      obj[header] = value || null;
    }
    return obj;
  }

  /**
   * Create sample object for mapping statistics
   * @param {Array} headers - Column headers
   * @returns {Object} Sample object
   */
  createSampleObject(headers) {
    const obj = {};
    headers.forEach(header => {
      obj[header.replace(/"/g, '').trim()] = 'sample_value';
    });
    return obj;
  }

  /**
   * Generate final import report
   */
  generateReport() {
    const totalDuration = Date.now() - this.stats.startTime;
    const batchStats = this.batchProcessor.getStats();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL IMPORT REPORT');
    console.log('='.repeat(80));
    
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`📊 Total Records Processed: ${batchStats.processedCount.toLocaleString()}`);
    console.log(`❌ Total Errors: ${batchStats.errorCount}`);
    console.log(`🚀 Overall Rate: ${batchStats.rate.toFixed(2)} records/second`);
    
    console.log('\n📋 File Summary:');
    for (const [filename, stats] of Object.entries(this.stats.fileStats)) {
      console.log(`  ${filename}:`);
      console.log(`    Records: ${stats.processed.toLocaleString()}`);
      console.log(`    Errors: ${stats.errors}`);
      console.log(`    Rate: ${stats.rate.toFixed(2)} records/sec`);
      console.log(`    Mapping: ${stats.mappingStats.coveragePercent}%`);
    }
    
    console.log('\n🎉 Import completed successfully!');
    console.log('📊 Database ready for queries');
  }

  /**
   * Main import process
   */
  async import() {
    try {
      this.stats.startTime = Date.now();
      
      console.log('🚀 Starting CSV Data Import');
      console.log('='.repeat(50));
      
      // Initialize
      await this.initialize();
      
      // Skip clearing data to test idempotent behavior
      // await this.clearExistingData();
      
      // Start batch processor
      this.batchProcessor.start();
      
      // Import each file
      const files = this.getFilesToImport();
      
      for (const fileInfo of files) {
        await this.importFile(fileInfo);
      }
      
      // Finish batch processing
      await this.batchProcessor.finish();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Import failed:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    } finally {
      if (this.pool) {
        await this.pool.end();
      }
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Import interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Import terminated');
  process.exit(1);
});

// Run import if called directly
if (require.main === module) {
  const importer = new CSVImporter();
  importer.import();
}