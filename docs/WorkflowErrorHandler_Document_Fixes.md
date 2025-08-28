● WorkflowErrorHandler Document Fixes

  Context

  The WorkflowErrorHandler design document has 8 critical inconsistencies that need to be corrected. The error handling approach evolved during design, creating mixed approaches that need alignment.

  Key Design Principle Change

  CRITICAL: Error handling and rollback are now separate processes:
  1. Error Handling: API error occurs → Server stops processes → Sets status to *_failed → Waits
  2. User Reset: Later, user clicks Reset → Server rolls back pipeline → Ready to retry

  The document incorrectly combines these processes in several places.

  8 Fixes Needed

  1. Database Schema (STARTED - Section 2)

  Current: Multiple columns for error data
  Fix: Single JSONB column with structure:
  ALTER TABLE pipelines ADD COLUMN error JSONB;
  error: {
      api: "Claude API" | "Firecrawl API" | "Perplexity API",
      type: "credits_exhausted" | "rate_limit" | "server_error" | etc,
      message: "Specific error message",
      time: "2025-01-15T10:30:00Z",
      state: "research_running" | "legal_resolution_running" | "data_extraction_running"
  }

  2. Rollback Behavior Rules (Section 3)

  Fix: Update defineRollbackBehavior() to handle both running and failed statuses:
  defineRollbackBehavior(currentStatus) {
    const rules = {
      'research_running': 'pending',
      'research_failed': 'pending',
      'legal_resolution_running': 'research_complete',
      'legal_resolution_failed': 'research_complete',
      'data_extraction_running': 'legal_resolution_complete',
      'data_extraction_failed': 'legal_resolution_complete'
    };
    return rules[currentStatus] || 'pending';
  }

  3. Add Reset Pipeline Server Endpoint

  Missing: Need new endpoint in routes/pipeline.js:
  router.post('/:id/reset', async (req, res) => {
    // Get pipeline, determine rollback status, clear error, update status
  });

  4. Fix Main Error Handling Method (Section 3)

  Current: Does rollback during error handling
  Fix: Remove rollback logic - only record error and set failed status:
  async handleWorkflowFailure(pipelineId, currentStatus, error, apiName) {
    // 1. Record error in database (set status to *_failed)
    // 2. Set cancellation flag  
    // 3. Return (NO rollback, NO client response)
  }

  5. Remove Form5500 Database Error Handling

  Fix: Remove all references to "Form5500 Database" errors from Section 4 error detection strategy.

  6. Remove Client Response Creation (Section 3)

  Current: handleWorkflowFailure() returns client response
  Fix: Remove createClientResponse() - client learns via polling, not direct response

  7. Verify PipelinePoller Section in Client Section

  Check: Ensure Section 7 (Client-Side Error Handling) includes PipelinePoller updates

  8. Update Error Details Endpoint (Section 7)

  Current: References old column namesFix: Update to use JSONB error column:
  res.json({
    success: true,
    error: pipeline.error ? JSON.parse(pipeline.error) : null
  });

  Files Affected

  - /docs/WorkflowErrorHandler_Design.md (Sections 2, 3, 4, 6, 7)
  - Server: routes/pipeline.js, utils/WorkflowErrorHandler.js
  - Client: app.js, PipelinePoller.js, ActionButtons.js

  Priority

  Critical - Document must be consistent before implementation begins.