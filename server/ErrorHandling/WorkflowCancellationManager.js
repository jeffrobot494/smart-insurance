/**
 * WorkflowCancellationManager - Singleton class for managing workflow cancellation
 * Provides immediate termination of workflows when API errors occur
 */
class WorkflowCancellationManager {
  static instance = null;
  
  static getInstance() {
    if (!WorkflowCancellationManager.instance) {
      WorkflowCancellationManager.instance = new WorkflowCancellationManager();
    }
    return WorkflowCancellationManager.instance;
  }
  
  constructor() {
    if (WorkflowCancellationManager.instance) {
      return WorkflowCancellationManager.instance;
    }
    
    this.cancelledPipelines = new Set();
    this.cancellationCallbacks = new Map();
    
    WorkflowCancellationManager.instance = this;
  }
  
  /**
   * Cancel a pipeline and execute any registered cleanup
   * @param {string|number} pipelineId - Pipeline to cancel
   * @param {string} reason - Reason for cancellation (e.g., 'api_error')
   */
  async cancelPipeline(pipelineId, reason = 'api_error') {
    const id = String(pipelineId);
    this.cancelledPipelines.add(id);
    
    console.log(`WorkflowCancellationManager: Cancelled pipeline ${id} (reason: ${reason})`);
    
    // Execute cleanup if registered
    const cleanup = this.cancellationCallbacks.get(id);
    if (cleanup) {
      try {
        await cleanup();
      } catch (error) {
        console.error(`WorkflowCancellationManager: Cleanup failed for pipeline ${id}:`, error);
      }
      this.cancellationCallbacks.delete(id);
    }
  }
  
  /**
   * Check if a pipeline is cancelled
   * @param {string|number} pipelineId - Pipeline to check
   * @returns {boolean} True if cancelled
   */
  isCancelled(pipelineId) {
    const cancelled = this.cancelledPipelines.has(String(pipelineId));
    if (cancelled) {
      console.log(`WorkflowCancellationManager: Pipeline ${pipelineId} is CANCELLED - returning true`);
    }
    return cancelled;
  }
  
  /**
   * Clear cancellation flag for a pipeline
   * @param {string|number} pipelineId - Pipeline to clear
   */
  clearCancellation(pipelineId) {
    const id = String(pipelineId);
    this.cancelledPipelines.delete(id);
    this.cancellationCallbacks.delete(id);
    console.log(`WorkflowCancellationManager: Cleared cancellation for pipeline ${id}`);
  }
  
  /**
   * Register cleanup function to be called when pipeline is cancelled
   * @param {string|number} pipelineId - Pipeline ID
   * @param {Function} cleanupFn - Function to call on cancellation
   */
  registerCleanup(pipelineId, cleanupFn) {
    this.cancellationCallbacks.set(String(pipelineId), cleanupFn);
  }
  
  /**
   * Get all currently cancelled pipeline IDs (for debugging)
   * @returns {string[]} Array of cancelled pipeline IDs
   */
  getCancelledPipelines() {
    return Array.from(this.cancelledPipelines);
  }
}

module.exports = WorkflowCancellationManager;