class PollingService {
    constructor() {
        // Store message queues per workflow ID
        this.messageQueues = new Map();
    }

    /**
     * Add a message to the queue for a specific workflow
     * @param {string|number} workflowId - The workflow execution ID
     * @param {string|number} firmId - The firm ID (optional)
     * @param {string} type - Message type (e.g., 'progress', 'error', 'complete')
     * @param {string} message - The message content
     */
    addMessage(workflowId, firmId, type, message) {
        const workflowKey = String(workflowId);
        
        // Initialize queue if it doesn't exist
        if (!this.messageQueues.has(workflowKey)) {
            this.messageQueues.set(workflowKey, []);
        }
        
        const messageObj = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            firmId: firmId || null,
            type: type,
            message: message
        };
        
        this.messageQueues.get(workflowKey).push(messageObj);
        console.log(`📨 [POLLING] Added message for workflow ${workflowId}:`, messageObj);
    }

    /**
     * Get all messages for a workflow and clear the queue
     * @param {string|number} workflowId - The workflow execution ID
     * @returns {Array} Array of messages
     */
    getAndClearMessages(workflowId) {
        const workflowKey = String(workflowId);
        
        if (!this.messageQueues.has(workflowKey)) {
            return [];
        }
        
        const messages = this.messageQueues.get(workflowKey);
        this.messageQueues.set(workflowKey, []); // Clear the queue
        
        console.log(`📬 [POLLING] Retrieved ${messages.length} messages for workflow ${workflowId}`);
        return messages;
    }

    /**
     * Get messages without clearing (for debugging)
     * @param {string|number} workflowId - The workflow execution ID
     * @returns {Array} Array of messages
     */
    peekMessages(workflowId) {
        const workflowKey = String(workflowId);
        return this.messageQueues.get(workflowKey) || [];
    }

    /**
     * Clear all messages for a specific workflow
     * @param {string|number} workflowId - The workflow execution ID
     */
    clearWorkflow(workflowId) {
        const workflowKey = String(workflowId);
        this.messageQueues.delete(workflowKey);
        console.log(`🗑️ [POLLING] Cleared all messages for workflow ${workflowId}`);
    }

    /**
     * Get all active workflow IDs that have messages
     * @returns {Array} Array of workflow IDs
     */
    getActiveWorkflows() {
        return Array.from(this.messageQueues.keys());
    }

    /**
     * Generate a unique message ID
     * @returns {string} Unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Clean up old workflows (optional - for memory management)
     * @param {number} maxAgeHours - Maximum age in hours before cleanup
     */
    cleanup(maxAgeHours = 24) {
        const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
        
        for (const [workflowId, messages] of this.messageQueues.entries()) {
            if (messages.length === 0) continue;
            
            const oldestMessage = messages[0];
            if (new Date(oldestMessage.timestamp) < cutoffTime) {
                this.messageQueues.delete(workflowId);
                console.log(`🧹 [POLLING] Cleaned up old workflow ${workflowId}`);
            }
        }
    }
}

// Create singleton instance
const pollingService = new PollingService();

module.exports = pollingService;