class WorkflowManager {
    constructor(apiClient, uiManager) {
        this.apiClient = apiClient;
        this.uiManager = uiManager;
        this.firms = [];
        this.isProcessing = false;
        this.pollingInterval = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('workflowStartRequested', (event) => {
            this.handleWorkflowStartRequested(event);
        });
        
        document.addEventListener('workflowProgress', (event) => {
            this.handleWorkflowProgress(event);
        });
        
        document.addEventListener('workflowComplete', (event) => {
            this.handleWorkflowComplete(event);
        });
        
        document.addEventListener('downloadRequested', (event) => {
            this.handleDownloadRequested(event);
        });
        
        document.addEventListener('gotJSONResults', (event) => {
            this.handleGotJSONResults(event);
        });
    }

    handleWorkflowStartRequested(event) {
        console.log('WorkflowManager received workflow start request:', event.detail);
        const { firmNames } = event.detail;
        this.firms = firmNames;
        this.startProcessing();
    }
    
    handleWorkflowProgress(event) {
        console.log('WorkflowManager received workflow progress:', event.detail);
        this.uiManager.handleWorkflowProgress(event.detail);
    }
    
    handleWorkflowComplete(event) {
        console.log('WorkflowManager received workflow complete:', event.detail);
        this.uiManager.handleWorkflowComplete(event.detail);
    }
    
    async handleDownloadRequested(event) {
        console.log('WorkflowManager received download request:', event.detail);
        const { firmId, firmName, format = 'json' } = event.detail;
        
        try {
            await this.apiClient.downloadResults(firmId, firmName, format);
        } catch (error) {
            console.error('Download failed:', error);
        }
    }
    
    async handleGotJSONResults(event) {
        console.log('WorkflowManager received JSON results:', event.detail);
        const { firmData, firmName, format } = event.detail;
        
        try {
            if (format === 'pdf') {
                // Import and use ReportGenerationService
                const { ReportGenerationService } = await import('./services/ReportGenerationService.js');
                await ReportGenerationService.generatePDFReport(firmData, firmName);
            }
            // Could handle other formats here in the future
        } catch (error) {
            console.error('Report generation failed:', error);
        }
    }

    async handleFileUpload(event) {
        console.log('WorkflowManager.handleFileUpload() - TODO: Coordinate file upload processing');
        return [];
    }

    async startProcessing() {
        console.log('WorkflowManager.startProcessing() - Starting workflow for firms:', this.firms);
        
        if (this.isProcessing) {
            console.log('Workflow is already processing, ignoring request');
            return;
        }
        
        if (!this.firms || this.firms.length === 0) {
            console.error('No firms to process');
            return;
        }
        
        this.isProcessing = true;
        
        try {
            const result = await this.apiClient.startWorkflow(this.firms);
            
            if (result.success) {
                console.log('Workflow started successfully:', result);
                
                // Start sequential polling now that we have workflowExecutionIds
                this.apiClient.startSequentialPolling();
            } else {
                console.error('Failed to start workflow:', result.error);
            }
        } catch (error) {
            console.error('Error starting workflow:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async startPolling() {
        console.log('WorkflowManager.startPolling() - TODO: Implement progress polling loop');
    }

    stopPolling() {
        console.log('WorkflowManager.stopPolling() - TODO: Implement polling cleanup');
    }

    async handlePollingResponse(response) {
        console.log('WorkflowManager.handlePollingResponse() - TODO: Process polling response');
    }

    async downloadResults(firmId) {
        console.log('WorkflowManager.downloadResults() - TODO: Implement results download');
    }

    async deleteResults(firmId) {
        console.log('WorkflowManager.deleteResults() - TODO: Implement results deletion');
    }

    async loadSavedResults() {
        console.log('WorkflowManager.loadSavedResults() - TODO: Load and display saved results');
    }

    parseCsvFile(content) {
        console.log('WorkflowManager.parseCsvFile() - TODO: Implement CSV parsing logic');
        return [];
    }

    createFirmObjects(firmNames) {
        console.log('WorkflowManager.createFirmObjects() - TODO: Create firm data objects');
        return [];
    }

    reset() {
        console.log('WorkflowManager.reset() - TODO: Reset workflow state');
    }
}