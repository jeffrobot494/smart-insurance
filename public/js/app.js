// Smart Insurance - Main Application Controller

class SmartInsuranceApp {
    constructor() {
        console.log('SmartInsuranceApp: Initializing application...');
        
        // Initialize core components
        this.api = new PipelineAPI();
        this.tabs = new TabController(this);
        this.cards = new PipelineCardManager(this.api);
        this.companies = new CompanyManager(this.api);
        this.reports = new ReportManager();
        
        // Application state
        this.activePipelines = new Map(); // pipelineId -> pipeline data
        this.isInitialized = false;
        
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
            
            // Load initial data for the work tab
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
        const startBtn = Utils.findElement('#start-btn');
        const clearBtn = Utils.findElement('#clear-btn');
        const firmInput = Utils.findElement('#firm-names-input');
        const fileInput = Utils.findElement('#file-input');
        const uploadArea = Utils.findElement('#upload-area');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.handleStartPipeline());
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
        
        // Load more button (saved tab)
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

    async handleStartPipeline() {
        console.log('SmartInsuranceApp: Starting pipeline process...');
        
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
                
                // Switch to work tab if not already there
                if (this.tabs.getCurrentTab() !== 'work') {
                    this.tabs.switchTab('work');
                }
                
                // Show success message
                this.showSuccess(`Created ${result.totalCreated} pipeline(s) successfully`);
                
                // Render pipeline cards for created pipelines
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
            console.error('SmartInsuranceApp: Error starting pipeline:', error);
            this.showError('Failed to start pipeline: ' + error.message);
        }
    }

    handleClearInput() {
        console.log('SmartInsuranceApp: Clearing input');
        
        const firmInput = Utils.findElement('#firm-names-input');
        const fileInput = Utils.findElement('#file-input');
        const autoComplete = Utils.findElement('#auto-complete-checkbox');
        
        if (firmInput) firmInput.value = '';
        if (fileInput) fileInput.value = '';
        if (autoComplete) autoComplete.checked = false;
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

    // Tab handling
    handleTabSwitch(newTab, previousTab) {
        console.log(`SmartInsuranceApp: Tab switched from ${previousTab} to ${newTab}`);
        
        // Save application state when switching tabs
        this.saveApplicationState();
        
        // Tab-specific handling can be added here
        if (newTab === 'saved') {
            // Saved tab content is handled by TabController
        }
    }

    // Load more functionality (for saved tab)
    handleLoadMore() {
        console.log('SmartInsuranceApp: Loading more saved pipelines...');
        
        // Calculate next page
        const currentCount = Utils.findElements('#saved-pipeline-results .pipeline-card').length;
        const nextPage = Math.floor(currentCount / 10) + 1;
        
        // Load next page
        this.tabs.loadSavedTab(nextPage);
    }

    // Pipeline action handlers
    handleGenerateReport(pipelineId) {
        console.log(`SmartInsuranceApp: Generate report for pipeline ${pipelineId} - Implementation coming in Phase 5`);
        this.showInfo('Report generation will be available in Phase 5');
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
                this.cards.stopStatusPolling(pipelineId);
                
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

    async handleStartResearch(pipelineId) {
        console.log(`SmartInsuranceApp: Starting research for pipeline ${pipelineId}`);
        
        try {
            Utils.showLoading('Starting research...');
            
            const result = await this.api.runResearch(pipelineId);
            
            Utils.hideLoading();
            
            if (result.success) {
                this.showSuccess('Research started successfully');
                // Start polling for status updates
                this.cards.startStatusPolling(pipelineId);
            } else {
                this.showError(`Failed to start research: ${result.error}`);
            }
            
        } catch (error) {
            Utils.hideLoading();
            console.error(`SmartInsuranceApp: Error starting research for pipeline ${pipelineId}:`, error);
            this.showError(`Failed to start research: ${error.message}`);
        }
    }

    handleRetryPipeline(pipelineId) {
        console.log(`SmartInsuranceApp: Retry pipeline ${pipelineId}`);
        this.showInfo('Pipeline retry will be available in Phase 4');
    }

    async handleProceedToStep(pipelineId, step) {
        console.log(`SmartInsuranceApp: Proceeding to ${step} for pipeline ${pipelineId}`);
        
        try {
            Utils.showLoading(`Starting ${step.replace('-', ' ')}...`);
            
            let result;
            switch (step) {
                case 'legal-resolution':
                    result = await this.api.runLegalResolution(pipelineId);
                    break;
                case 'data-extraction':
                    result = await this.api.runDataExtraction(pipelineId);
                    break;
                default:
                    throw new Error(`Unknown step: ${step}`);
            }
            
            Utils.hideLoading();
            
            if (result.success) {
                this.showSuccess(`${step.replace('-', ' ')} started successfully`);
                // Start polling for status updates
                this.cards.startStatusPolling(pipelineId);
            } else {
                this.showError(`Failed to start ${step.replace('-', ' ')}: ${result.error}`);
            }
            
        } catch (error) {
            Utils.hideLoading();
            console.error(`SmartInsuranceApp: Error proceeding to ${step}:`, error);
            this.showError(`Failed to start ${step.replace('-', ' ')}: ${error.message}`);
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
                    if (this.cards.isPipelineRunning(pipeline.status)) {
                        this.cards.startStatusPolling(pipeline.pipeline_id);
                    }
                });
            }
            
        } catch (error) {
            console.error('SmartInsuranceApp: Error refreshing active pipelines:', error);
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Smart Insurance App...');
    
    // Create global app instance
    window.app = new SmartInsuranceApp();
    
    console.log('Smart Insurance App initialized and available as window.app');
});