/**
 * WorkflowAPIError - Standardized error class for API failures during workflow execution
 * Used to distinguish API errors (which trigger WorkflowErrorHandler) from programming errors
 */
class WorkflowAPIError extends Error {
  constructor({ apiName, originalError, statusCode, errorType }) {
    // Handle both string errors and Error objects
    const errorMessage = typeof originalError === 'string' 
      ? originalError 
      : originalError?.message || 'Unknown error';
    
    super(errorMessage);
    this.name = 'WorkflowAPIError';
    this.apiName = apiName;
    this.originalError = originalError;
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.isWorkflowError = true; // Flag for easy detection in Manager.js
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowAPIError);
    }
  }
}

module.exports = WorkflowAPIError;