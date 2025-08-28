const WorkflowCancellationManager = require('./WorkflowCancellationManager');

/**
 * WorkflowErrorHandler - Handles API errors during workflow execution
 * Provides clear database tracking and standardized error responses
 */
class WorkflowErrorHandler {
  constructor(databaseManager, logger) {
    this.databaseManager = databaseManager;
    this.logger = logger;
    this.cancellationManager = WorkflowCancellationManager.getInstance();
  }
  
  /**
   * Main error handling method - records error and triggers cancellation
   * @param {string|number} pipelineId - Pipeline ID
   * @param {string} currentStatus - Current pipeline status (e.g., 'research_running')
   * @param {WorkflowAPIError} error - The workflow API error
   * @param {string} apiName - Name of the API that failed
   */
  async handleWorkflowFailure(pipelineId, currentStatus, error, apiName) {
    this.logger.error(`WorkflowErrorHandler: Handling ${apiName} failure for pipeline ${pipelineId}`);
    
    try {
      // 1. Record error in database (set status to *_failed)
      await this.recordAPIError(pipelineId, {
        apiName: apiName,
        errorMessage: error.message,
        errorType: this.classifyError(error.originalError),
        currentState: currentStatus
      });
      
      // 2. Set cancellation flag to stop all workflow processes immediately
      await this.cancellationManager.cancelPipeline(pipelineId, 'api_error');
      
      // 3. Done - client will learn of failure via polling
      //    Reset happens later when user clicks Reset button
      
      this.logger.info(`WorkflowErrorHandler: Successfully handled ${apiName} failure for pipeline ${pipelineId}`);
      
    } catch (handlingError) {
      this.logger.error(`WorkflowErrorHandler: Failed to handle error for pipeline ${pipelineId}:`, handlingError);
      throw handlingError;
    }
  }
  
  /**
   * Record API error in database with clear data entries
   * @param {string|number} pipelineId - Pipeline ID
   * @param {Object} errorData - Error information
   * @param {string} errorData.apiName - Name of API that failed
   * @param {string} errorData.errorMessage - Error message
   * @param {string} errorData.errorType - Classified error type
   * @param {string} errorData.currentState - State when error occurred
   */
  async recordAPIError(pipelineId, errorData) {
    const errorObject = {
      api: errorData.apiName,
      type: errorData.errorType,
      message: errorData.errorMessage,
      time: new Date().toISOString(),
      state: errorData.currentState
    };
    
    // Determine failed status based on current state
    const failedStatus = `${errorData.currentState.split('_')[0]}_failed`;
    
    await this.databaseManager.updatePipeline(pipelineId, {
      status: failedStatus,
      error: JSON.stringify(errorObject)
    });
    
    this.logger.info(`WorkflowErrorHandler: Recorded ${errorData.apiName} error for pipeline ${pipelineId}, status: ${failedStatus}`);
  }
  
  /**
   * Define reset behavior - determines where to reset pipeline status
   * @param {string} currentStatus - Current pipeline status
   * @returns {string} Target status for reset
   */
  defineResetBehavior(currentStatus) {
    const rules = {
      'research_running': 'pending',                        // Start over
      'research_failed': 'pending',                         // Reset to start over
      'legal_resolution_running': 'research_complete',      // Back to previous step
      'legal_resolution_failed': 'research_complete'        // Reset to previous step
      // Note: data_extraction errors are programming errors, not API errors
    };
    return rules[currentStatus] || 'pending'; // Default fallback
  }
  
  /**
   * Get workflow name from status for logging/reporting
   * @param {string} currentStatus - Pipeline status
   * @returns {string} Human readable workflow name
   */
  getWorkflowName(currentStatus) {
    const workflowMap = {
      'research_running': 'research',
      'legal_resolution_running': 'legal_resolution', 
      'data_extraction_running': 'data_extraction'
    };
    return workflowMap[currentStatus] || 'unknown_workflow';
  }
  
  /**
   * Classify error type based on error message and status code
   * @param {Error} error - Original error object
   * @returns {string} Error type classification
   */
  classifyError(error) {
    if (!error) return 'unknown_error';
    
    const message = error.message || '';
    const status = error.status || error.statusCode;
    
    if (message.includes('credit') || message.includes('balance')) {
      return 'credits_exhausted';
    }
    if (message.includes('overload') || status === 429) {
      return 'rate_limit';
    }
    if (status >= 500) {
      return 'server_error';
    }
    if (status === 403) {
      return 'authorization_failed';
    }
    if (message.includes('timeout')) {
      return 'timeout_error';
    }
    return 'unknown_error';
  }
  
  /**
   * Get error history for debugging
   * @param {string|number} pipelineId - Pipeline ID
   * @returns {Array} Array of error records
   */
  async getErrorHistory(pipelineId) {
    const query = `
      SELECT error, updated_at
      FROM pipelines 
      WHERE pipeline_id = $1 
      AND error IS NOT NULL
      ORDER BY updated_at DESC`;
      
    const result = await this.databaseManager.query(query, [pipelineId]);
    return result.rows.map(row => ({
      error: JSON.parse(row.error),
      timestamp: row.updated_at
    }));
  }
  
  /**
   * Check if pipeline can be reset (not currently running)
   * @param {string|number} pipelineId - Pipeline ID
   * @returns {boolean} True if pipeline can be reset
   */
  async canResetWorkflow(pipelineId) {
    const pipeline = await this.databaseManager.getPipeline(pipelineId);
    if (!pipeline) return false;
    
    // Can reset if status is in a "ready" state (not currently running)
    const resetableStatuses = ['pending', 'research_complete', 'legal_resolution_complete', 'research_failed', 'legal_resolution_failed'];
    return resetableStatuses.includes(pipeline.status);
  }
  
  /**
   * Clear error state when user manually resets
   * @param {string|number} pipelineId - Pipeline ID
   */
  async clearErrorState(pipelineId) {
    const query = `
      UPDATE pipelines 
      SET error = NULL
      WHERE pipeline_id = $1`;
      
    await this.databaseManager.query(query, [pipelineId]);
    this.logger.info(`WorkflowErrorHandler: Cleared error state for pipeline ${pipelineId}`);
  }
}

module.exports = WorkflowErrorHandler;