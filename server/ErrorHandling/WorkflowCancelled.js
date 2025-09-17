/**
 * WorkflowCancelled - Error thrown when a workflow is cancelled
 * Should not be retried - indicates permanent cancellation
 */
class WorkflowCancelled extends Error {
  constructor(pipelineId, reason = 'unknown') {
    super(`Workflow cancelled for pipeline ${pipelineId}: ${reason}`);
    this.name = 'WorkflowCancelled';
    this.pipelineId = pipelineId;
    this.reason = reason;
    this.isWorkflowCancelled = true; // Flag for detection
  }
}

module.exports = WorkflowCancelled;