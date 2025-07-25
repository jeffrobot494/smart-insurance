const { files: logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const CSVParser = require('./CSVParser');

/**
 * Manages CSV dataset loading and validation
 */
class DatasetManager {
  constructor() {
    this.csvParser = new CSVParser();
    this.basePath = path.join(__dirname, '..', 'data');
  }

  /**
   * Get Form 5500 dataset configurations
   * @returns {Array} Array of dataset configurations
   */
  getForm5500Datasets() {
    return [
      { path: path.join(this.basePath, 'f_5500_2022_latest.csv'), year: '2022' },
      { path: path.join(this.basePath, 'f_5500_2023_latest.csv'), year: '2023' },
      { path: path.join(this.basePath, 'f_5500_2024_latest.csv'), year: '2024' }
    ];
  }

  /**
   * Get Schedule A dataset configurations
   * @returns {Array} Array of dataset configurations
   */
  getScheduleADatasets() {
    return [
      { path: path.join(this.basePath, 'F_SCH_A_2022_latest.csv'), year: '2022' },
      { path: path.join(this.basePath, 'F_SCH_A_2023_latest.csv'), year: '2023' },
      { path: path.join(this.basePath, 'F_SCH_A_2024_latest.csv'), year: '2024' }
    ];
  }

  /**
   * Load and validate a CSV dataset
   * @param {string} filePath - Path to CSV file
   * @returns {Object} Dataset object with headers and data
   */
  loadDataset(filePath) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`Dataset not found at ${filePath}`);
      }

      // Read the CSV file
      const csvData = fs.readFileSync(filePath, 'utf8');
      const lines = csvData.split('\n');

      if (lines.length < 2) {
        throw new Error('CSV file appears to be empty or invalid');
      }

      // Parse headers
      const headers = this.csvParser.parseHeaders(lines[0]);
      
      // Parse data rows
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const row = this.csvParser.parseRow(line);
          rows.push(row);
        }
      }

      logger.info(`📊 Loaded dataset: ${path.basename(filePath)} (${rows.length} rows)`);

      return {
        headers,
        rows,
        filePath
      };

    } catch (error) {
      logger.error(`❌ Error loading dataset ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Validate dataset structure for Form 5500
   * @param {Object} dataset - Dataset object
   * @returns {boolean} True if valid
   */
  validateForm5500Dataset(dataset) {
    const requiredColumn = 'SPONSOR_DFE_NAME';
    const columnIndex = this.csvParser.findColumnIndex(dataset.headers, requiredColumn);
    
    if (columnIndex === -1) {
      throw new Error(`Could not find required column '${requiredColumn}' in Form 5500 dataset`);
    }

    return true;
  }

  /**
   * Validate dataset structure for Schedule A
   * @param {Object} dataset - Dataset object
   * @returns {boolean} True if valid
   */
  validateScheduleADataset(dataset) {
    const requiredColumn = 'SCH_A_EIN';
    const columnIndex = this.csvParser.findColumnIndex(dataset.headers, requiredColumn);
    
    if (columnIndex === -1) {
      throw new Error(`Could not find required column '${requiredColumn}' in Schedule A dataset`);
    }

    return true;
  }

  /**
   * Load all Form 5500 datasets
   * @returns {Array} Array of loaded datasets
   */
  loadForm5500Datasets() {
    const datasets = [];
    const configs = this.getForm5500Datasets();

    for (const config of configs) {
      try {
        const dataset = this.loadDataset(config.path);
        this.validateForm5500Dataset(dataset);
        datasets.push({
          ...dataset,
          year: config.year
        });
      } catch (error) {
        logger.warn(`⚠️  Warning: Could not load Form 5500 dataset for ${config.year}: ${error.message}`);
      }
    }

    if (datasets.length === 0) {
      throw new Error('No Form 5500 datasets could be loaded');
    }

    return datasets;
  }

  /**
   * Load all Schedule A datasets
   * @returns {Array} Array of loaded datasets
   */
  loadScheduleADatasets() {
    const datasets = [];
    const configs = this.getScheduleADatasets();

    for (const config of configs) {
      try {
        const dataset = this.loadDataset(config.path);
        this.validateScheduleADataset(dataset);
        datasets.push({
          ...dataset,
          year: config.year
        });
      } catch (error) {
        logger.warn(`⚠️  Warning: Could not load Schedule A dataset for ${config.year}: ${error.message}`);
      }
    }

    if (datasets.length === 0) {
      throw new Error('No Schedule A datasets could be loaded');
    }

    return datasets;
  }
}

module.exports = DatasetManager;