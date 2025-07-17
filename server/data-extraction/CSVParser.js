/**
 * Utility class for parsing CSV rows with proper handling of quoted fields
 */
class CSVParser {
  /**
   * Parse a CSV row handling quoted fields properly
   * @param {string} row - CSV row string
   * @returns {Array} Array of field values
   */
  parseRow(row) {
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

  /**
   * Parse CSV headers and return cleaned header names
   * @param {string} headerRow - First row of CSV containing headers
   * @returns {Array} Array of cleaned header names
   */
  parseHeaders(headerRow) {
    const headers = this.parseRow(headerRow);
    return headers.map(header => header.replace(/"/g, '').trim());
  }

  /**
   * Clean field value by removing quotes and trimming
   * @param {string} value - Raw field value
   * @returns {string} Cleaned field value
   */
  cleanValue(value) {
    if (!value) return '';
    return value.replace(/"/g, '').trim();
  }

  /**
   * Find column index by header name
   * @param {Array} headers - Array of header names
   * @param {string} columnName - Name of column to find
   * @returns {number} Index of column or -1 if not found
   */
  findColumnIndex(headers, columnName) {
    return headers.findIndex(header => 
      header.replace(/"/g, '').trim() === columnName
    );
  }
}

module.exports = CSVParser;