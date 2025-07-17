#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Analyze CSV file structure to design database schema
 */
class CSVSchemaAnalyzer {
  constructor() {
    this.dataPath = path.join(__dirname, '..', "server", 'data');
  }

  /**
   * Analyze a CSV file structure
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<Object>} Schema analysis
   */
  async analyzeFile(filePath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let headers = [];
      let sampleRows = [];
      let lineCount = 0;
      const maxSampleRows = 5;

      rl.on('line', (line) => {
        lineCount++;
        
        if (lineCount === 1) {
          // Parse headers
          headers = this.parseCSVRow(line);
          return;
        }
        
        // Collect sample rows
        if (sampleRows.length < maxSampleRows) {
          const row = this.parseCSVRow(line);
          sampleRows.push(row);
        }
      });

      rl.on('close', () => {
        const analysis = this.analyzeColumns(headers, sampleRows);
        resolve({
          fileName: path.basename(filePath),
          totalRows: lineCount - 1,
          columnCount: headers.length,
          headers,
          columnAnalysis: analysis,
          sampleRows: sampleRows.slice(0, 3) // Show first 3 sample rows
        });
      });

      rl.on('error', reject);
    });
  }

  /**
   * Parse CSV row handling quoted fields
   * @param {string} row - CSV row
   * @returns {Array} Parsed fields
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
   * Analyze column data types and characteristics
   * @param {Array} headers - Column headers
   * @param {Array} sampleRows - Sample data rows
   * @returns {Array} Column analysis
   */
  analyzeColumns(headers, sampleRows) {
    const analysis = [];

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].replace(/"/g, '').trim();
      const values = sampleRows.map(row => row[i] ? row[i].replace(/"/g, '').trim() : '');
      
      const columnInfo = {
        name: header,
        index: i,
        sqlName: this.sanitizeColumnName(header),
        dataType: this.inferDataType(values),
        maxLength: Math.max(...values.map(v => v.length)),
        hasNulls: values.some(v => !v || v === ''),
        sampleValues: values.filter(v => v).slice(0, 3),
        isKey: this.isKeyColumn(header),
        isSearchable: this.isSearchableColumn(header)
      };

      analysis.push(columnInfo);
    }

    return analysis;
  }

  /**
   * Sanitize column name for SQL
   * @param {string} name - Original column name
   * @returns {string} SQL-safe column name
   */
  sanitizeColumnName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Infer PostgreSQL data type from sample values
   * @param {Array} values - Sample values
   * @returns {string} PostgreSQL data type
   */
  inferDataType(values) {
    const nonEmptyValues = values.filter(v => v);
    
    if (nonEmptyValues.length === 0) {
      return 'TEXT';
    }

    // Check if all values are integers
    const allIntegers = nonEmptyValues.every(v => /^\d+$/.test(v));
    if (allIntegers) {
      const maxValue = Math.max(...nonEmptyValues.map(v => parseInt(v)));
      if (maxValue < 2147483647) {
        return 'INTEGER';
      } else {
        return 'BIGINT';
      }
    }

    // Check if all values are numbers (including decimals)
    const allNumbers = nonEmptyValues.every(v => /^\d+(\.\d+)?$/.test(v));
    if (allNumbers) {
      return 'DECIMAL(15,2)';
    }

    // Check if values look like dates
    const allDates = nonEmptyValues.every(v => 
      /^\d{4}-\d{2}-\d{2}/.test(v) || 
      /^\d{2}\/\d{2}\/\d{4}/.test(v)
    );
    if (allDates) {
      return 'DATE';
    }

    // Check if values look like timestamps
    const allTimestamps = nonEmptyValues.every(v => 
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ||
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v)
    );
    if (allTimestamps) {
      return 'TIMESTAMP';
    }

    // Default to TEXT with appropriate length
    const maxLength = Math.max(...nonEmptyValues.map(v => v.length));
    if (maxLength <= 255) {
      return 'VARCHAR(255)';
    } else if (maxLength <= 1000) {
      return 'VARCHAR(1000)';
    } else {
      return 'TEXT';
    }
  }

  /**
   * Check if column is a key column (for indexing)
   * @param {string} columnName - Column name
   * @returns {boolean} True if key column
   */
  isKeyColumn(columnName) {
    const keyPatterns = [
      /ein/i,
      /id$/i,
      /^id/i,
      /plan_num/i,
      /sponsor_dfe_name/i,
      /sch_a_ein/i
    ];
    
    return keyPatterns.some(pattern => pattern.test(columnName));
  }

  /**
   * Check if column is searchable (for our use case)
   * @param {string} columnName - Column name
   * @returns {boolean} True if searchable
   */
  isSearchableColumn(columnName) {
    const searchPatterns = [
      /sponsor_dfe_name/i,
      /sch_a_ein/i,
      /sponsor_ein/i,
      /ins_carrier_name/i,
      /plan_name/i
    ];
    
    return searchPatterns.some(pattern => pattern.test(columnName));
  }

  /**
   * Generate SQL CREATE TABLE statement
   * @param {Object} analysis - File analysis
   * @param {string} tableName - Table name
   * @returns {string} SQL CREATE TABLE statement
   */
  generateCreateTableSQL(analysis, tableName) {
    const columns = analysis.columnAnalysis.map(col => {
      const nullable = col.hasNulls ? '' : ' NOT NULL';
      return `  ${col.sqlName} ${col.dataType}${nullable}`;
    }).join(',\n');

    let sql = `CREATE TABLE ${tableName} (\n`;
    sql += `  id SERIAL PRIMARY KEY,\n`;
    sql += `  year INTEGER NOT NULL,\n`;
    sql += columns;
    sql += `\n);`;

    // Add indexes
    const indexColumns = analysis.columnAnalysis.filter(col => col.isKey || col.isSearchable);
    if (indexColumns.length > 0) {
      sql += '\n\n-- Indexes\n';
      indexColumns.forEach(col => {
        sql += `CREATE INDEX idx_${tableName}_${col.sqlName} ON ${tableName}(${col.sqlName});\n`;
      });
      sql += `CREATE INDEX idx_${tableName}_year ON ${tableName}(year);\n`;
    }

    return sql;
  }
}

// Main execution
async function main() {
  const analyzer = new CSVSchemaAnalyzer();
  
  console.log('📊 CSV Schema Analysis Tool');
  console.log('='.repeat(50));

  // Files to analyze
  const files = [
    'f_5500_2022_latest.csv',
    'f_5500_2023_latest.csv', 
    'f_5500_2024_latest.csv',
    'F_SCH_A_2022_latest.csv',
    'F_SCH_A_2023_latest.csv',
    'F_SCH_A_2024_latest.csv'
  ];

  for (const file of files) {
    const filePath = path.join(analyzer.dataPath, file);
    
    try {
      console.log(`\n🔍 Analyzing ${file}...`);
      
      const analysis = await analyzer.analyzeFile(filePath);
      
      console.log(`📋 File: ${analysis.fileName}`);
      console.log(`📊 Rows: ${analysis.totalRows.toLocaleString()}`);
      console.log(`📑 Columns: ${analysis.columnCount}`);
      
      console.log('\n🔑 Key Columns:');
      const keyColumns = analysis.columnAnalysis.filter(col => col.isKey);
      keyColumns.forEach(col => {
        console.log(`  - ${col.name} (${col.sqlName}) -> ${col.dataType}`);
      });
      
      console.log('\n🔍 Searchable Columns:');
      const searchColumns = analysis.columnAnalysis.filter(col => col.isSearchable);
      searchColumns.forEach(col => {
        console.log(`  - ${col.name} (${col.sqlName}) -> ${col.dataType}`);
      });

      // Generate SQL for Form 5500 files
      if (file.includes('f_5500')) {
        console.log('\n📝 Suggested SQL for form_5500_records:');
        console.log(analyzer.generateCreateTableSQL(analysis, 'form_5500_records'));
      }

      // Generate SQL for Schedule A files
      if (file.includes('F_SCH_A')) {
        console.log('\n📝 Suggested SQL for schedule_a_records:');
        console.log(analyzer.generateCreateTableSQL(analysis, 'schedule_a_records'));
      }

      console.log('\n' + '='.repeat(50));
      
    } catch (error) {
      console.error(`❌ Error analyzing ${file}: ${error.message}`);
    }
  }
}

// Run the analysis
main().catch(console.error);