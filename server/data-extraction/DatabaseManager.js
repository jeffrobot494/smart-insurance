const { database: logger } = require('../utils/logger');
const { Client, Pool } = require('pg');

/**
 * Manages PostgreSQL database connections and queries for data extraction
 * Singleton pattern to ensure single connection pool across application
 */
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.initialized = false;
    
    // Use DATABASE_PUBLIC_URL for external connections, DATABASE_URL as fallback
    const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
    
    if (connectionString) {
      this.config = {
        connectionString: connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };
    } else {
      this.config = {
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'password',
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: process.env.PGPORT || process.env.DB_PORT || 5432,
        database: process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.DB_NAME || 'railway',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };
    }
  }

  /**
   * Get singleton instance of DatabaseManager
   * @returns {DatabaseManager} Singleton instance
   */
  static getInstance() {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection pool
   */
  async initialize() {
    // Prevent multiple initializations
    if (this.initialized) {
      return true;
    }

    try {
      this.pool = new Pool(this.config);
      
      // Test connection
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      
      logger.info('✅ Database connection established successfully');
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} query - SQL query string
   * @param {Array} params - Query parameters
   * @returns {Object} Query result
   */
  async query(query, params = []) {
    if (!this.pool) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.pool.query(query, params);
      return result;
    } catch (error) {
      logger.error('❌ Database query failed:', error.message);
      logger.error('Query:', query);
      logger.error('Params:', params);
      throw error;
    }
  }

  /**
   * Search companies by name using database function
   * @param {string} companyName - Company name to search for
   * @returns {Array} Array of matching Form 5500 records
   */
  async searchCompaniesByName(companyName) {
    try {
      const result = await this.query(
        'SELECT * FROM search_companies_by_name($1)',
        [companyName]
      );
      
      return result.rows;
    } catch (error) {
      logger.error(`❌ Error searching companies for "${companyName}":`, error.message);
      throw error;
    }
  }

  /**
   * Get Schedule A records by EIN using database function
   * @param {string} ein - EIN to search for
   * @returns {Array} Array of matching Schedule A records
   */
  async getScheduleAByEIN(ein) {
    try {
      const cleanEIN = ein.replace(/\D/g, '');
      
      if (cleanEIN.length !== 9) {
        throw new Error(`Invalid EIN: ${ein} (must be 9 digits)`);
      }

      const result = await this.query(
        'SELECT * FROM get_schedule_a_by_ein($1)',
        [cleanEIN]
      );
      
      return result.rows;
    } catch (error) {
      logger.error(`❌ Error searching Schedule A for EIN "${ein}":`, error.message);
      throw error;
    }
  }

  /**
   * Get database connection statistics
   * @returns {Object} Connection pool statistics
   */
  getConnectionStats() {
    if (!this.pool) {
      return { status: 'Not initialized' };
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  /**
   * Close database connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('✅ Database connections closed');
    }
  }

  /**
   * Create a new pipeline for a firm
   * @param {string} firmName - Name of the PE firm
   * @returns {number} pipeline_id
   */
  async createPipeline(firmName) {
    try {
      if (!this.pool) {
        await this.initialize();
      }
      
      const result = await this.query(
        'INSERT INTO pipelines (firm_name, status) VALUES ($1, $2) RETURNING pipeline_id',
        [firmName, 'pending']
      );
      return result.rows[0].pipeline_id;
    } catch (error) {
      logger.error('❌ Failed to create pipeline:', error.message);
      throw error;
    }
  }

  /**
   * Get complete pipeline data by ID
   * @param {number} pipelineId 
   * @returns {Object} Complete pipeline object
   */
  async getPipeline(pipelineId) {
    try {
      if (!this.pool) {
        await this.initialize();
      }
      
      const result = await this.query(
        'SELECT * FROM pipelines WHERE pipeline_id = $1',
        [pipelineId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('❌ Failed to get pipeline:', error.message);
      throw error;
    }
  }

  /**
   * Update specific fields in a pipeline
   * @param {number} pipelineId 
   * @param {Object} updates - Fields to update
   */
  async updatePipeline(pipelineId, updates) {
    try {
      if (!this.pool) {
        await this.initialize();
      }
      
      // Build dynamic SET clause
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      const values = [pipelineId, ...Object.values(updates), new Date()];
      
      await this.query(
        `UPDATE pipelines SET ${setClause}, updated_at = $${values.length} WHERE pipeline_id = $1`,
        values
      );
    } catch (error) {
      logger.error('❌ Failed to update pipeline:', error.message);
      throw error;
    }
  }

  /**
   * Get all pipelines with optional filtering
   * @param {Object} filters - Optional status, firm_name filters
   * @returns {Array} Array of pipeline objects
   */
  async getAllPipelines(filters = {}) {
    try {
      if (!this.pool) {
        await this.initialize();
      }
      
      let whereClause = '';
      let values = [];
      
      if (filters.status) {
        whereClause = ' WHERE status = $1';
        values.push(filters.status);
      }
      
      if (filters.firm_name) {
        whereClause += (whereClause ? ' AND' : ' WHERE') + ` firm_name ILIKE $${values.length + 1}`;
        values.push(`%${filters.firm_name}%`);
      }
      
      const result = await this.query(
        `SELECT * FROM pipelines${whereClause} ORDER BY created_at DESC`,
        values
      );
      return result.rows;
    } catch (error) {
      logger.error('❌ Failed to get all pipelines:', error.message);
      throw error;
    }
  }

  /**
   * Delete a pipeline and all its data
   * @param {number} pipelineId 
   */
  async deletePipeline(pipelineId) {
    try {
      if (!this.pool) {
        await this.initialize();
      }
      
      await this.query('DELETE FROM pipelines WHERE pipeline_id = $1', [pipelineId]);
    } catch (error) {
      logger.error('❌ Failed to delete pipeline:', error.message);
      throw error;
    }
  }

  /**
   * Reset pipeline to pending state (for retries)
   * @param {number} pipelineId 
   * @param {string} fromStep - Which step to reset from ('research', 'legal_resolution', 'data_extraction')
   */
  async resetPipeline(pipelineId, fromStep) {
    try {
      if (!this.pool) {
        await this.initialize();
      }
      
      const updates = { updated_at: new Date() };
      
      if (fromStep === 'research') {
        updates.status = 'pending';
        updates.companies = null;
        updates.research_completed_at = null;
        updates.legal_resolution_completed_at = null;
        updates.data_extraction_completed_at = null;
      } else if (fromStep === 'legal_resolution') {
        updates.status = 'research_complete';
        // Reset companies to only have name field (remove legal entity data)
        const pipeline = await this.getPipeline(pipelineId);
        if (pipeline.companies) {
          updates.companies = pipeline.companies.map(company => ({ name: company.name }));
        }
        updates.legal_resolution_completed_at = null;
        updates.data_extraction_completed_at = null;
      } else if (fromStep === 'data_extraction') {
        updates.status = 'legal_resolution_complete';
        // Reset companies to remove form5500_data only
        const pipeline = await this.getPipeline(pipelineId);
        if (pipeline.companies) {
          updates.companies = pipeline.companies.map(company => ({
            name: company.name,
            legal_entity_name: company.legal_entity_name,
            city: company.city,
            state: company.state,
            exited: company.exited
          }));
        }
        updates.data_extraction_completed_at = null;
      }
      
      await this.updatePipeline(pipelineId, updates);
    } catch (error) {
      logger.error('❌ Failed to reset pipeline:', error.message);
      throw error;
    }
  }

  /**
   * Test database connectivity and functions
   */
  async testConnection() {
    try {
      logger.info('🔍 Testing database connection...');
      
      // Test basic connectivity
      const timeResult = await this.query('SELECT NOW() as current_time');
      logger.info('✅ Basic connectivity test passed');
      
      // Test search_companies_by_name function
      const companyResult = await this.searchCompaniesByName('Test Company');
      logger.info('✅ search_companies_by_name function test passed');
      
      // Test get_schedule_a_by_ein function  
      const einResult = await this.getScheduleAByEIN('123456789');
      logger.info('✅ get_schedule_a_by_ein function test passed');
      
      logger.info('✅ All database tests passed successfully');
      return true;
      
    } catch (error) {
      logger.error('❌ Database test failed:', error.message);
      throw error;
    }
  }

}

module.exports = DatabaseManager;