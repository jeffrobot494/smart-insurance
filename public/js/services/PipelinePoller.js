// Smart Insurance - Pipeline Polling Service

class PipelinePoller {
    constructor(api, cardManager, onStatusChange) {
        this.api = api;
        this.cardManager = cardManager;
        this.onStatusChange = onStatusChange; // Callback for status changes
        this.pollingService = new PollingService();
        this.pollingStartTimes = new Map(); // Track when polling started for each pipeline
        
        // Pipeline statuses that require polling
        this.runningStatuses = [
            'research_running',
            'legal_resolution_running', 
            'data_extraction_running'
        ];
        
        // Pipeline statuses where polling should stop
        this.stopPollingStatuses = [
            'pending',
            'research_complete',
            'legal_resolution_complete',
            'data_extraction_complete',
            'research_failed',
            'legal_resolution_failed',
            'data_extraction_failed',
            'research_cancelled',
            'legal_resolution_cancelled',
            'data_extraction_cancelled'
        ];
    }
    
    /**
     * Start polling for a specific pipeline
     * @param {number} pipelineId - Pipeline ID to poll
     */
    startPipelinePolling(pipelineId) {
        const pollerId = `pipeline-${pipelineId}`;
        console.log(`PipelinePoller: Starting polling for pipeline ${pipelineId}`);
        
        // Track when we started polling to prevent immediate stopping
        this.pollingStartTimes.set(pipelineId, Date.now());
        
        this.pollingService.startPolling(pollerId, async () => {
            await this.pollPipeline(pipelineId);
        });
    }
    
    /**
     * Stop polling for a specific pipeline
     * @param {number} pipelineId - Pipeline ID to stop polling
     */
    stopPipelinePolling(pipelineId) {
        const pollerId = `pipeline-${pipelineId}`;
        this.pollingService.stopPolling(pollerId);
        console.log(`PipelinePoller: Stopped polling for pipeline ${pipelineId}`);
    }
    
    /**
     * Poll a single pipeline for status updates
     * @param {number} pipelineId - Pipeline ID to poll
     */
    async pollPipeline(pipelineId) {
        try {
            const result = await this.api.getPipeline(pipelineId);
            
            if (result.success && result.pipeline) {
                const pipeline = result.pipeline;
                const currentStatus = pipeline.status;
                
                console.log(`PipelinePoller: Pipeline ${pipelineId} status: ${currentStatus}`);
                
                // ✅ ONLY notify orchestrator - let orchestrator handle UI
                if (this.onStatusChange) {
                    this.onStatusChange(pipelineId, currentStatus, pipeline);
                }
                
                // Stop polling if pipeline has reached a final state
                if (this.isPollingComplete(currentStatus, pipelineId)) {
                    console.log(`PipelinePoller: Pipeline ${pipelineId} reached final state: ${currentStatus}`);
                    this.stopPipelinePolling(pipelineId);
                }
                
            } else {
                console.warn(`PipelinePoller: Failed to get pipeline ${pipelineId}:`, result.error);
            }
            
        } catch (error) {
            console.error(`PipelinePoller: Error polling pipeline ${pipelineId}:`, error);
        }
    }
    
    /**
     * Check if a pipeline status requires polling
     * @param {string} status - Pipeline status
     * @returns {boolean} True if pipeline should be polled
     */
    shouldStartPolling(status) {
        return this.runningStatuses.includes(status);
    }
    
    /**
     * Check if polling should stop for a pipeline status
     * @param {string} status - Pipeline status
     * @param {number} pipelineId - Pipeline ID to check grace period
     * @returns {boolean} True if polling should stop
     */
    isPollingComplete(status, pipelineId) {
        if (!this.stopPollingStatuses.includes(status)) {
            return false;
        }
        
        // Add 10-second grace period after starting polling to prevent race conditions
        const startTime = this.pollingStartTimes.get(pipelineId);
        if (startTime && (Date.now() - startTime < 10000)) {
            console.log(`PipelinePoller: Grace period active for pipeline ${pipelineId} - continuing polling despite ${status}`);
            return false;
        }
        
        // Clean up start time tracking
        if (startTime) {
            this.pollingStartTimes.delete(pipelineId);
        }
        
        return true;
    }
    
    /**
     * Stop all pipeline polling
     */
    stopAllPolling() {
        console.log('PipelinePoller: Stopping all pipeline polling');
        this.pollingService.stopAll();
    }
    
    /**
     * Get information about active pipeline pollers
     */
    getPollingInfo() {
        return this.pollingService.getActivePollers();
    }
    
    /**
     * Check if a pipeline is being polled
     * @param {number} pipelineId - Pipeline ID to check
     */
    isPollingPipeline(pipelineId) {
        return this.pollingService.isPolling(`pipeline-${pipelineId}`);
    }
}

// Make PipelinePoller available globally
window.PipelinePoller = PipelinePoller;