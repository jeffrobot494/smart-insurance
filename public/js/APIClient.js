class APIClient {
    constructor() {
        this.baseURL = '';
        this.workflowExecutionIds = [];
        this.currentPollingIndex = 0;
        this.isPolling = false;
        this.pollingInterval = null;
    }

    async startWorkflow(firms) {
        console.log('APIClient.startWorkflow() - Starting workflow for firms:', firms);
        
        try {
            const response = await fetch(`${this.baseURL}/api/workflow`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowname: 'pe_firm_research',
                    input: firms
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                console.log('Workflow started successfully:', result);
                
                // Store workflowExecutionIds for polling
                this.workflowExecutionIds = result.workflowExecutionIds || [];
                this.currentPollingIndex = 0;
                
                return { success: true, ...result };
            } else {
                console.error('Workflow start failed:', result);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('Network error starting workflow:', error);
            return { success: false, error: error.message };
        }
    }

    startSequentialPolling() {
        console.log('APIClient.startSequentialPolling() - Starting sequential polling for workflow IDs:', this.workflowExecutionIds);
        
        if (this.workflowExecutionIds.length === 0) {
            console.log('No workflow execution IDs to poll');
            return;
        }
        
        if (this.isPolling) {
            console.log('Polling already in progress');
            return;
        }
        
        this.isPolling = true;
        this.currentPollingIndex = 0;
        this.startPollingCurrentWorkflow();
    }
    
    startPollingCurrentWorkflow() {
        if (this.currentPollingIndex >= this.workflowExecutionIds.length) {
            console.log('All workflows completed');
            this.stopPolling();
            document.dispatchEvent(new CustomEvent('allWorkflowsComplete'));
            return;
        }
        
        const currentWorkflowId = this.workflowExecutionIds[this.currentPollingIndex];
        console.log(`Starting to poll workflow ${this.currentPollingIndex + 1}/${this.workflowExecutionIds.length}, ID: ${currentWorkflowId}`);
        
        // Poll every 2 seconds
        this.pollingInterval = setInterval(() => {
            this.pollSingleWorkflow(currentWorkflowId);
        }, 2000);
        
        // Poll immediately first time
        this.pollSingleWorkflow(currentWorkflowId);
    }
    
    async pollSingleWorkflow(workflowExecutionId) {
        try {
            console.log(`Polling workflow ID: ${workflowExecutionId}`);
            
            const response = await fetch(`${this.baseURL}/api/polling/${workflowExecutionId}`);
            const result = await response.json();
            
            if (response.ok && result.messages) {
                // Log all messages for debugging
                const allMessages = result.messages.map(msg => `[${msg.type}] ${msg.message}`);
                console.log(`Workflow ${workflowExecutionId} all messages:`, allMessages);
                
                // Check for completion message
                const completionMessage = result.messages.find(msg => 
                    msg.message && msg.message.includes('✅ Data extraction completed')
                );
                
                if (completionMessage) {
                    console.log(`Workflow ${workflowExecutionId} completed!`);
                    
                    // Fire completion event for this workflow
                    document.dispatchEvent(new CustomEvent('workflowComplete', {
                        detail: { 
                            workflowExecutionId,
                            firmIndex: this.currentPollingIndex,
                            messages: result.messages
                        }
                    }));
                    
                    // Move to next workflow
                    this.moveToNextWorkflow();
                } else {
                    // Fire progress event with latest messages
                    document.dispatchEvent(new CustomEvent('workflowProgress', {
                        detail: { 
                            workflowExecutionId,
                            firmIndex: this.currentPollingIndex,
                            messages: result.messages
                        }
                    }));
                }
            } else {
                console.error('Polling error:', result);
            }
        } catch (error) {
            console.error('Network error during polling:', error);
        }
    }
    
    moveToNextWorkflow() {
        // Stop current polling
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        
        // Move to next workflow
        this.currentPollingIndex++;
        
        // Start polling next workflow after a brief delay
        setTimeout(() => {
            this.startPollingCurrentWorkflow();
        }, 1000);
    }
    
    stopPolling() {
        console.log('APIClient.stopPolling() - Stopping all polling');
        
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        
        this.isPolling = false;
    }

    async getResults(firmId) {
        console.log('APIClient.getResults() - TODO: Implement results fetching');
        return { success: true, data: {} };
    }

    async downloadResults(firmId, firmName) {
        console.log(`APIClient.downloadResults() - Downloading results for firm ${firmName} (ID: ${firmId})`);
        
        try {
            // Map firmId to workflowExecutionId
            if (firmId >= this.workflowExecutionIds.length) {
                throw new Error(`Invalid firm ID: ${firmId}`);
            }
            
            const workflowExecutionId = this.workflowExecutionIds[firmId];
            console.log(`Fetching results for workflow execution ID: ${workflowExecutionId}`);
            
            const response = await fetch(`${this.baseURL}/api/workflow/${workflowExecutionId}/results`);
            
            if (response.ok) {
                const results = await response.json();
                console.log('Results fetched successfully:', results);
                
                // Format and download the JSON
                this.downloadJsonFile(results, `${firmName}_research_results.json`);
            } else {
                const error = await response.json();
                console.error('Failed to fetch results:', error);
                throw new Error(error.error || 'Failed to fetch results');
            }
        } catch (error) {
            console.error('Network error downloading results:', error);
            throw error;
        }
    }
    
    downloadJsonFile(data, filename) {
        // Create formatted JSON string
        const jsonString = JSON.stringify(data, null, 2);
        
        // Create blob and download link
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create temporary download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        
        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // Cleanup
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        console.log(`Downloaded: ${filename}`);
    }

    async deleteResults(firmId) {
        console.log('APIClient.deleteResults() - TODO: Implement results deletion');
        return { success: true };
    }

    async getAllResults() {
        console.log('APIClient.getAllResults() - TODO: Implement all results fetching');
        return { success: true, results: [] };
    }
}