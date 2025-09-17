const DatabaseManager = require('../data-extraction/DatabaseManager');
const { Manager } = require('../Manager');
const WorkflowCancellationManager = require('../ErrorHandling/WorkflowCancellationManager');
const { manager: logger } = require('./logger');

/**
 * PipelineStateManager - Gatekeeper for all pipeline state transitions and operations
 * Validates requests, prevents invalid state changes, and coordinates with Manager methods
 */
class PipelineStateManager {
    constructor() {
        // Initialize dependencies
        this.databaseManager = DatabaseManager.getInstance();
        this.manager = new Manager();
        this.operations = new Map(); // Track in-progress operations
        this.cancellationManager = WorkflowCancellationManager.getInstance();
    }

    // ============================================
    // CORE STATE VALIDATION & COORDINATION
    // ============================================

    /**
     * Create a new pipeline
     */
    async createPipeline(firmName) {
        try {
            // Call Manager.createPipeline() directly
            const pipeline = await this.manager.createPipeline(firmName);

            // Return consistent result format
            return {
                success: true,
                pipeline: pipeline,
                operation: 'create',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Start research workflow for a pipeline
     * Validates: pipeline exists, status is 'pending', not already running
     */
    async startResearch(pipelineId) {
        try {
            // 1. Check if ANY operation is in progress (global blocking)
            if (this.hasAnyOperationInProgress()) {
                return {
                    success: false,
                    error: 'Another pipeline operation is already running. Please wait for it to complete.',
                    code: 'SYSTEM_BUSY',
                    pipeline_id: pipelineId
                };
            }

            // 2. Check if THIS pipeline has operation in progress (button spam protection)
            if (this.isOperationInProgress(pipelineId)) {
                return {
                    success: false,
                    error: 'Operation already in progress',
                    code: 'OPERATION_IN_PROGRESS',
                    pipeline_id: pipelineId
                };
            }

            // 3. Validate pipeline exists and state
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            if (pipeline.status !== 'pending') {
                return {
                    success: false,
                    error: `Cannot start research. Status: ${pipeline.status}`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 4. Mark operation in progress & set running status
            this.markOperationStarted(pipelineId, 'research');
            await this.databaseManager.updatePipeline(pipelineId, {
                status: 'research_running'
            });

            // 5. Call Manager method asynchronously with error handling
            this.manager.runResearch(pipelineId)
                .catch((error) => {
                    logger.error(`Research failed for pipeline ${pipelineId}:`, error.message);
                    // Error will be recorded by Manager's error handling
                })
                .finally(() => {
                    this.markOperationCompleted(pipelineId, 'research');
                });

            // 6. Return immediate success (like current routes)
            return {
                success: true,
                message: 'Research started',
                pipeline_id: pipelineId,
                operation: 'start-research',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.markOperationCompleted(pipelineId, 'research');
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Start legal resolution workflow
     * Validates: pipeline exists, status is 'research_complete'
     */
    async startLegalResolution(pipelineId) {
        try {
            // 1. Check if ANY operation is in progress (global blocking)
            if (this.hasAnyOperationInProgress()) {
                return {
                    success: false,
                    error: 'Another pipeline operation is already running. Please wait for it to complete.',
                    code: 'SYSTEM_BUSY',
                    pipeline_id: pipelineId
                };
            }

            // 2. Check if THIS pipeline has operation in progress (button spam protection)
            if (this.isOperationInProgress(pipelineId)) {
                return {
                    success: false,
                    error: 'Operation already in progress',
                    code: 'OPERATION_IN_PROGRESS',
                    pipeline_id: pipelineId
                };
            }

            // 3. Validate pipeline exists and state
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            if (pipeline.status !== 'research_complete') {
                return {
                    success: false,
                    error: `Cannot start legal resolution. Status: ${pipeline.status}`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 4. Mark operation in progress & set running status
            this.markOperationStarted(pipelineId, 'legal_resolution');
            await this.databaseManager.updatePipeline(pipelineId, {
                status: 'legal_resolution_running'
            });

            // 5. Call Manager method asynchronously with error handling
            this.manager.runLegalResolution(pipelineId)
                .catch((error) => {
                    logger.error(`Legal resolution failed for pipeline ${pipelineId}:`, error.message);
                    // Error will be recorded by Manager's error handling
                })
                .finally(() => {
                    this.markOperationCompleted(pipelineId, 'legal_resolution');
                });

            // 6. Return immediate success
            return {
                success: true,
                message: 'Legal entity resolution started',
                pipeline_id: pipelineId,
                operation: 'start-legal',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.markOperationCompleted(pipelineId, 'legal_resolution');
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Start data extraction workflow
     * Validates: pipeline exists, status is 'legal_resolution_complete'
     */
    async startDataExtraction(pipelineId) {
        try {
            // 1. Check if ANY operation is in progress (global blocking)
            if (this.hasAnyOperationInProgress()) {
                return {
                    success: false,
                    error: 'Another pipeline operation is already running. Please wait for it to complete.',
                    code: 'SYSTEM_BUSY',
                    pipeline_id: pipelineId
                };
            }

            // 2. Check if THIS pipeline has operation in progress (button spam protection)
            if (this.isOperationInProgress(pipelineId)) {
                return {
                    success: false,
                    error: 'Operation already in progress',
                    code: 'OPERATION_IN_PROGRESS',
                    pipeline_id: pipelineId
                };
            }

            // 3. Validate pipeline exists and state
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            if (pipeline.status !== 'legal_resolution_complete') {
                return {
                    success: false,
                    error: `Cannot start data extraction. Status: ${pipeline.status}`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 4. Mark operation in progress & set running status
            this.markOperationStarted(pipelineId, 'data_extraction');
            await this.databaseManager.updatePipeline(pipelineId, {
                status: 'data_extraction_running'
            });

            // 5. Call Manager method asynchronously with error handling
            this.manager.runDataExtraction(pipelineId)
                .catch((error) => {
                    logger.error(`Data extraction failed for pipeline ${pipelineId}:`, error.message);
                    // Error will be recorded by Manager's error handling
                })
                .finally(() => {
                    this.markOperationCompleted(pipelineId, 'data_extraction');
                });

            // 6. Return immediate success
            return {
                success: true,
                message: 'Data extraction started',
                pipeline_id: pipelineId,
                operation: 'start-data',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.markOperationCompleted(pipelineId, 'data_extraction');
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Cancel a running pipeline
     * Validates: pipeline exists, status is '*_running', not already cancelled
     */
    async cancelPipeline(pipelineId, reason = 'user_requested') {
        // TODO: Implement cancellation logic
        // 1. Validate pipeline exists
        // 2. Validate pipeline can be cancelled (is running)
        // 3. Check not already cancelled
        // 4. Use existing WorkflowCancellationManager
        // 5. Update status to cancelled
        return {
            success: false,
            error: 'Cancellation not yet implemented',
            code: 'NOT_IMPLEMENTED'
        };
    }

    /**
     * Reset a failed pipeline
     * Validates: pipeline exists, status is '*_failed'
     */
    async resetPipeline(pipelineId) {
        try {
            // 1. Validate pipeline exists
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            // 2. Validate status allows reset (only failed states)
            const resetableStatuses = ['research_failed', 'legal_resolution_failed', 'data_extraction_failed'];
            if (!resetableStatuses.includes(pipeline.status)) {
                return {
                    success: false,
                    error: `Cannot reset pipeline with status: ${pipeline.status}. Only failed pipelines can be reset.`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 3. Use existing Manager resetPipeline logic
            const result = await this.manager.resetPipeline(pipelineId);

            if (!result.success) {
                return {
                    success: false,
                    error: result.error,
                    code: 'RESET_FAILED',
                    pipeline_id: pipelineId
                };
            }

            // 4. Clear any operation tracking
            this.clearOperationTracking(pipelineId);

            // 5. Return success with updated pipeline
            return {
                success: true,
                message: result.message,
                pipeline: result.pipeline,
                pipeline_id: pipelineId,
                operation: 'reset',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR',
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Delete a pipeline
     * Validates: pipeline exists, safe to delete
     */
    async deletePipeline(pipelineId) {
        try {
            // 1. Validate pipeline exists
            const pipeline = await this.databaseManager.getPipeline(pipelineId);
            if (!pipeline) {
                return {
                    success: false,
                    error: 'Pipeline not found',
                    code: 'PIPELINE_NOT_FOUND'
                };
            }

            // 2. Check pipeline is not currently running
            const runningStatuses = ['research_running', 'legal_resolution_running', 'data_extraction_running'];
            if (runningStatuses.includes(pipeline.status)) {
                return {
                    success: false,
                    error: `Cannot delete pipeline while ${pipeline.status.replace('_', ' ')}`,
                    code: 'INVALID_STATE',
                    current_status: pipeline.status,
                    allowed_operations: this.getAllowedOperations(pipeline.status)
                };
            }

            // 3. Call database delete
            await this.databaseManager.deletePipeline(pipelineId);

            // 4. Clear any operation tracking
            this.clearOperationTracking(pipelineId);

            // 5. Return success
            return {
                success: true,
                message: 'Pipeline deleted successfully',
                pipeline_id: pipelineId,
                operation: 'delete',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: 'SYSTEM_ERROR',
                timestamp: new Date().toISOString()
            };
        }
    }

    // ============================================
    // VALIDATION HELPERS
    // ============================================

    /**
     * Check if ANY operation is in progress across all pipelines
     */
    hasAnyOperationInProgress() {
        return this.operations.size > 0;
    }

    /**
     * Check if operation is in progress for specific pipeline
     */
    isOperationInProgress(pipelineId) {
        return this.operations.has(String(pipelineId));
    }

    /**
     * Get allowed operations for current pipeline state
     */
    getAllowedOperations(currentStatus) {
        const operationRequirements = this.getOperationRequirements();
        const allowedOps = [];

        for (const [operation, requiredStatuses] of Object.entries(operationRequirements)) {
            if (Array.isArray(requiredStatuses)) {
                if (requiredStatuses.includes(currentStatus)) {
                    allowedOps.push(operation);
                }
            } else {
                if (requiredStatuses === currentStatus) {
                    allowedOps.push(operation);
                }
            }
        }

        return allowedOps;
    }

    // ============================================
    // OPERATION TRACKING
    // ============================================

    /**
     * Mark operation as started (prevent duplicates)
     */
    markOperationStarted(pipelineId, operation) {
        this.operations.set(String(pipelineId), operation);
        logger.info(`🔒 Operation started: ${operation} on pipeline ${pipelineId}`);
    }

    /**
     * Mark operation as completed
     */
    markOperationCompleted(pipelineId, operation) {
        this.operations.delete(String(pipelineId));
        logger.info(`🔓 Operation completed: ${operation} on pipeline ${pipelineId}`);
    }

    /**
     * Clear operation tracking (cleanup)
     */
    clearOperationTracking(pipelineId) {
        this.operations.delete(String(pipelineId));
        logger.info(`🧹 Cleared operation tracking for pipeline ${pipelineId}`);
    }

    // ============================================
    // STATE MACHINE DEFINITIONS
    // ============================================

    /**
     * Define valid state transitions
     */
    getValidTransitions() {
        return {
            'pending': ['research_running'],
            'research_running': ['research_complete', 'research_failed', 'research_cancelled'],
            'research_complete': ['legal_resolution_running'],
            'legal_resolution_running': ['legal_resolution_complete', 'legal_resolution_failed', 'legal_resolution_cancelled'],
            'legal_resolution_complete': ['data_extraction_running'],
            'data_extraction_running': ['data_extraction_complete', 'data_extraction_failed', 'data_extraction_cancelled'],
            // Reset transitions
            'research_failed': ['pending'],
            'research_cancelled': ['pending'],
            'legal_resolution_failed': ['research_complete'],
            'legal_resolution_cancelled': ['research_complete'],
            'data_extraction_failed': ['legal_resolution_complete'],
            'data_extraction_cancelled': ['legal_resolution_complete']
        };
    }

    /**
     * Map operations to required status
     */
    getOperationRequirements() {
        return {
            'start-research': 'pending',
            'start-legal': 'research_complete',
            'start-data': 'legal_resolution_complete',
            'cancel': ['research_running', 'legal_resolution_running', 'data_extraction_running'],
            'reset': ['research_failed', 'research_cancelled', 'legal_resolution_failed', 'legal_resolution_cancelled', 'data_extraction_failed', 'data_extraction_cancelled'],
            'delete': ['pending', 'research_complete', 'legal_resolution_complete', 'data_extraction_complete', 'research_failed', 'research_cancelled', 'legal_resolution_failed', 'legal_resolution_cancelled', 'data_extraction_failed', 'data_extraction_cancelled']
        };
    }
}

module.exports = PipelineStateManager;