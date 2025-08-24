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
        
        document.addEventListener('loadSavedReportsRequested', (event) => {
            this.handleLoadSavedReportsRequested(event);
        });
        
        document.addEventListener('workflowDeleteRequested', (event) => {
            this.handleWorkflowDeleteRequested(event);
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
        const { workflowExecutionId, firmName, format = 'json' } = event.detail;
        
        try {
            await this.apiClient.downloadResults(workflowExecutionId, firmName, format);
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
                const { ReportGenerationService } = await import('../services/ReportGenerationService.js');
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
                
                // Update UI table with actual workflowExecutionIds
                if (result.workflowExecutionIds && result.workflowExecutionIds.length > 0) {
                    this.uiManager.updateTableWithWorkflowIds(this.firms, result.workflowExecutionIds);
                }
                
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

    async deleteResults(workflowExecutionId) {
        console.log('WorkflowManager.deleteResults() - TODO: Implement results deletion for workflow ID:', workflowExecutionId);
    }

    async handleLoadSavedReportsRequested(event) {
        console.log('WorkflowManager.handleLoadSavedReportsRequested() - TODO: Load saved reports from API');
        await this.loadSavedResults();
    }

    async handleWorkflowDeleteRequested(event) {
        console.log('WorkflowManager.handleWorkflowDeleteRequested() - TODO: Delete report via API');
        const { reportId, firmName } = event.detail;
        
        try {
            await this.deleteResults(reportId); // reportId is actually the workflowExecutionId from the database
            
            // Fire event to notify SavedReportsManager to remove the row
            document.dispatchEvent(new CustomEvent('reportDeleted', {
                detail: { reportId, firmName }
            }));
        } catch (error) {
            console.error('Failed to delete report:', error);
        }
    }

    async loadSavedResults() {
        console.log('WorkflowManager.loadSavedResults() - Loading saved workflow results from API');
        try {
            const response = await this.apiClient.getAllResults();
            
            if (response.success) {
                console.log('Saved reports loaded successfully:', response.results);
                
                // Call UIManager to handle saved reports loaded
                this.uiManager.handleSavedReportsLoaded(response.results);
            } else {
                console.error('Failed to load saved reports:', response.error);
            }
        } catch (error) {
            console.error('Failed to load saved reports:', error);
        }
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