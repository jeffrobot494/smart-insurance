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
      
      console.log('✅ Database connection established successfully');
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
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
      console.error('❌ Database query failed:', error.message);
      console.error('Query:', query);
      console.error('Params:', params);
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
      console.error(`❌ Error searching companies for "${companyName}":`, error.message);
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
      console.error(`❌ Error searching Schedule A for EIN "${ein}":`, error.message);
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
      console.log('✅ Database connections closed');
    }
  }

  /**
   * Create a workflow execution record in the database
   * @param {string} workflowName - Name of the workflow
   * @returns {number} The workflow execution ID
   */
  async createWorkflowExecution(workflowName) {
    try {
      // Initialize database connection if not already done
      if (!this.pool) {
        await this.initialize();
      }
      
      const result = await this.query(
        'INSERT INTO workflow_executions (workflow_name, status) VALUES ($1, $2) RETURNING id',
        [workflowName, 'running']
      );
      
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Failed to create workflow execution record:', error.message);
      // Return null instead of throwing to not break workflow execution
      return null;
    }
  }

  /**
   * Save portfolio companies to database
   * @param {number} workflowExecutionId - The workflow execution ID
   * @param {string} firmName - Name of the PE firm
   * @param {Array} companies - Array of company names
   */
  async savePortfolioCompanies(workflowExecutionId, firmName, companies) {
    try {
      // Initialize database connection if not already done
      if (!this.pool) {
        await this.initialize();
      }
      
      // Insert each company
      for (const companyName of companies) {
        await this.query(
          'INSERT INTO portfolio_companies (workflow_execution_id, firm_name, company_name) VALUES ($1, $2, $3) ON CONFLICT (workflow_execution_id, company_name) DO NOTHING',
          [workflowExecutionId, firmName, companyName]
        );
      }
      
      console.log(`✅ Saved ${companies.length} portfolio companies for ${firmName}`);
    } catch (error) {
      console.error('❌ Failed to save portfolio companies:', error.message);
      throw error;
    }
  }

  /**
   * Get portfolio companies by workflow execution ID
   * @param {number} workflowExecutionId - The workflow execution ID
   * @returns {Array} Array of company names
   */
  async getPortfolioCompaniesByWorkflowId(workflowExecutionId) {
    try {
      // Initialize database connection if not already done
      if (!this.pool) {
        await this.initialize();
      }
      
      const result = await this.query(
        'SELECT company_name FROM portfolio_companies WHERE workflow_execution_id = $1 ORDER BY company_name',
        [workflowExecutionId]
      );
      
      return result.rows.map(row => row.company_name);
    } catch (error) {
      console.error('❌ Failed to get portfolio companies:', error.message);
      throw error;
    }
  }

  /**
   * Test database connectivity and functions
   */
  async testConnection() {
    try {
      console.log('🔍 Testing database connection...');
      
      // Test basic connectivity
      const timeResult = await this.query('SELECT NOW() as current_time');
      console.log('✅ Basic connectivity test passed');
      
      // Test search_companies_by_name function
      const companyResult = await this.searchCompaniesByName('Test Company');
      console.log('✅ search_companies_by_name function test passed');
      
      // Test get_schedule_a_by_ein function  
      const einResult = await this.getScheduleAByEIN('123456789');
      console.log('✅ get_schedule_a_by_ein function test passed');
      
      console.log('✅ All database tests passed successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Database test failed:', error.message);
      throw error;
    }
  }
}

module.exports = DatabaseManager;