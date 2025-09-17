// Smart Insurance - Main Application Controller

class SmartInsuranceApp {
    constructor() {
        console.log('SmartInsuranceApp: Initializing application...');
        
        // Initialize core components
        this.api = new PipelineAPI();
        this.tabs = new TabController(this);
        this.cards = new PipelineCardManager(this.api);
        this.companyManager = new CompanyManager(this.api);
        this.reports = new ReportManager();
        
        // Initialize notification manager
        window.notificationManager = new NotificationManager();
        
        // Application state
        this.activePipelines = new Map(); // pipelineId -> pipeline data
        this.isInitialized = false;
        
        // Initialize polling service with status change callback
        this.pipelinePoller = new PipelinePoller(
            this.api, 
            this.cards, 
            (pipelineId, status, pipeline) => this.handlePipelineStatusChange(pipelineId, status, pipeline)
        );
        
        // Initialize the application
        this.init();
    }

    async init() {
        console.log('SmartInsuranceApp: Starting initialization...');
        
        try {
            // Test API connection
            console.log('SmartInsuranceApp: Testing API connection...');
            const connectionTest = await this.api.testConnection();
            if (connectionTest) {
                console.log('✅ API connection successful');
            } else {
                console.warn('⚠️ API connection failed - app will work in offline mode');
            }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Mark as initialized first (before other methods that check this)
            this.isInitialized = true;
            
            // Load any saved state
            this.loadApplicationState();
            
            // Load initial data for the New Work tab
            await this.refreshActivePipelines();
            
            console.log('✅ SmartInsuranceApp: Initialization complete');
            
        } catch (error) {
            console.error('❌ SmartInsuranceApp: Initialization failed:', error);
            this.showError('Application failed to initialize: ' + error.message);
        }
    }

    setupEventListeners() {
        console.log('SmartInsuranceApp: Setting up event listeners...');
        
        // Firm input handling
        const createPipelinesBtn = Utils.findElement('#create-pipelines-btn');
        const clearBtn = Utils.findElement('#clear-btn');
        const firmInput = Utils.findElement('#firm-names-input');
        const fileInput = Utils.findElement('#file-input');
        const uploadArea = Utils.findElement('#upload-area');
        
        if (createPipelinesBtn) {
            createPipelinesBtn.addEventListener('click', () => this.handleCreatePipelines());
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.handleClearInput());
        }
        
        if (firmInput) {
            // Add Enter key support
            firmInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleStartPipeline();
                }
            });
        }
        
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        
        // Load more button (completed tab)
        const loadMoreBtn = Utils.findElement('#load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLoadMore();
            });
        }
        
        console.log('SmartInsuranceApp: Event listeners setup complete');
    }

    // Firm Input Handling
    handleFirmInput(inputValue) {
        const input = inputValue || Utils.findElement('#firm-names-input')?.value;
        
        if (!input) {
            return { valid: false, error: 'No input provided' };
        }
        
        const validation = Utils.validateFirmNames(input);
        if (!validation.valid) {
            return validation;
        }
        
        console.log('SmartInsuranceApp: Parsed firm names:', validation.firmNames);
        return validation;
    }

    async handleCreatePipelines() {
        console.log('SmartInsuranceApp: Creating pipelines...');
        
        try {
            // Get and validate firm input
            const inputResult = this.handleFirmInput();
            if (!inputResult.valid) {
                this.showError(inputResult.error);
                return;
            }
            
            const firmNames = inputResult.firmNames;
            const autoComplete = Utils.findElement('#auto-complete-checkbox')?.checked || false;
            
            console.log('SmartInsuranceApp: Creating pipelines for firms:', firmNames);
            console.log('SmartInsuranceApp: Auto-complete enabled:', autoComplete);
            
            // Show loading state
            Utils.showLoading('Creating pipelines...');
            
            // Create pipelines using API
            const result = await this.api.createMultiplePipelines(firmNames);
            
            // Hide loading state
            Utils.hideLoading();
            
            if (result.success) {
                console.log(`✅ Successfully created ${result.totalCreated} pipelines`);
                
                // Store active pipelines
                result.results.forEach(item => {
                    if (item.success && item.pipeline) {
                        this.activePipelines.set(item.pipeline.pipeline_id, item.pipeline);
                    }
                });
                
                // Clear input
                this.handleClearInput();
                
                // Switch to New Work tab if not already there
                if (this.tabs.getCurrentTab() !== 'work') {
                    this.tabs.switchTab('work');
                }
                
                
                // Render pipeline cards ONLY (no automatic workflow starting)
                result.results.forEach(item => {
                    if (item.success && item.pipeline) {
                        this.cards.createPipelineCard(item.pipeline);
                    }
                });
                
                console.log('SmartInsuranceApp: Created and rendered pipeline cards');
                
            } else {
                const errorMsg = `Failed to create some pipelines. Created: ${result.totalCreated}, Failed: ${result.totalFailed}`;
                console.error(errorMsg);
                this.showError(errorMsg);
                
                // Show details of failures
                result.errors.forEach(error => {
                    console.error(`Failed to create pipeline for ${error.firmName}: ${error.error}`);
                });
            }
            
        } catch (error) {
            Utils.hideLoading();
            console.error('SmartInsuranceApp: Error creating pipelines:', error);
            this.showError('Failed to create pipelines: ' + error.message);
        }
    }

    handleClearInput() {
        console.log('SmartInsuranceApp: Clearing input');
        
        const firmInput = Utils.findElement('#firm-names-input');
        const fileInput = Utils.findElement('#file-input');
        
        if (firmInput) firmInput.value = '';
        if (fileInput) fileInput.value = '';
        // Keep auto-complete checkbox as is (don't reset it)
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        console.log('SmartInsuranceApp: Processing file upload:', file.name);
        
        try {
            const content = await this.readFileContent(file);
            const firmNames = Utils.parseCsvContent(content);
            
            if (firmNames.length === 0) {
                this.showError('No valid firm names found in file');
                return;
            }
            
            console.log(`SmartInsuranceApp: Parsed ${firmNames.length} firm names from file`);
            
            // Update text input with parsed names
            const firmInput = Utils.findElement('#firm-names-input');
            if (firmInput) {
                firmInput.value = firmNames.join(', ');
            }
            
            this.showSuccess(`Loaded ${firmNames.length} firm names from file`);
            
        } catch (error) {
            console.error('SmartInsuranceApp: File upload error:', error);
            this.showError('Error reading file: ' + error.message);
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
    
    // Helper method to check if status requires polling
    isRunningStatus(status) {
        return ['research_running', 'legal_resolution_running', 'data_extraction_running'].includes(status);
    }

    // Tab handling
    handleTabSwitch(newTab, previousTab) {
        console.log(`SmartInsuranceApp: Tab switched from ${previousTab} to ${newTab}`);
        
        // Save application state when switching tabs
        this.saveApplicationState();
        
        // Tab-specific handling can be added here
        if (newTab === 'saved') {
            // Completed tab content is handled by TabController
        }
    }

    // Load more functionality (for completed tab)
    handleLoadMore() {
        console.log('SmartInsuranceApp: Loading more completed pipelines...');
        
        // Calculate next page
        const currentCount = Utils.findElements('#saved-pipeline-results .pipeline-card').length;
        const nextPage = Math.floor(currentCount / 10) + 1;
        
        // Load next page
        this.tabs.loadCompletedTab(nextPage);
    }

    /**
     * Handle tab switching - called by TabController
     */
    async handleTabSwitch(newTab, previousTab) {
        console.log(`SmartInsuranceApp: Tab switched from ${previousTab} to ${newTab}`);
        
        try {
            // Initialize completed tab when first accessed
            if (newTab === 'saved') {
                await this.initializeCompletedTab();
            }
            
            // Could add New Work tab initialization here if needed
            // if (newTab === 'work') {
            //     await this.initializeWorkTab();
            // }
            
        } catch (error) {
            console.error(`SmartInsuranceApp: Error handling tab switch to ${newTab}:`, error);
            this.showError(`Failed to initialize ${newTab} tab: ${error.message}`);
        }
    }

    // Pipeline action handlers
    async handleGenerateReport(pipelineId) {
        console.log(`SmartInsuranceApp: Generate report for pipeline ${pipelineId}`);
        
        try {
            // Get pipeline data from memory
            const pipeline = this.activePipelines.get(pipelineId);
            
            if (!pipeline) {
                console.error('SmartInsuranceApp: Pipeline not found in active pipelines');
                this.showError('Pipeline data not found. Please refresh the page and try again.');
                return;
            }
            
            // Validate pipeline has companies
            if (!pipeline.companies || pipeline.companies.length === 0) {
                this.showError('This pipeline has no companies to include in the report.');
                return;
            }
            
            // Check if pipeline has any data extraction results
            const hasFormData = pipeline.companies.some(company => 
                company.form5500_data && Object.keys(company.form5500_data).length > 0
            );
            
            if (!hasFormData) {
                this.showWarning('This pipeline has no Form 5500 data yet. You may want to complete data extraction first.');
                // Still allow report generation - user might want to generate report with basic company info
            }
            
            // Show report configuration modal
            await this.reports.showReportConfig(pipelineId, pipeline);
            
        } catch (error) {
            console.error(`SmartInsuranceApp: Error generating report for pipeline ${pipelineId}:`, error);
            this.showError(`Failed to generate report: ${error.message}`);
        }
    }

    handleEditPipeline(pipelineId) {
        console.log(`SmartInsuranceApp: Edit pipeline ${pipelineId} - Implementation coming in Phase 3`);
        this.showInfo('Pipeline editing will be available in Phase 3');
    }

    async handleDeletePipeline(pipelineId) {
        console.log(`SmartInsuranceApp: Delete pipeline ${pipelineId}`);
        
        try {
            // Show loading state
            Utils.showLoading('Deleting pipeline...');
            
            // Call API to delete pipeline
            const result = await this.api.deletePipeline(pipelineId);
            
            Utils.hideLoading();
            
            if (result.success) {
                // Remove from active pipelines
                this.activePipelines.delete(pipelineId);
                
                // Stop any polling for this pipeline
                this.pipelinePoller.stopPipelinePolling(pipelineId);
                
                // Remove the card from the UI
                const cardElement = Utils.findElement(`[data-pipeline-id="${pipelineId}"]`);
                if (cardElement) {
                    cardElement.remove();
                }
                
                console.log(`SmartInsuranceApp: Pipeline ${pipelineId} deleted successfully`);
                
            } else {
                this.showError(`Failed to delete pipeline: ${result.error}`);
            }
            
        } catch (error) {
            Utils.hideLoading();
            console.error(`SmartInsuranceApp: Error deleting pipeline ${pipelineId}:`, error);
            this.showError(`Failed to delete pipeline: ${error.message}`);
        }
    }

    async handleCancelPipeline(pipelineId) {
        console.log(`SmartInsuranceApp: Cancel pipeline ${pipelineId}`);

        try {
            Utils.showLoading('Cancelling pipeline...');
            const result = await this.api.cancelPipeline(pipelineId, 'user_requested');
            Utils.hideLoading();

            if (result.success) {
                window.notificationManager.showSuccess('Pipeline cancelled successfully');

                // Update local state for immediate UI response
                const pipeline = this.activePipelines.get(pipelineId);
                if (pipeline) {
                    pipeline.status = this.getCancelledStatusFromRunning(pipeline.status);
                    this.activePipelines.set(pipelineId, pipeline);
                }

            } else {
                window.notificationManager.showError(result.error || 'Failed to cancel pipeline');
            }
        } catch (error) {
            Utils.hideLoading();
            window.notificationManager.showError('Failed to cancel pipeline: ' + error.message);
        }
    }

    getCancelledStatusFromRunning(runningStatus) {
        switch (runningStatus) {
            case 'research_running': return 'research_cancelled';
            case 'legal_resolution_running': return 'legal_resolution_cancelled';
            case 'data_extraction_running': return 'data_extraction_cancelled';
            default: return 'research_cancelled';
        }
    }

    // ✅ Reset pipeline (called by ActionButtons reset button)
    async handleResetPipeline(pipelineId) {
        console.log(`SmartInsuranceApp: Reset pipeline ${pipelineId}`);
        
        try {
            Utils.showLoading('Resetting pipeline...');
            
            const result = await this.api.resetPipeline(pipelineId);
            
            if (result.success) {
                this.showSuccess('Pipeline reset successfully. You can now start the workflow again.');
                // Update the pipeline data and UI
                this.activePipelines.set(pipelineId, result.pipeline);
                this.cards.updatePipelineCard(pipelineId, result.pipeline);
            } else {
                this.showError(`Failed to reset pipeline: ${result.error || 'Unknown error'}`);
            }
            
        } catch (error) {
            console.error(`SmartInsuranceApp: Error resetting pipeline ${pipelineId}:`, error);
            this.showError(`Failed to reset pipeline: ${error.message}`);
        } finally {
            Utils.hideLoading();
        }
    }
    
    // Helper method to refresh a single pipeline
    async refreshSinglePipeline(pipelineId) {
        try {
            const result = await this.api.getPipeline(pipelineId);
            if (result.success && result.pipeline) {
                this.activePipelines.set(pipelineId, result.pipeline);
                this.cards.updatePipelineCard(pipelineId, result.pipeline);
            }
        } catch (error) {
            console.error('Failed to refresh pipeline:', error);
        }
    }


    async proceedToNextStep(pipelineId) {
        console.log(`SmartInsuranceApp: Proceeding to next step for pipeline ${pipelineId}`);
        
        try {
            // Get current pipeline status
            const pipeline = this.activePipelines.get(pipelineId);
            if (!pipeline) {
                this.showError('Pipeline not found');
                return;
            }
            
            // Start polling (always start - should be idempotent)
            this.pipelinePoller.startPipelinePolling(pipelineId);
            
            // Determine next step based on current status
            let apiCall, loadingMessage;
            
            switch (pipeline.status) {
                case 'pending':
                    apiCall = () => this.api.runResearch(pipelineId);
                    loadingMessage = 'Starting research...';
                    break;
                    
                case 'research_complete':
                    apiCall = () => this.api.runLegalResolution(pipelineId);
                    loadingMessage = 'Starting legal resolution...';
                    break;
                    
                case 'legal_resolution_complete':
                    apiCall = () => this.api.runDataExtraction(pipelineId);
                    loadingMessage = 'Starting data extraction...';
                    break;
                    
                case 'data_extraction_complete':
                    this.showWarning('Pipeline is already complete');
                    return;
                    
                default:
                    if (pipeline.status.includes('_failed')) {
                        this.showError('Cannot proceed - pipeline has failed. Please reset or delete.');
                    } else if (pipeline.status.includes('_running')) {
                        this.showWarning('Pipeline is already running');
                    } else {
                        this.showError(`Unknown pipeline status: ${pipeline.status}`);
                    }
                    return;
            }
            
            // Execute the appropriate API call
            Utils.showLoading(loadingMessage);
            const result = await apiCall();
            Utils.hideLoading();
            
            if (!result.success) {
                this.showError(`Failed to proceed: ${result.error}`);
            }
            
        } catch (error) {
            Utils.hideLoading();
            console.error(`SmartInsuranceApp: Error proceeding with pipeline ${pipelineId}:`, error);
            this.showError('Failed to proceed: ' + error.message);
        }
    }

    // State management
    saveApplicationState() {
        // Safety check - ensure components are initialized
        if (!this.tabs || !this.activePipelines) {
            console.warn('SmartInsuranceApp: Components not ready for saveApplicationState');
            return;
        }
        
        const state = {
            currentTab: this.tabs.getCurrentTab(),
            activePipelines: Array.from(this.activePipelines.entries()),
            timestamp: new Date().toISOString()
        };
        
        Utils.saveToStorage('smart-insurance-app-state', state);
    }

    loadApplicationState() {
        const state = Utils.loadFromStorage('smart-insurance-app-state');
        if (state) {
            console.log('SmartInsuranceApp: Loading saved application state');
            
            // Restore active pipelines
            if (state.activePipelines) {
                this.activePipelines = new Map(state.activePipelines);
                console.log(`SmartInsuranceApp: Restored ${this.activePipelines.size} active pipelines`);
            }
        }
    }

    // Pipeline management
    async refreshActivePipelines() {
        console.log('SmartInsuranceApp: Refreshing active pipelines');
        
        // Safety check - ensure components are initialized
        if (!this.cards || !this.api) {
            console.warn('SmartInsuranceApp: Components not ready for refreshActivePipelines');
            return;
        }
        
        try {
            // Clear current pipeline display
            const container = this.cards.getPipelineContainer();
            if (container) {
                container.innerHTML = '';
            }
            
            // Load active pipelines (not completed ones)
            const result = await this.api.getAllPipelines({
                limit: 50, // Show up to 50 active pipelines
                offset: 0
            });
            
            if (result.success && result.pipelines) {
                // Filter for active pipelines (not fully completed)
                const activePipelines = result.pipelines.filter(pipeline => 
                    pipeline.status !== 'data_extraction_complete'
                );
                
                console.log(`SmartInsuranceApp: Found ${activePipelines.length} active pipelines`);
                
                // Update active pipelines map
                this.activePipelines.clear();
                activePipelines.forEach(pipeline => {
                    this.activePipelines.set(pipeline.pipeline_id, pipeline);
                    this.cards.createPipelineCard(pipeline);
                });
                
                // Start status polling for running pipelines
                activePipelines.forEach(pipeline => {
                    if (this.isRunningStatus(pipeline.status)) {
                        this.pipelinePoller.startPipelinePolling(pipeline.pipeline_id);
                    }
                });
            }
            
        } catch (error) {
            console.error('SmartInsuranceApp: Error refreshing active pipelines:', error);
        }
    }

    /**
     * Initialize completed tab by loading completed pipelines and adding to activePipelines
     * This ensures completed pipelines are available for report generation
     */
    async initializeCompletedTab() {
        console.log('SmartInsuranceApp: Initializing completed tab...');
        
        try {
            // Load completed pipelines from API
            const result = await this.api.getAllPipelines({
                status: 'data_extraction_complete', // Only get completed pipelines for completed tab
                limit: 50 // Load more since these are for viewing/reports
            });
            
            if (result.success && result.pipelines) {
                console.log(`SmartInsuranceApp: Found ${result.pipelines.length} completed pipelines`);
                
                // Add completed pipelines to activePipelines for report generation
                result.pipelines.forEach(pipeline => {
                    this.activePipelines.set(pipeline.pipeline_id, pipeline);
                    console.log(`SmartInsuranceApp: Added completed pipeline ${pipeline.pipeline_id} (${pipeline.firm_name}) to activePipelines`);
                });
                
                console.log(`SmartInsuranceApp: Completed tab initialized with ${result.pipelines.length} pipelines available for reports`);
                
            } else {
                console.warn('SmartInsuranceApp: No completed pipelines found or API error');
            }
            
        } catch (error) {
            console.error('SmartInsuranceApp: Error initializing completed tab:', error);
            this.showError(`Failed to load completed pipelines: ${error.message}`);
        }
    }

    // Utility methods
    showError(message) {
        console.error('App Error:', message);
        // TODO: Implement proper user notification system
        alert('Error: ' + message);
    }

    showSuccess(message) {
        console.log('App Success:', message);
        // TODO: Implement proper user notification system  
        alert('Success: ' + message);
    }

    showWarning(message) {
        console.warn('App Warning:', message);
        // TODO: Implement proper user notification system
        alert('Warning: ' + message);
    }

    showInfo(message) {
        console.log('App Info:', message);
        // TODO: Implement proper user notification system
        alert('Info: ' + message);
    }

    // Getters for testing
    getActivePipelines() {
        return this.activePipelines;
    }

    isReady() {
        return this.isInitialized;
    }
    
    /**
     * Handle pipeline status changes and auto-complete logic
     * @param {number} pipelineId - Pipeline ID
     * @param {string} status - New status
     * @param {object} pipeline - Pipeline data
     */
    handlePipelineStatusChange(pipelineId, status, pipeline) {
        console.log(`Pipeline ${pipelineId} status changed to: ${status}`);
        
        // Update local pipeline data
        this.activePipelines.set(pipelineId, pipeline);
        
        // ✅ Orchestrator handles UI updates (not PipelinePoller)
        this.cards.updatePipelineCard(pipelineId, pipeline);
        
        // ✅ Handle cancelled statuses - silent update only
        if (status.endsWith('_cancelled')) {
            // Silent update - user already got notification from cancel action
            return;
        }

        // ✅ Handle failed statuses with error responsibilities
        if (status.endsWith('_failed')) {
            this.handlePipelineError(pipelineId, status, pipeline);
            return; // Don't continue with auto-complete logic for failed pipelines
        }
        
        // Auto-complete logic for successful statuses
        if (this.isAutoCompleteEnabled()) {
            if (status === 'research_complete') {
                console.log('Auto-complete: Starting legal resolution');
                this.proceedToNextStep(pipelineId);
            }
            else if (status === 'legal_resolution_complete') {
                console.log('Auto-complete: Starting data extraction');
                this.proceedToNextStep(pipelineId);
            }
            else if (status === 'data_extraction_complete') {
                console.log('Auto-complete: Pipeline completed, starting next');
                this.startNextPendingPipeline();
            }
        }
    }

    /**
     * Check if auto-complete is currently enabled
     */
    isAutoCompleteEnabled() {
        return Utils.findElement('#auto-complete-checkbox')?.checked || false;
    }

    /**
     * Start next incomplete pipeline for auto-complete sequential processing
     */
    startNextPendingPipeline() {
        // Find first pipeline that isn't fully completed
        for (const [pipelineId, pipeline] of this.activePipelines.entries()) {
            if (pipeline.status !== 'data_extraction_complete') {
                console.log(`Starting next incomplete pipeline: ${pipeline.firm_name} (status: ${pipeline.status})`);
                
                // Use proceedToNextStep for consistent workflow starting
                this.proceedToNextStep(pipelineId);
                return; // Only start one
            }
        }
        console.log('All pipelines completed');
    }

    // Handle pipeline error notifications
    async handlePipelineError(pipelineId, failureStatus, pipeline) {
        console.log(`Handling pipeline error for ${pipelineId}: ${failureStatus}`);
        
        try {
            // Fetch detailed error information from server
            const errorDetails = await this.fetchPipelineErrorDetails(pipelineId);
            
            // Show persistent notification with detailed error information
            if (window.notificationManager) {
                window.notificationManager.showPipelineError(pipelineId, failureStatus, pipeline, errorDetails);
            }
            
        } catch (error) {
            console.error('Error handling pipeline failure:', error);
            // Fallback notification
            if (window.notificationManager) {
                window.notificationManager.showError('Pipeline Error', `${this.getWorkflowName(failureStatus)} failed. Please check the pipeline and try again.`);
            }
        }
    }

    // Fetch detailed error info
    async fetchPipelineErrorDetails(pipelineId) {
        try {
            const result = await this.api.getPipelineError(pipelineId);
            return result.success ? result.error : null;
        } catch (error) {
            console.error('Failed to fetch pipeline error details:', error);
            return null; // Graceful degradation
        }
    }

    // ✅ Helper method
    getWorkflowName(failureStatus) {
        const workflowMap = {
            'research_failed': 'Research',
            'legal_resolution_failed': 'Legal Resolution'
            // data_extraction_failed not included - programming errors don't use client error handling
        };
        return workflowMap[failureStatus] || 'Workflow';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Smart Insurance App...');
    
    // Create global app instance
    window.app = new SmartInsuranceApp();
    
    console.log('Smart Insurance App initialized and available as window.app');
});