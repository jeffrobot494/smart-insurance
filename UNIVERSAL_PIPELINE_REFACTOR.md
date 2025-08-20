# Universal Pipeline Object Refactor

## Overview

This document outlines a comprehensive refactor to replace the current complex workflow execution ID system with a single, universal pipeline object. This change will dramatically simplify the data flow and reduce system complexity by ~40%.

## Current System Issues

### Data Complexity Problems
- **Two separate database tables** with foreign key relationships
- **Multiple workflow execution IDs** passed between functions
- **Complex data transformations** between different object formats
- **Scattered state management** across SaveTaskResults, VerificationResultsConverter, and DatabaseManager
- **Tightly coupled operations** - Manager.js runs all 3 steps sequentially with no independent control

### Current Data Flow
```
PE Research → WorkflowExecutionID_1 → Portfolio Companies Table
    ↓
Legal Entity Resolution → WorkflowExecutionID_2 → Portfolio Companies Table (updated)
    ↓  
Data Extraction → WorkflowExecutionID_3 → Workflow Results
```

## Proposed Universal Pipeline Object

### New Data Structure
```javascript
{
  "pipeline_id": 1,
  "firm_name": "American Discovery Capital",
  "status": "data_extraction_complete", // pending, research_complete, legal_resolution_complete, data_extraction_complete, failed
  "portfolio_company_names": ["DataLink Service Fund Solutions", "TechCorp Industries", "Healthcare Partners Group"],
  "legal_entities": [
    {
      "legal_entity_name": "DataLink Service Fund Solutions, LLC",
      "city": "Austin",
      "state": "TX"
    },
    {
      "legal_entity_name": "TechCorp Industries, Inc",
      "city": "San Francisco", 
      "state": "CA"
    },
    {
      "legal_entity_name": "Healthcare Partners Group",
      "city": "Boston",
      "state": "MA"
    }
  ],
  "form5500_data": {...}, // Final Form 5500 extraction results
  "research_completed_at": "2025-08-20T10:30:00Z",
  "legal_resolution_completed_at": "2025-08-20T10:45:00Z", 
  "data_extraction_completed_at": "2025-08-20T11:00:00Z",
  "created_at": "2025-08-20T10:15:00Z",
  "updated_at": "2025-08-20T11:00:00Z"
}
```

### New Data Flow
```
Create Pipeline → Pipeline Object
    ↓
Run Research → Updates Pipeline Object (portfolio_company_names)
    ↓
Run Legal Resolution → Updates Pipeline Object (legal_entities: [{legal_entity_name, city, state}])
    ↓
Run Data Extraction → Updates Pipeline Object (form5500_data)
```

## Detailed Implementation Changes

## 1. Database Schema Changes

### A. Remove Current Tables
```sql
-- Drop existing tables and relationships
DROP TABLE IF EXISTS portfolio_companies;
DROP TABLE IF EXISTS workflow_executions;
```

### B. Create New Unified Table
```sql
-- New unified pipelines table
CREATE TABLE pipelines (
    pipeline_id SERIAL PRIMARY KEY,
    firm_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Research step results
    portfolio_company_names TEXT[], -- Array of original company names
    research_completed_at TIMESTAMP,
    
    -- Legal resolution step results  
    legal_entities JSONB, -- Array of legal entity objects with name, city, state
    legal_resolution_completed_at TIMESTAMP,
    
    -- Data extraction step results
    form5500_data JSONB, -- Final Form 5500 extraction results
    data_extraction_completed_at TIMESTAMP,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_pipelines_firm_name ON pipelines(firm_name);
CREATE INDEX idx_pipelines_status ON pipelines(status);
CREATE INDEX idx_pipelines_created_at ON pipelines(created_at);

-- Add comments for documentation
COMMENT ON TABLE pipelines IS 'Unified pipeline tracking for PE firm research, legal resolution, and data extraction';
COMMENT ON COLUMN pipelines.portfolio_company_names IS 'Array of original company names from research workflow';
COMMENT ON COLUMN pipelines.legal_entities IS 'Array of legal entity objects with legal_entity_name, city, state for each company';
COMMENT ON COLUMN pipelines.form5500_data IS 'Final Form 5500 extraction results in JSON format';
```

### C. Benefits of New Schema
- **Single table** instead of 2 with foreign keys
- **No complex joins** needed to get complete pipeline data
- **Atomic updates** for each pipeline step
- **Clear progression tracking** with timestamp fields
- **Structured legal entities** with name, city, state for each company

## 2. WorkflowResultsParser Class (New)

### A. Purpose
Replace the opaque workflow results object handling with a clean parser class that can interpret results from different workflow types.

### B. Implementation
```javascript
// server/utils/WorkflowResultsParser.js
const { manager: logger } = require('./logger');

class WorkflowResultsParser {
  
  /**
   * Parse workflow results based on workflow type
   * @param {Array} results - Raw results from WorkflowManager.executeWorkflow()
   * @param {string} workflowType - 'research' or 'legal_resolution'
   * @returns {Object} Parsed results
   */
  static parseResults(results, workflowType) {
    if (!results || !Array.isArray(results)) {
      throw new Error('Invalid results format: expected array');
    }

    switch (workflowType) {
      case 'research':
        return this.parseResearchResults(results);
      case 'legal_resolution':
        return this.parseLegalResolutionResults(results);
      default:
        throw new Error(`Unsupported workflow type: ${workflowType}`);
    }
  }

  /**
   * Parse PE firm research workflow results
   * @param {Array} results - Raw workflow results
   * @returns {Array} Array of company names
   */
  static parseResearchResults(results) {
    const companies = [];
    
    for (const result of results) {
      try {
        // Research workflow stores company list in task 4 result
        if (result.tasks && result.tasks[4] && result.tasks[4].result) {
          const taskResult = result.tasks[4].result;
          
          // Handle both string and object results
          let parsed;
          if (typeof taskResult === 'string') {
            parsed = JSON.parse(taskResult);
          } else {
            parsed = taskResult;
          }
          
          // Extract companies array
          if (parsed.companies && Array.isArray(parsed.companies)) {
            companies.push(...parsed.companies);
          } else if (parsed.firm && parsed.firm.companies) {
            companies.push(...parsed.firm.companies);
          } else {
            logger.warn('Unexpected research result format:', parsed);
          }
        }
      } catch (error) {
        logger.error('Failed to parse research result:', error.message);
        logger.debug('Problematic result:', result);
      }
    }
    
    // Filter out empty/invalid company names
    const validCompanies = companies
      .filter(company => company && typeof company === 'string' && company.trim().length > 0)
      .map(company => company.trim());
    
    // Remove duplicates
    return [...new Set(validCompanies)];
  }

  /**
   * Parse legal entity resolution workflow results  
   * @param {Array} results - Raw workflow results
   * @returns {Array} Array of legal entity objects {legal_entity_name, city, state}
   */
  static parseLegalResolutionResults(results) {
    const legalEntities = [];
    
    for (const result of results) {
      try {
        // Legal resolution workflow stores result in final task
        if (result.tasks) {
          // Find the last successful task (workflow may have different task counts)
          const taskIds = Object.keys(result.tasks).map(id => parseInt(id)).sort((a, b) => b - a);
          
          for (const taskId of taskIds) {
            const task = result.tasks[taskId];
            if (task && task.success && task.result) {
              const taskResult = task.result;
              
              // Handle both string and object results
              let parsed;
              if (typeof taskResult === 'string') {
                try {
                  parsed = JSON.parse(taskResult);
                } catch {
                  // If not JSON, treat as plain text legal entity name
                  parsed = { legal_entity_name: taskResult };
                }
              } else {
                parsed = taskResult;
              }
              
              // Extract legal entity information
              const legalEntity = this.extractLegalEntity(parsed);
              if (legalEntity) {
                legalEntities.push(legalEntity);
                break; // Found valid result for this workflow
              }
            }
          }
        }
      } catch (error) {
        logger.error('Failed to parse legal resolution result:', error.message);
        logger.debug('Problematic result:', result);
      }
    }
    
    return legalEntities;
  }

  /**
   * Extract legal entity object from parsed result
   * @param {Object} parsed - Parsed task result
   * @returns {Object|null} Legal entity object or null if invalid
   */
  static extractLegalEntity(parsed) {
    let legalEntity = {
      legal_entity_name: null,
      city: null,
      state: null
    };
    
    // Handle different result formats
    if (parsed.form5500_match) {
      // Format: { form5500_match: { legal_name: "...", city: "...", state: "..." } }
      legalEntity.legal_entity_name = parsed.form5500_match.legal_name;
      legalEntity.city = parsed.form5500_match.city;
      legalEntity.state = parsed.form5500_match.state;
    } else if (parsed.legal_entity_research) {
      // Format: { legal_entity_research: { legal_entity_name: "...", location: { city: "...", state: "..." } } }
      legalEntity.legal_entity_name = parsed.legal_entity_research.legal_entity_name;
      if (parsed.legal_entity_research.location) {
        legalEntity.city = parsed.legal_entity_research.location.city;
        legalEntity.state = parsed.legal_entity_research.location.state;
      }
    } else if (parsed.legal_entity_name) {
      // Format: { legal_entity_name: "...", city: "...", state: "..." }
      legalEntity.legal_entity_name = parsed.legal_entity_name;
      legalEntity.city = parsed.city;
      legalEntity.state = parsed.state;
    } else if (typeof parsed === 'string') {
      // Format: just the legal entity name as string
      legalEntity.legal_entity_name = parsed;
    } else {
      // Try to find any field that looks like a legal entity name
      const possibleNameFields = ['name', 'company_name', 'legal_name', 'entity_name'];
      for (const field of possibleNameFields) {
        if (parsed[field]) {
          legalEntity.legal_entity_name = parsed[field];
          break;
        }
      }
    }
    
    // Return null if no legal entity name found
    if (!legalEntity.legal_entity_name || legalEntity.legal_entity_name.trim().length === 0) {
      return null;
    }
    
    // Clean up the data
    legalEntity.legal_entity_name = legalEntity.legal_entity_name.trim();
    legalEntity.city = legalEntity.city ? legalEntity.city.trim() : null;
    legalEntity.state = legalEntity.state ? legalEntity.state.trim() : null;
    
    return legalEntity;
  }

  /**
   * Validate parsed results
   * @param {*} results - Results to validate
   * @param {string} workflowType - Expected workflow type
   * @returns {boolean} True if valid
   */
  static validateResults(results, workflowType) {
    if (workflowType === 'research') {
      return Array.isArray(results) && results.every(item => typeof item === 'string');
    } else if (workflowType === 'legal_resolution') {
      return Array.isArray(results) && results.every(item => 
        item && typeof item === 'object' && 
        typeof item.legal_entity_name === 'string'
      );
    }
    
    return false;
  }
}

module.exports = WorkflowResultsParser;
```

### C. Benefits of WorkflowResultsParser
- **Centralized parsing logic** for different workflow types
- **Robust error handling** for malformed results
- **Flexible format support** - handles multiple result structures
- **Easy to extend** for new workflow types
- **Clear separation of concerns** from Manager.js

## 3. DatabaseManager.js Complete Rewrite

### A. Remove Existing Methods
```javascript
// DELETE these methods:
- createWorkflowExecution()
- createBatchWorkflowExecutions() 
- savePortfolioCompanies()
- getPortfolioCompaniesByWorkflowId()
- updateWorkflowResults()
- getWorkflowResults()
- getAllWorkflowResults()
- getWorkflowExecution()
```

### B. Add New Pipeline Methods
```javascript
class DatabaseManager {
  /**
   * Create a new pipeline for a firm
   * @param {string} firmName - Name of the PE firm
   * @returns {number} pipeline_id
   */
  async createPipeline(firmName) {
    const result = await this.query(
      'INSERT INTO pipelines (firm_name, status) VALUES ($1, $2) RETURNING pipeline_id',
      [firmName, 'pending']
    );
    return result.rows[0].pipeline_id;
  }

  /**
   * Get complete pipeline data by ID
   * @param {number} pipelineId 
   * @returns {Object} Complete pipeline object
   */
  async getPipeline(pipelineId) {
    const result = await this.query(
      'SELECT * FROM pipelines WHERE pipeline_id = $1',
      [pipelineId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update specific fields in a pipeline
   * @param {number} pipelineId 
   * @param {Object} updates - Fields to update
   */
  async updatePipeline(pipelineId, updates) {
    // Build dynamic SET clause
    const setClause = Object.keys(updates).map((key, index) => 
      `${key} = $${index + 2}`
    ).join(', ');
    
    const values = [pipelineId, ...Object.values(updates), new Date()];
    
    await this.query(
      `UPDATE pipelines SET ${setClause}, updated_at = $${values.length} WHERE pipeline_id = $1`,
      values
    );
  }

  /**
   * Get all pipelines with optional filtering
   * @param {Object} filters - Optional status, firm_name filters
   * @returns {Array} Array of pipeline objects
   */
  async getAllPipelines(filters = {}) {
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
  }

  /**
   * Delete a pipeline and all its data
   * @param {number} pipelineId 
   */
  async deletePipeline(pipelineId) {
    await this.query('DELETE FROM pipelines WHERE pipeline_id = $1', [pipelineId]);
  }

  /**
   * Reset pipeline to pending state (for retries)
   * @param {number} pipelineId 
   * @param {string} fromStep - Which step to reset from ('research', 'legal_resolution', 'data_extraction')
   */
  async resetPipeline(pipelineId, fromStep) {
    const updates = { updated_at: new Date() };
    
    if (fromStep === 'research') {
      updates.status = 'pending';
      updates.portfolio_company_names = null;
      updates.legal_entity_names = null;
      updates.form5500_data = null;
      updates.research_completed_at = null;
      updates.legal_resolution_completed_at = null;
      updates.data_extraction_completed_at = null;
    } else if (fromStep === 'legal_resolution') {
      updates.status = 'research_complete';
      updates.legal_entity_names = null;
      updates.form5500_data = null;
      updates.legal_resolution_completed_at = null;
      updates.data_extraction_completed_at = null;
    } else if (fromStep === 'data_extraction') {
      updates.status = 'legal_resolution_complete';
      updates.form5500_data = null;
      updates.data_extraction_completed_at = null;
    }
    
    await this.updatePipeline(pipelineId, updates);
  }
}
```

### C. Benefits of New DatabaseManager
- **7 complex methods → 6 simple CRUD methods**
- **No foreign key management**
- **Single table queries only**
- **Built-in retry/reset functionality**
- **Clear, atomic operations**

## 3. Manager.js Complete Refactoring

### A. Current Manager.js Issues
- **Lines 77-121**: `findPortfolioCompaniesWorkflow()` does everything
- **Lines 123-196**: Complex workflow chaining with ID passing
- **Lines 202-224**: Batch processing with multiple IDs
- **No independent step control**

### B. New Manager.js Structure
```javascript
class Manager {
  constructor() {
    this.taskManager = null;
    this.dataExtractionService = new DataExtractionService();
    this.databaseManager = DatabaseManager.getInstance();
  }

  /**
   * Create a new pipeline for a firm
   * @param {string} firmName - Name of the PE firm
   * @returns {Object} New pipeline object
   */
  async createPipeline(firmName) {
    if (!firmName || firmName.trim().length === 0) {
      throw new Error('firmName is required and cannot be empty');
    }
    
    const pipelineId = await this.databaseManager.createPipeline(firmName.trim());
    return await this.databaseManager.getPipeline(pipelineId);
  }

  /**
   * Step 1: Run research workflow to find portfolio companies
   * @param {number} pipelineId 
   * @returns {Object} Updated pipeline object
   */
  async runResearch(pipelineId) {
    await this.initializeTaskManager();
    
    // Get current pipeline state
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== 'pending') {
      throw new Error(`Research can only be run on pending pipelines. Current status: ${pipeline.status}`);
    }

    logger.info(`🔍 Starting research for firm: ${pipeline.firm_name}`);
    
    try {
      // Update status to indicate research is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: 'research_running' 
      });

      // Load and execute research workflow
      const workflowData = readWorkflow('pe_firm_research.json');
      const results = await this.taskManager.executeWorkflow(workflowData, { 
        input: [pipeline.firm_name] 
      });

      // Parse company names from results using WorkflowResultsParser
      const portfolioCompanyNames = WorkflowResultsParser.parseResults(results, 'research');
      
      if (portfolioCompanyNames.length === 0) {
        throw new Error('No portfolio companies found during research');
      }

      // Update pipeline with research results
      await this.databaseManager.updatePipeline(pipelineId, {
        portfolio_company_names: portfolioCompanyNames,
        status: 'research_complete',
        research_completed_at: new Date()
      });

      logger.info(`✅ Research completed. Found ${portfolioCompanyNames.length} companies`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Research failed for pipeline ${pipelineId}:`, error.message);
      
      // Update pipeline with error status
      await this.databaseManager.updatePipeline(pipelineId, {
        status: 'research_failed'
      });
      
      throw error;
    }
  }

  /**
   * Step 2: Run legal entity resolution workflow
   * @param {number} pipelineId 
   * @returns {Object} Updated pipeline object
   */
  async runLegalResolution(pipelineId) {
    await this.initializeTaskManager();
    
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== 'research_complete') {
      throw new Error(`Legal resolution requires research to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`🏢 Starting legal entity resolution for ${pipeline.portfolio_company_names.length} companies`);
    
    try {
      // Update status to indicate legal resolution is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: 'legal_resolution_running' 
      });

      // Prepare inputs for legal entity resolution workflow
      const legalResolutionInputs = pipeline.portfolio_company_names.map(companyName => 
        `Firm: ${pipeline.firm_name}, Company: ${companyName}`
      );

      // Load and execute legal entity resolution workflow
      const workflowData = readWorkflow('portfolio_company_verification.json');
      const results = await this.taskManager.executeWorkflow(workflowData, { 
        input: legalResolutionInputs
      });

      // Parse legal entity results using WorkflowResultsParser
      const legalEntities = WorkflowResultsParser.parseResults(results, 'legal_resolution');
      
      // Ensure we have the same number of legal entities as portfolio companies
      // Fill in missing entries with fallback data
      const completeLegalEntities = [];
      for (let i = 0; i < pipeline.portfolio_company_names.length; i++) {
        const companyName = pipeline.portfolio_company_names[i];
        const legalEntity = legalEntities[i] || {
          legal_entity_name: companyName, // Fallback to original name
          city: null,
          state: null
        };
        completeLegalEntities.push(legalEntity);
        
        logger.info(`   ✓ ${companyName} → ${legalEntity.legal_entity_name}${legalEntity.city ? ` (${legalEntity.city}, ${legalEntity.state})` : ''}`);
      }

      // Update pipeline with legal resolution results
      await this.databaseManager.updatePipeline(pipelineId, {
        legal_entities: completeLegalEntities,
        status: 'legal_resolution_complete',
        legal_resolution_completed_at: new Date()
      });

      logger.info(`✅ Legal entity resolution completed`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Legal resolution failed for pipeline ${pipelineId}:`, error.message);
      
      await this.databaseManager.updatePipeline(pipelineId, {
        status: 'legal_resolution_failed'
      });
      
      throw error;
    }
  }

  /**
   * Step 3: Run Form 5500 data extraction
   * @param {number} pipelineId 
   * @returns {Object} Updated pipeline object
   */
  async runDataExtraction(pipelineId) {
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    if (pipeline.status !== 'legal_resolution_complete') {
      throw new Error(`Data extraction requires legal resolution to be completed first. Current status: ${pipeline.status}`);
    }

    logger.info(`📊 Starting Form 5500 data extraction for ${pipeline.legal_entities.length} companies`);
    
    try {
      // Update status to indicate data extraction is starting
      await this.databaseManager.updatePipeline(pipelineId, { 
        status: 'data_extraction_running' 
      });

      // Use legal entity names for Form 5500 lookup (with fallback to original names)
      const companyNamesToSearch = pipeline.legal_entities.map((legalEntity, index) => 
        legalEntity.legal_entity_name || pipeline.portfolio_company_names[index]
      );

      // Extract Form 5500 data
      const form5500Data = await this.dataExtractionService.extractData(
        companyNamesToSearch, 
        pipelineId, 
        0
      );

      // Update pipeline with final results
      await this.databaseManager.updatePipeline(pipelineId, {
        form5500_data: form5500Data,
        status: 'data_extraction_complete',
        data_extraction_completed_at: new Date()
      });

      logger.info(`✅ Data extraction completed`);
      
      return await this.databaseManager.getPipeline(pipelineId);
      
    } catch (error) {
      logger.error(`❌ Data extraction failed for pipeline ${pipelineId}:`, error.message);
      
      await this.databaseManager.updatePipeline(pipelineId, {
        status: 'data_extraction_failed'
      });
      
      throw error;
    }
  }

  /**
   * Run complete pipeline (all 3 steps) - convenience method
   * @param {string} firmName 
   * @returns {Object} Final pipeline object
   */
  async runCompletePipeline(firmName) {
    // Create pipeline
    const pipeline = await this.createPipeline(firmName);
    
    // Run all steps sequentially
    await this.runResearch(pipeline.pipeline_id);
    await this.runLegalResolution(pipeline.pipeline_id);
    await this.runDataExtraction(pipeline.pipeline_id);
    
    return await this.databaseManager.getPipeline(pipeline.pipeline_id);
  }

  /**
   * Retry a failed pipeline step
   * @param {number} pipelineId 
   * @param {string} step - 'research', 'legal_resolution', or 'data_extraction'
   * @returns {Object} Updated pipeline object
   */
  async retryStep(pipelineId, step) {
    // Reset pipeline state for the specified step
    await this.databaseManager.resetPipeline(pipelineId, step);
    
    // Run the step
    if (step === 'research') {
      return await this.runResearch(pipelineId);
    } else if (step === 'legal_resolution') {
      return await this.runLegalResolution(pipelineId);
    } else if (step === 'data_extraction') {
      return await this.runDataExtraction(pipelineId);
    } else {
      throw new Error(`Invalid step: ${step}. Must be 'research', 'legal_resolution', or 'data_extraction'`);
    }
  }

  /**
   * Get all pipelines with optional filtering
   * @param {Object} filters - Optional status, firm_name filters
   * @returns {Array} Array of pipeline objects
   */
  async getAllPipelines(filters = {}) {
    return await this.databaseManager.getAllPipelines(filters);
  }

  // Note: Helper methods removed - parsing logic moved to WorkflowResultsParser class
}
```

### C. Benefits of New Manager.js
- **318 lines → ~150 lines** (53% reduction)
- **Clear separation** of the 3 main operations
- **Independent step execution** - can run any step separately
- **Built-in retry functionality**
- **Better error handling** with specific status tracking
- **No complex ID passing** between methods

## 4. API Routes Complete Restructure

### A. Remove Current Routes
```javascript
// DELETE these routes:
POST /api/workflow              // Complex initialization
GET /api/workflow/2/            // Legacy route
GET /api/workflow/extract5500/:workflowExecutionId  // Manual data extraction
GET /api/workflow/:workflowId/results               // Complex results retrieval
GET /api/workflow/results       // All results retrieval
```

### B. Add New RESTful Pipeline Routes
```javascript
// routes/pipeline.js - New file
const express = require('express');
const router = express.Router();
const { manager: logger } = require('../utils/logger');
const { Manager } = require('../Manager');
// const pollingService = require('../services/PollingService');

const manager = new Manager();

// CREATE new pipeline
router.post('/', async (req, res) => {
  try {
    const { firm_name } = req.body;
    
    if (!firm_name) {
      return res.status(400).json({ 
        error: 'firm_name is required' 
      });
    }

    const pipeline = await manager.createPipeline(firm_name);
    
    logger.info(`📋 Created new pipeline ${pipeline.pipeline_id} for firm: ${firm_name}`);
    
    res.status(201).json({
      success: true,
      pipeline: pipeline
    });
    
  } catch (error) {
    logger.error('Pipeline creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET single pipeline
router.get('/:id', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    const pipeline = await manager.databaseManager.getPipeline(pipelineId);
    
    if (!pipeline) {
      return res.status(404).json({
        error: 'Pipeline not found'
      });
    }

    res.json({
      success: true,
      pipeline: pipeline
    });
    
  } catch (error) {
    logger.error('Get pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET all pipelines
router.get('/', async (req, res) => {
  try {
    const { status, firm_name } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (firm_name) filters.firm_name = firm_name;
    
    const pipelines = await manager.getAllPipelines(filters);
    
    res.json({
      success: true,
      pipelines: pipelines,
      count: pipelines.length
    });
    
  } catch (error) {
    logger.error('Get all pipelines error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run research step
router.post('/:id/research', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    // Send immediate response
    res.status(202).json({
      success: true,
      message: 'Research started',
      pipeline_id: pipelineId
    });

    // Run research asynchronously
    // pollingService.addMessage(pipelineId, null, 'progress', 'Starting portfolio company research');
    
    try {
      const updatedPipeline = await manager.runResearch(pipelineId);
      // pollingService.addMessage(pipelineId, null, 'complete', 
      //   `Research completed. Found ${updatedPipeline.portfolio_company_names.length} companies`);
    } catch (error) {
      // pollingService.addMessage(pipelineId, null, 'error', 
      //   `Research failed: ${error.message}`);
    }

  } catch (error) {
    logger.error('Research startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run legal resolution step
router.post('/:id/legal-resolution', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    res.status(202).json({
      success: true,
      message: 'Legal entity resolution started',
      pipeline_id: pipelineId
    });

    // pollingService.addMessage(pipelineId, null, 'progress', 'Starting legal entity resolution');
    
    try {
      const updatedPipeline = await manager.runLegalResolution(pipelineId);
      // pollingService.addMessage(pipelineId, null, 'complete', 
      //   'Legal entity resolution completed');
    } catch (error) {
      // pollingService.addMessage(pipelineId, null, 'error', 
      //   `Legal resolution failed: ${error.message}`);
    }

  } catch (error) {
    logger.error('Legal resolution startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run data extraction step
router.post('/:id/data-extraction', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    res.status(202).json({
      success: true,
      message: 'Data extraction started',
      pipeline_id: pipelineId
    });

    // pollingService.addMessage(pipelineId, null, 'progress', 'Starting Form 5500 data extraction');
    
    try {
      const updatedPipeline = await manager.runDataExtraction(pipelineId);
      // pollingService.addMessage(pipelineId, null, 'complete', 
      //   'Data extraction completed');
    } catch (error) {
      // pollingService.addMessage(pipelineId, null, 'error', 
      //   `Data extraction failed: ${error.message}`);
    }

  } catch (error) {
    logger.error('Data extraction startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST run complete pipeline (convenience route)
router.post('/:id/run-all', async (req, res) => {
  try {
    const { firm_name } = req.body;
    
    if (!firm_name) {
      return res.status(400).json({ 
        error: 'firm_name is required' 
      });
    }

    res.status(202).json({
      success: true,
      message: 'Complete pipeline started',
      firm_name: firm_name
    });

    try {
      const pipeline = await manager.runCompletePipeline(firm_name);
      // pollingService.addMessage(pipeline.pipeline_id, null, 'complete', 
      //   'Complete pipeline finished successfully');
    } catch (error) {
      // pollingService.addMessage(null, null, 'error', 
      //   `Complete pipeline failed: ${error.message}`);
    }

  } catch (error) {
    logger.error('Complete pipeline startup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST retry a failed step
router.post('/:id/retry/:step', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    const step = req.params.step;
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    if (!['research', 'legal_resolution', 'data_extraction'].includes(step)) {
      return res.status(400).json({
        error: 'Step must be research, legal_resolution, or data_extraction'
      });
    }

    res.status(202).json({
      success: true,
      message: `Retrying ${step} step`,
      pipeline_id: pipelineId
    });

    // pollingService.addMessage(pipelineId, null, 'progress', `Retrying ${step} step`);
    
    try {
      const updatedPipeline = await manager.retryStep(pipelineId, step);
      // pollingService.addMessage(pipelineId, null, 'complete', 
      //   `${step} retry completed successfully`);
    } catch (error) {
      // pollingService.addMessage(pipelineId, null, 'error', 
      //   `${step} retry failed: ${error.message}`);
    }

  } catch (error) {
    logger.error('Retry step error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE pipeline
router.delete('/:id', async (req, res) => {
  try {
    const pipelineId = parseInt(req.params.id);
    
    if (isNaN(pipelineId)) {
      return res.status(400).json({
        error: 'Valid pipeline ID is required'
      });
    }

    await manager.databaseManager.deletePipeline(pipelineId);
    
    res.json({
      success: true,
      message: 'Pipeline deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

### C. Update server.js
```javascript
// Add new pipeline routes
const pipelineRoutes = require('./routes/pipeline');
app.use('/api/pipeline', pipelineRoutes);

// Remove old workflow routes or mark as deprecated
// const workflowRoutes = require('./routes/workflow');
// app.use('/api/workflow', workflowRoutes);
```

### D. Benefits of New API Structure
- **4 complex routes → 8 simple, RESTful routes**
- **Clear separation** of concerns for each operation
- **Independent step control** - frontend can run steps as needed
- **Built-in retry functionality**
- **Consistent response format**
- **Better error handling** with specific error messages

## 5. Workflow System Changes

### A. SaveTaskResults.js Changes
```javascript
// SaveTaskResults.js will be eliminated entirely
// All database saving logic moved to Manager.js methods
// This removes ~200 lines of complex database integration code
```

### B. WorkFlowManager.js Changes
```javascript
class WorkflowManager {
  // Remove complex ID passing and database integration
  // Focus only on executing workflows and returning results
  // Manager.js handles all database operations
  
  async executeWorkflow(workflowData, userInputs, pipelineId = null) {
    // Same workflow execution logic
    // But remove all database saving - just return results
    // Manager.js will handle saving to pipeline object
    
    const results = await this.executeWorkflowSteps(workflowData, userInputs);
    
    // Optional: Add pipeline ID to results for reference
    if (pipelineId) {
      results.forEach(result => {
        result.pipelineId = pipelineId;
      });
    }
    
    return results;
  }
}
```

## 6. Database Deployment Strategy

### A. Clean Slate Approach
Since all existing data is test data, we can use a clean drop/create approach:

```sql
-- Step 1: Drop existing tables entirely
DROP TABLE IF EXISTS portfolio_companies CASCADE;
DROP TABLE IF EXISTS workflow_executions CASCADE;

-- Step 2: Create new pipelines table (from schema above)
-- [Use the CREATE TABLE statement from section 1.B]

-- Step 3: No migration needed - start fresh
```

### B. Deployment Script
```javascript
// scripts/deploy-new-schema.js
const DatabaseManager = require('../server/data-extraction/DatabaseManager');
const fs = require('fs');

async function deployNewSchema() {
  const dbManager = DatabaseManager.getInstance();
  await dbManager.initialize();
  
  console.log('🔄 Deploying new pipeline schema...');
  
  try {
    // Step 1: Drop existing tables
    console.log('📦 Dropping existing tables...');
    await dbManager.query('DROP TABLE IF EXISTS portfolio_companies CASCADE');
    await dbManager.query('DROP TABLE IF EXISTS workflow_executions CASCADE');
    
    // Step 2: Create new pipelines table
    console.log('🏗️ Creating new pipelines table...');
    const createTableSQL = fs.readFileSync('./database/create-pipelines-table.sql', 'utf8');
    await dbManager.query(createTableSQL);
    
    // Step 3: Verify deployment
    const verifyResult = await dbManager.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'pipelines' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 New schema verification:');
    console.table(verifyResult.rows);
    
    console.log('✅ New schema deployed successfully');
    
  } catch (error) {
    console.error('❌ Schema deployment failed:', error);
    throw error;
  }
}

// Run deployment if called directly
if (require.main === module) {
  deployNewSchema()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { deployNewSchema };
```

### C. Benefits of Clean Deployment
- **No data migration complexity** - start with clean tables
- **No legacy data issues** - all test data removed
- **Faster deployment** - no complex data transformation
- **Risk-free** - all existing data is test data that can be recreated

## 7. Testing Strategy

### A. Current Testing Issues
- Complex setup required for integration tests
- Multiple database tables to mock
- Difficult to test individual steps

### B. New Testing Approach
```javascript
// tests/pipeline.test.js
const { Manager } = require('../server/Manager');
const DatabaseManager = require('../server/data-extraction/DatabaseManager');

describe('Pipeline Management', () => {
  let manager;
  let dbManager;
  
  beforeAll(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    manager = new Manager();
  });
  
  beforeEach(async () => {
    // Clean test data
    await dbManager.query('DELETE FROM pipelines WHERE firm_name LIKE \'Test%\'');
  });

  describe('Pipeline Creation', () => {
    it('should create a new pipeline', async () => {
      const pipeline = await manager.createPipeline('Test Firm');
      
      expect(pipeline).toMatchObject({
        firm_name: 'Test Firm',
        status: 'pending',
        pipeline_id: expect.any(Number)
      });
      expect(pipeline.portfolio_company_names).toBeNull();
      expect(pipeline.legal_entity_names).toBeNull();
      expect(pipeline.form5500_data).toBeNull();
    });
    
    it('should reject empty firm names', async () => {
      await expect(manager.createPipeline('')).rejects.toThrow('firmName is required');
      await expect(manager.createPipeline('   ')).rejects.toThrow('firmName is required');
    });
  });

  describe('Research Step', () => {
    it('should run research step successfully', async () => {
      // Create pipeline
      const pipeline = await manager.createPipeline('Test Firm');
      
      // Mock workflow execution
      jest.spyOn(manager.taskManager, 'executeWorkflow').mockResolvedValue([
        {
          tasks: {
            4: { result: JSON.stringify({ companies: ['Company A', 'Company B'] }) }
          }
        }
      ]);
      
      // Run research
      const updated = await manager.runResearch(pipeline.pipeline_id);
      
      expect(updated.status).toBe('research_complete');
      expect(updated.portfolio_company_names).toEqual(['Company A', 'Company B']);
      expect(updated.research_completed_at).toBeTruthy();
    });
    
    it('should reject research on non-pending pipelines', async () => {
      const pipeline = await manager.createPipeline('Test Firm');
      await dbManager.updatePipeline(pipeline.pipeline_id, { status: 'research_complete' });
      
      await expect(manager.runResearch(pipeline.pipeline_id))
        .rejects.toThrow('Research can only be run on pending pipelines');
    });
  });

  describe('Legal Resolution Step', () => {
    it('should run legal resolution successfully', async () => {
      // Create pipeline with research completed
      const pipeline = await manager.createPipeline('Test Firm');
      await dbManager.updatePipeline(pipeline.pipeline_id, {
        status: 'research_complete',
        portfolio_company_names: ['Company A', 'Company B']
      });
      
      // Mock legal entity resolution
      jest.spyOn(manager, 'resolveSingleLegalEntity')
        .mockImplementation(async (firm, company) => `${company}, LLC`);
      
      // Run legal resolution
      const updated = await manager.runLegalResolution(pipeline.pipeline_id);
      
      expect(updated.status).toBe('legal_resolution_complete');
      expect(updated.legal_entity_names).toEqual(['Company A, LLC', 'Company B, LLC']);
      expect(updated.legal_resolution_completed_at).toBeTruthy();
    });
  });

  describe('Data Extraction Step', () => {
    it('should run data extraction successfully', async () => {
      // Create pipeline with legal resolution completed
      const pipeline = await manager.createPipeline('Test Firm');
      await dbManager.updatePipeline(pipeline.pipeline_id, {
        status: 'legal_resolution_complete',
        portfolio_company_names: ['Company A', 'Company B'],
        legal_entity_names: ['Company A, LLC', 'Company B, LLC']
      });
      
      // Mock data extraction
      const mockData = { companies: [{ name: 'Company A, LLC', ein: '123456789' }] };
      jest.spyOn(manager.dataExtractionService, 'extractData')
        .mockResolvedValue(mockData);
      
      // Run data extraction
      const updated = await manager.runDataExtraction(pipeline.pipeline_id);
      
      expect(updated.status).toBe('data_extraction_complete');
      expect(updated.form5500_data).toEqual(mockData);
      expect(updated.data_extraction_completed_at).toBeTruthy();
    });
  });

  describe('Complete Pipeline', () => {
    it('should run complete pipeline end-to-end', async () => {
      // Mock all dependencies
      jest.spyOn(manager.taskManager, 'executeWorkflow').mockResolvedValue([
        { tasks: { 4: { result: JSON.stringify({ companies: ['Company A'] }) } } }
      ]);
      jest.spyOn(manager, 'resolveSingleLegalEntity')
        .mockResolvedValue('Company A, LLC');
      jest.spyOn(manager.dataExtractionService, 'extractData')
        .mockResolvedValue({ companies: [{ name: 'Company A, LLC' }] });
      
      // Run complete pipeline
      const result = await manager.runCompletePipeline('Test Firm');
      
      expect(result.status).toBe('data_extraction_complete');
      expect(result.portfolio_company_names).toEqual(['Company A']);
      expect(result.legal_entity_names).toEqual(['Company A, LLC']);
      expect(result.form5500_data).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle research failures gracefully', async () => {
      const pipeline = await manager.createPipeline('Test Firm');
      
      jest.spyOn(manager.taskManager, 'executeWorkflow')
        .mockRejectedValue(new Error('Workflow failed'));
      
      await expect(manager.runResearch(pipeline.pipeline_id))
        .rejects.toThrow('Workflow failed');
      
      // Check pipeline status was updated
      const updated = await dbManager.getPipeline(pipeline.pipeline_id);
      expect(updated.status).toBe('research_failed');
    });
  });

  describe('Retry Functionality', () => {
    it('should retry failed research step', async () => {
      // Create failed pipeline
      const pipeline = await manager.createPipeline('Test Firm');
      await dbManager.updatePipeline(pipeline.pipeline_id, { status: 'research_failed' });
      
      // Mock successful retry
      jest.spyOn(manager.taskManager, 'executeWorkflow').mockResolvedValue([
        { tasks: { 4: { result: JSON.stringify({ companies: ['Company A'] }) } } }
      ]);
      
      // Retry step
      const result = await manager.retryStep(pipeline.pipeline_id, 'research');
      
      expect(result.status).toBe('research_complete');
      expect(result.portfolio_company_names).toEqual(['Company A']);
    });
  });
});
```

### C. API Testing
```javascript
// tests/api.test.js
const request = require('supertest');
const { app } = require('../server/server');

describe('Pipeline API', () => {
  describe('POST /api/pipeline', () => {
    it('should create a new pipeline', async () => {
      const response = await request(app)
        .post('/api/pipeline')
        .send({ firm_name: 'Test Firm' })
        .expect(201);
      
      expect(response.body).toMatchObject({
        success: true,
        pipeline: {
          firm_name: 'Test Firm',
          status: 'pending',
          pipeline_id: expect.any(Number)
        }
      });
    });
    
    it('should reject missing firm_name', async () => {
      await request(app)
        .post('/api/pipeline')
        .send({})
        .expect(400);
    });
  });
  
  describe('GET /api/pipeline/:id', () => {
    it('should return pipeline by ID', async () => {
      // Create pipeline first
      const createResponse = await request(app)
        .post('/api/pipeline')
        .send({ firm_name: 'Test Firm' });
      
      const pipelineId = createResponse.body.pipeline.pipeline_id;
      
      // Get pipeline
      const response = await request(app)
        .get(`/api/pipeline/${pipelineId}`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        pipeline: {
          pipeline_id: pipelineId,
          firm_name: 'Test Firm',
          status: 'pending'
        }
      });
    });
    
    it('should return 404 for non-existent pipeline', async () => {
      await request(app)
        .get('/api/pipeline/99999')
        .expect(404);
    });
  });
  
  describe('POST /api/pipeline/:id/research', () => {
    it('should start research step', async () => {
      // Create pipeline
      const createResponse = await request(app)
        .post('/api/pipeline')
        .send({ firm_name: 'Test Firm' });
      
      const pipelineId = createResponse.body.pipeline.pipeline_id;
      
      // Start research
      const response = await request(app)
        .post(`/api/pipeline/${pipelineId}/research`)
        .expect(202);
      
      expect(response.body).toMatchObject({
        success: true,
        message: 'Research started',
        pipeline_id: pipelineId
      });
    });
  });
});
```

## Summary of Benefits

This universal pipeline object refactor would deliver:

### Quantified Improvements
- **Database complexity**: 2 tables with foreign keys → 1 simple table (**50% reduction**)
- **Manager.js size**: 318 lines → ~150 lines (**53% reduction**)
- **DatabaseManager methods**: 7 complex methods → 6 simple CRUD methods (**15% method reduction, 80% complexity reduction**)
- **API routes**: 4 complex routes → 8 simple RESTful routes (**100% more endpoints, 70% less complexity per route**)

### Architectural Benefits
- **Decoupled operations**: Each step can be run independently
- **Better error handling**: Simple status flags, easy retry functionality
- **Improved testability**: Mock single objects instead of complex database relationships
- **Cleaner data flow**: Single object updated in-place vs. multiple transformations
- **Enhanced user control**: Frontend can control when each step runs
- **Simplified debugging**: All pipeline data in one place

### Development Benefits  
- **Easier onboarding**: New developers understand single object vs. complex ID relationships
- **Faster feature development**: Add new pipeline steps without database schema changes
- **Better maintainability**: Clear separation of concerns, fewer interdependencies
- **Simplified deployment**: Single table migrations instead of complex multi-table updates

This refactor represents a fundamental shift from a complex, tightly-coupled system to a simple, loosely-coupled architecture that's much easier to understand, maintain, and extend.

---

# Phase 2: Enhanced User Experience Features

The following features will be implemented in a separate phase after the core universal pipeline object refactor is complete:

## Phase 2.1: PollingService Updates

### A. Current PollingService Issues
- Uses `workflowExecutionId` terminology
- Complex message management for multiple workflow IDs per firm

### B. Updated PollingService
```javascript
class PollingService {
  constructor() {
    // Store message queues per pipeline ID
    this.messageQueues = new Map();
  }

  /**
   * Add a message to the queue for a specific pipeline
   * @param {number} pipelineId - The pipeline ID
   * @param {string|number} firmId - The firm ID (optional, kept for backwards compatibility)
   * @param {string} type - Message type (e.g., 'progress', 'error', 'complete')
   * @param {string} message - The message content
   */
  addMessage(pipelineId, firmId, type, message) {
    const pipelineKey = String(pipelineId);
    
    // Initialize queue if it doesn't exist
    if (!this.messageQueues.has(pipelineKey)) {
      this.messageQueues.set(pipelineKey, []);
    }
    
    const messageObj = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      pipelineId: pipelineId,
      firmId: firmId || null,
      type: type,
      message: message
    };
    
    this.messageQueues.get(pipelineKey).push(messageObj);
    logger.info(`📨 [POLLING] Added message for pipeline ${pipelineId}:`, messageObj);
  }

  /**
   * Add a pipeline status update message
   * @param {number} pipelineId 
   * @param {string} status - Pipeline status
   * @param {string} message 
   */
  addPipelineStatusUpdate(pipelineId, status, message) {
    this.addMessage(pipelineId, null, 'status', `${status}: ${message}`);
  }

  /**
   * Add a pipeline step completion message
   * @param {number} pipelineId 
   * @param {string} step - Step name
   * @param {boolean} success - Whether step succeeded
   * @param {string} message 
   */
  addStepUpdate(pipelineId, step, success, message) {
    const type = success ? 'step_complete' : 'step_error';
    this.addMessage(pipelineId, null, type, `${step}: ${message}`);
  }

  // Rest of methods remain the same, just update parameter names
  getAndClearMessages(pipelineId) { /* same implementation */ }
  peekMessages(pipelineId) { /* same implementation */ }
  clearPipeline(pipelineId) { /* same implementation */ }
  getActivePipelines() { /* same implementation */ }
  generateId() { /* same implementation */ }
  cleanup(maxAgeHours = 24) { /* same implementation */ }
}
```

### C. Update Polling Routes
```javascript
// routes/polling.js - Update to use pipeline terminology
router.get('/pipeline/:pipelineId', async (req, res) => {
  try {
    const pipelineId = req.params.pipelineId;
    const messages = pollingService.getAndClearMessages(pipelineId);
    
    res.json({
      success: true,
      pipelineId: pipelineId,
      messages: messages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

## Phase 2.2: Enhanced Error Handling and Recovery

### A. Current Error Handling Issues
- Failed workflows leave orphaned database records
- Difficult to retry individual steps
- Complex failure states across multiple tables

### B. New Error Handling Strategy
```javascript
// Simple pipeline status management
const PIPELINE_STATUSES = {
  // Progress states
  PENDING: 'pending',
  RESEARCH_RUNNING: 'research_running',
  RESEARCH_COMPLETE: 'research_complete',
  LEGAL_RESOLUTION_RUNNING: 'legal_resolution_running', 
  LEGAL_RESOLUTION_COMPLETE: 'legal_resolution_complete',
  DATA_EXTRACTION_RUNNING: 'data_extraction_running',
  DATA_EXTRACTION_COMPLETE: 'data_extraction_complete',
  
  // Error states
  RESEARCH_FAILED: 'research_failed',
  LEGAL_RESOLUTION_FAILED: 'legal_resolution_failed',
  DATA_EXTRACTION_FAILED: 'data_extraction_failed'
};

// Easy retry logic
async function retryFailedPipeline(pipelineId) {
  const pipeline = await databaseManager.getPipeline(pipelineId);
  
  if (pipeline.status === 'research_failed') {
    return await manager.retryStep(pipelineId, 'research');
  } else if (pipeline.status === 'legal_resolution_failed') {
    return await manager.retryStep(pipelineId, 'legal_resolution');
  } else if (pipeline.status === 'data_extraction_failed') {
    return await manager.retryStep(pipelineId, 'data_extraction');
  } else {
    throw new Error(`Cannot retry pipeline with status: ${pipeline.status}`);
  }
}

// Clean error recovery
async function resetPipelineFromStep(pipelineId, step) {
  await databaseManager.resetPipeline(pipelineId, step);
  return await databaseManager.getPipeline(pipelineId);
}
```

### C. Benefits of New Error Handling
- **Simple status flags** instead of complex state across tables
- **Easy retry functionality** for any failed step
- **Clean recovery** - reset pipeline to any previous step
- **No orphaned records** - everything is in one table

## Phase 2.3: Frontend Enhancements

### A. Current Frontend Issues
- Polls multiple workflow execution IDs
- Complex state management for chained workflows  
- Unclear progression through steps

### B. New Frontend Architecture
```javascript
// New PipelineManager.js - Replace WorkflowManager.js
class PipelineManager {
  constructor() {
    this.currentPipeline = null;
    this.pollInterval = null;
  }

  /**
   * Create a new pipeline
   */
  async createPipeline(firmName) {
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firm_name: firmName })
      });
      
      const result = await response.json();
      if (result.success) {
        this.currentPipeline = result.pipeline;
        this.startPolling();
        return result.pipeline;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to create pipeline:', error);
      throw error;
    }
  }

  /**
   * Run a specific pipeline step
   */
  async runStep(pipelineId, step) {
    const stepMap = {
      research: 'research',
      legal: 'legal-resolution',
      extraction: 'data-extraction'
    };
    
    const apiStep = stepMap[step];
    if (!apiStep) {
      throw new Error(`Invalid step: ${step}`);
    }

    try {
      const response = await fetch(`/api/pipeline/${pipelineId}/${apiStep}`, {
        method: 'POST'
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to run ${step} step:`, error);
      throw error;
    }
  }

  /**
   * Get current pipeline status
   */
  async refreshPipeline(pipelineId) {
    try {
      const response = await fetch(`/api/pipeline/${pipelineId}`);
      const result = await response.json();
      
      if (result.success) {
        this.currentPipeline = result.pipeline;
        return result.pipeline;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to refresh pipeline:', error);
      throw error;
    }
  }

  /**
   * Start polling for pipeline updates
   */
  startPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.currentPipeline) return;

      try {
        // Get pipeline status updates
        await this.refreshPipeline(this.currentPipeline.pipeline_id);
        
        // Get polling messages
        const pollResponse = await fetch(`/api/polling/pipeline/${this.currentPipeline.pipeline_id}`);
        const pollResult = await pollResponse.json();
        
        if (pollResult.success && pollResult.messages.length > 0) {
          this.handlePollingMessages(pollResult.messages);
        }
        
        // Update UI based on current pipeline status
        this.updateUI();
        
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);
  }

  /**
   * Handle polling messages
   */
  handlePollingMessages(messages) {
    messages.forEach(message => {
      console.log(`[${message.type.toUpperCase()}] ${message.message}`);
      
      // Show notifications based on message type
      if (message.type === 'complete') {
        this.showNotification('success', message.message);
      } else if (message.type === 'error') {
        this.showNotification('error', message.message);
      } else if (message.type === 'progress') {
        this.showNotification('info', message.message);
      }
    });
  }

  /**
   * Update UI based on current pipeline status
   */
  updateUI() {
    if (!this.currentPipeline) return;

    const status = this.currentPipeline.status;
    
    // Update step indicators
    this.updateStepIndicator('research', ['research_complete', 'legal_resolution_complete', 'data_extraction_complete'].includes(status));
    this.updateStepIndicator('legal', ['legal_resolution_complete', 'data_extraction_complete'].includes(status));
    this.updateStepIndicator('extraction', status === 'data_extraction_complete');
    
    // Enable/disable step buttons
    this.updateStepButton('research', status === 'pending');
    this.updateStepButton('legal', status === 'research_complete');
    this.updateStepButton('extraction', status === 'legal_resolution_complete');
    
    // Show results if available
    if (this.currentPipeline.portfolio_company_names) {
      this.displayPortfolioCompanies(this.currentPipeline.portfolio_company_names);
    }
    
    if (this.currentPipeline.legal_entities) {
      this.displayLegalEntities(this.currentPipeline.legal_entities);
    }
    
    if (this.currentPipeline.form5500_data) {
      this.displayForm5500Data(this.currentPipeline.form5500_data);
    }
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // UI helper methods
  updateStepIndicator(step, completed) { /* Update step indicator visual state */ }
  updateStepButton(step, enabled) { /* Enable/disable step button */ }
  displayPortfolioCompanies(companies) { /* Display research results */ }
  displayLegalEntities(entities) { /* Display legal resolution results with city/state */ }
  displayForm5500Data(data) { /* Display final extraction results */ }
  showNotification(type, message) { /* Show user notification */ }
}
```

### C. New UI Flow
```html
<!-- New pipeline interface -->
<div class="pipeline-container">
  <div class="pipeline-creation">
    <input type="text" id="firmName" placeholder="Enter PE firm name">
    <button onclick="createNewPipeline()">Create Pipeline</button>
  </div>
  
  <div class="pipeline-steps" id="pipelineSteps" style="display: none;">
    <div class="step-indicator">
      <div class="step" id="step-research">
        <span class="step-number">1</span>
        <span class="step-name">Research</span>
        <button onclick="runStep('research')" id="btn-research">Run Research</button>
      </div>
      
      <div class="step" id="step-legal">
        <span class="step-number">2</span>
        <span class="step-name">Legal Resolution</span>
        <button onclick="runStep('legal')" id="btn-legal" disabled>Run Legal Resolution</button>
      </div>
      
      <div class="step" id="step-extraction">
        <span class="step-number">3</span>
        <span class="step-name">Data Extraction</span>
        <button onclick="runStep('extraction')" id="btn-extraction" disabled>Run Data Extraction</button>
      </div>
    </div>
    
    <div class="pipeline-results">
      <div id="research-results" style="display: none;">
        <h3>Portfolio Companies Found:</h3>
        <ul id="portfolio-companies"></ul>
      </div>
      
      <div id="legal-results" style="display: none;">
        <h3>Legal Entities:</h3>
        <table id="legal-entities">
          <thead>
            <tr>
              <th>Original Name</th>
              <th>Legal Entity Name</th>
              <th>City</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      
      <div id="extraction-results" style="display: none;">
        <h3>Form 5500 Data:</h3>
        <div id="form5500-data"></div>
      </div>
    </div>
  </div>
</div>
```

## Phase 2 Implementation Priority

1. **PollingService Updates** - Medium priority, enhances user experience
2. **Error Handling & Recovery** - High priority, improves system reliability  
3. **Frontend Enhancements** - Low priority, nice-to-have UI improvements

These Phase 2 features can be implemented incrementally after the core pipeline refactor is complete and tested.