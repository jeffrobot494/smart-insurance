const { Pool } = require('pg');

/**
 * Handles batch processing of large datasets for PostgreSQL insertion
 */
class BatchProcessor {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.batchSize = options.batchSize || 1000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.currentBatch = [];
    this.processedCount = 0;
    this.errorCount = 0;
    this.startTime = null;
  }

  /**
   * Start batch processing
   */
  start() {
    this.startTime = Date.now();
    this.processedCount = 0;
    this.errorCount = 0;
    console.log(`📊 Starting batch processing (batch size: ${this.batchSize})`);
  }

  /**
   * Add a record to the current batch
   * @param {Object} record - Record to add
   * @param {string} tableName - Target table name
   * @returns {Promise} Promise that resolves when batch is processed (if batch is full)
   */
  async addRecord(record, tableName) {
    this.currentBatch.push({ record, tableName });
    
    if (this.currentBatch.length >= this.batchSize) {
      await this.processBatch();
    }
  }

  /**
   * Process the current batch
   * @returns {Promise} Promise that resolves when batch is processed
   */
  async processBatch() {
    if (this.currentBatch.length === 0) {
      return;
    }

    const batchToProcess = [...this.currentBatch];
    this.currentBatch = [];

    // Group records by table
    const tableGroups = {};
    batchToProcess.forEach(({ record, tableName }) => {
      if (!tableGroups[tableName]) {
        tableGroups[tableName] = [];
      }
      tableGroups[tableName].push(record);
    });

    // Process each table group
    for (const [tableName, records] of Object.entries(tableGroups)) {
      await this.insertBatch(tableName, records);
    }

    this.processedCount += batchToProcess.length;
    this.logProgress();
  }

  /**
   * Insert a batch of records into a specific table
   * @param {string} tableName - Table name
   * @param {Array} records - Array of records to insert
   * @returns {Promise} Promise that resolves when insertion is complete
   */
  async insertBatch(tableName, records) {
    if (records.length === 0) return;

    let retryCount = 0;
    
    while (retryCount <= this.maxRetries) {
      try {
        const client = await this.pool.connect();
        
        try {
          await client.query('BEGIN');
          
          // Generate INSERT statement based on table structure
          const insertSQL = this.generateInsertSQL(tableName, records);
          
          await client.query(insertSQL.query, insertSQL.values);
          await client.query('COMMIT');
          
          console.log(`✅ Inserted ${records.length} records into ${tableName}`);
          break;
          
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        
      } catch (error) {
        retryCount++;
        this.errorCount++;
        
        if (retryCount <= this.maxRetries) {
          console.log(`⚠️  Retry ${retryCount}/${this.maxRetries} for ${tableName} batch: ${error.message}`);
          await this.delay(this.retryDelay * retryCount);
        } else {
          console.error(`❌ Failed to insert batch into ${tableName} after ${this.maxRetries} retries: ${error.message}`);
          
          // Log failed records for debugging
          console.log('Failed records sample:', records.slice(0, 3));
          throw error;
        }
      }
    }
  }

  /**
   * Generate INSERT SQL statement for a batch of records
   * @param {string} tableName - Table name
   * @param {Array} records - Array of records
   * @returns {Object} Object with query and values
   */
  generateInsertSQL(tableName, records) {
    if (records.length === 0) {
      throw new Error('No records to insert');
    }

    // Get all unique columns from all records
    const allColumns = new Set();
    records.forEach(record => {
      Object.keys(record).forEach(key => allColumns.add(key));
    });
    
    const columns = Array.from(allColumns);
    const placeholders = [];
    const values = [];
    
    records.forEach((record, recordIndex) => {
      const recordPlaceholders = [];
      
      columns.forEach((column, columnIndex) => {
        const paramIndex = recordIndex * columns.length + columnIndex + 1;
        recordPlaceholders.push(`$${paramIndex}`);
        
        let value = record[column];
        
        // Handle null/undefined values
        if (value === undefined || value === null || value === '') {
          value = null;
        }
        
        // Handle numeric conversions
        if (typeof value === 'string' && value.match(/^\d+$/)) {
          const numValue = parseInt(value);
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }
        
        // Handle decimal conversions
        if (typeof value === 'string' && value.match(/^\d+\.\d+$/)) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }
        
        // Handle date conversions
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Keep as string, PostgreSQL will handle the conversion
        }
        
        values.push(value);
      });
      
      placeholders.push(`(${recordPlaceholders.join(', ')})`);
    });

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT DO NOTHING
    `;

    return { query, values };
  }

  /**
   * Finish batch processing (process any remaining records)
   * @returns {Promise} Promise that resolves when all processing is complete
   */
  async finish() {
    // Process any remaining records
    if (this.currentBatch.length > 0) {
      await this.processBatch();
    }

    const duration = Date.now() - this.startTime;
    const rate = this.processedCount / (duration / 1000);

    console.log('\n🎉 Batch processing completed!');
    console.log(`📊 Total records processed: ${this.processedCount.toLocaleString()}`);
    console.log(`❌ Errors encountered: ${this.errorCount}`);
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(`🚀 Processing rate: ${rate.toFixed(2)} records/second`);
  }

  /**
   * Log processing progress
   */
  logProgress() {
    const duration = Date.now() - this.startTime;
    const rate = this.processedCount / (duration / 1000);
    
    if (this.processedCount % (this.batchSize * 10) === 0) {
      console.log(`📈 Progress: ${this.processedCount.toLocaleString()} records processed (${rate.toFixed(2)} records/sec)`);
    }
  }

  /**
   * Delay for retry logic
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current processing statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const duration = Date.now() - this.startTime;
    const rate = this.processedCount / (duration / 1000);
    
    return {
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      duration: duration,
      rate: rate,
      batchSize: this.batchSize
    };
  }
}

module.exports = BatchProcessor;