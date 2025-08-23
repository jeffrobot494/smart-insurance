// Smart Insurance - Tab Controller

class TabController {
    constructor(app) {
        this.app = app;
        this.currentTab = 'work';
        this.tabs = {
            work: {
                tabElement: Utils.findElement('#work-tab'),
                contentElement: Utils.findElement('#work-tab-content')
            },
            saved: {
                tabElement: Utils.findElement('#saved-tab'),
                contentElement: Utils.findElement('#saved-tab-content')
            }
        };
        
        this.init();
    }

    init() {
        console.log('TabController: Initializing tab controller');
        this.setupEventListeners();
        this.loadTabState();
        
        // Set work tab as active (but don't load content during init)
        this.currentTab = 'work';
        this.updateTabButtons();
        this.updateContentVisibility();
    }

    setupEventListeners() {
        // Add click listeners to tab buttons
        Object.keys(this.tabs).forEach(tabName => {
            const tabElement = this.tabs[tabName].tabElement;
            if (tabElement) {
                tabElement.addEventListener('click', () => {
                    this.switchTab(tabName);
                });
            }
        });

        console.log('TabController: Event listeners setup complete');
    }

    switchTab(tabName) {
        console.log(`TabController: Switching to ${tabName} tab`);
        
        if (!this.tabs[tabName]) {
            console.error(`TabController: Invalid tab name: ${tabName}`);
            return false;
        }

        // Update current tab
        const previousTab = this.currentTab;
        this.currentTab = tabName;

        // Update tab button states
        this.updateTabButtons();
        
        // Update content visibility
        this.updateContentVisibility();
        
        // Load tab content if needed
        this.loadTabContent(tabName);
        
        // Save tab state
        this.saveTabState();
        
        // Notify app of tab change
        if (this.app && typeof this.app.handleTabSwitch === 'function') {
            this.app.handleTabSwitch(tabName, previousTab);
        }

        return true;
    }

    updateTabButtons() {
        Object.keys(this.tabs).forEach(tabName => {
            const tabElement = this.tabs[tabName].tabElement;
            if (tabElement) {
                if (tabName === this.currentTab) {
                    tabElement.classList.add('active');
                } else {
                    tabElement.classList.remove('active');
                }
            }
        });
    }

    updateContentVisibility() {
        Object.keys(this.tabs).forEach(tabName => {
            const contentElement = this.tabs[tabName].contentElement;
            if (contentElement) {
                if (tabName === this.currentTab) {
                    contentElement.classList.add('active');
                } else {
                    contentElement.classList.remove('active');
                }
            }
        });
    }

    loadTabContent(tabName) {
        console.log(`TabController: Loading content for ${tabName} tab`);
        
        switch (tabName) {
            case 'work':
                this.loadWorkTab();
                break;
            case 'saved':
                this.loadSavedTab();
                break;
            default:
                console.warn(`TabController: No content loader for tab: ${tabName}`);
        }
    }

    loadWorkTab() {
        console.log('TabController: Loading work tab content');
        
        // Work tab content is static in HTML, just ensure it's ready
        const inputSection = Utils.findElement('.input-section');
        const pipelineResults = Utils.findElement('#pipeline-results');
        
        if (!inputSection || !pipelineResults) {
            console.error('TabController: Work tab elements not found');
            return;
        }

        // Only refresh active pipelines if app is fully initialized
        if (this.app && this.app.isInitialized && typeof this.app.refreshActivePipelines === 'function') {
            console.log('TabController: Refreshing active pipelines in work tab');
            this.app.refreshActivePipelines();
        }
    }

    async loadSavedTab(page = 1, limit = 10) {
        console.log(`TabController: Loading saved tab content (page ${page}, limit ${limit})`);
        
        if (!this.app || !this.app.api) {
            console.error('TabController: App or API not available');
            return;
        }

        try {
            // Show loading state
            const savedResults = Utils.findElement('#saved-pipeline-results');
            if (savedResults) {
                savedResults.innerHTML = '<div class="loading-message">Loading saved pipelines...</div>';
            }

            // Calculate offset for pagination
            const offset = (page - 1) * limit;
            
            // Load saved pipelines from API
            const response = await this.app.api.getAllPipelines({
                limit,
                offset,
                status: 'data_extraction_complete' // Only show completed pipelines in saved tab
            });

            if (response.success && response.pipelines) {
                console.log(`TabController: Loaded ${response.pipelines.length} saved pipelines`);
                
                // Render saved pipelines
                this.renderSavedPipelines(response.pipelines, response.total, response.has_more);
                
                // Update load more button
                this.updateLoadMoreButton(response.has_more, response.pipelines.length);
            } else {
                console.error('TabController: Failed to load saved pipelines');
                this.showSavedTabError('Failed to load saved pipelines');
            }
        } catch (error) {
            console.error('TabController: Error loading saved tab:', error);
            this.showSavedTabError(`Error loading saved pipelines: ${error.message}`);
        }
    }

    renderSavedPipelines(pipelines, total = 0, hasMore = false) {
        const savedResults = Utils.findElement('#saved-pipeline-results');
        if (!savedResults) {
            console.error('TabController: Saved results container not found');
            return;
        }

        if (pipelines.length === 0) {
            savedResults.innerHTML = `
                <div class="empty-state">
                    <p>No saved pipelines found.</p>
                    <p>Complete some pipelines in the Work tab to see them here.</p>
                </div>
            `;
            return;
        }

        // Use the app's pipeline cards manager to render saved pipelines
        if (this.app && this.app.cards && typeof this.app.cards.renderSavedPipelines === 'function') {
            this.app.cards.renderSavedPipelines(pipelines, savedResults);
        } else {
            // Fallback rendering
            savedResults.innerHTML = pipelines.map(pipeline => 
                this.createSavedPipelineCardHTML(pipeline)
            ).join('');
        }

        console.log(`TabController: Rendered ${pipelines.length} saved pipeline cards`);
    }

    createSavedPipelineCardHTML(pipeline) {
        const statusDisplay = Utils.getStatusDisplay(pipeline.status);
        const formattedDate = Utils.formatDate(pipeline.updated_at || pipeline.created_at);
        
        return `
            <div class="pipeline-card" data-pipeline-id="${pipeline.pipeline_id}">
                <div class="pipeline-header">
                    <div>
                        <div class="pipeline-title">${pipeline.firm_name}</div>
                        <div class="pipeline-date">Completed: ${formattedDate}</div>
                    </div>
                    <div class="status-badge ${statusDisplay.class}">${statusDisplay.text}</div>
                </div>
                <div class="pipeline-content">
                    <div class="stats-row">
                        <div class="stat">Portfolio companies: <span class="stat-value">${pipeline.companies ? pipeline.companies.length : 0}</span></div>
                        <div class="stat">With 5500 data: <span class="stat-value">-</span></div>
                        <div class="stat">Total charges: <span class="stat-value">-</span></div>
                    </div>
                    <div class="button-row">
                        <button class="btn btn-success" onclick="app.handleGenerateReport(${pipeline.pipeline_id})">Generate Report</button>
                        <button class="btn btn-secondary" onclick="app.handleEditPipeline(${pipeline.pipeline_id})">Edit</button>
                        <button class="btn btn-secondary" onclick="app.handleDeletePipeline(${pipeline.pipeline_id})">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }

    updateLoadMoreButton(hasMore, currentCount) {
        const loadMoreSection = Utils.findElement('#load-more');
        const shownCountElement = Utils.findElement('#shown-count');
        
        if (loadMoreSection && shownCountElement) {
            shownCountElement.textContent = currentCount;
            
            if (hasMore) {
                loadMoreSection.style.display = 'block';
            } else {
                loadMoreSection.style.display = 'none';
            }
        }
    }

    showSavedTabError(message) {
        const savedResults = Utils.findElement('#saved-pipeline-results');
        if (savedResults) {
            savedResults.innerHTML = `
                <div class="error-state">
                    <p style="color: #dc3545;">${message}</p>
                    <button class="btn btn-primary" onclick="app.tabs.loadSavedTab()">Retry</button>
                </div>
            `;
        }
    }

    getCurrentTab() {
        return this.currentTab;
    }

    refreshCurrentTab() {
        console.log('TabController: Refreshing current tab');
        this.loadTabContent(this.currentTab);
    }

    // State persistence
    saveTabState() {
        Utils.saveToStorage('smart-insurance-current-tab', this.currentTab);
    }

    loadTabState() {
        const savedTab = Utils.loadFromStorage('smart-insurance-current-tab');
        if (savedTab && this.tabs[savedTab]) {
            this.currentTab = savedTab;
            this.updateTabButtons();
            this.updateContentVisibility();
        }
    }

    // Utility methods
    isTabActive(tabName) {
        return this.currentTab === tabName;
    }

    getTabElement(tabName) {
        return this.tabs[tabName] ? this.tabs[tabName].tabElement : null;
    }

    getContentElement(tabName) {
        return this.tabs[tabName] ? this.tabs[tabName].contentElement : null;
    }
}

// Make TabController available globally
window.TabController = TabController;