// Smart Insurance - Pipeline Card Component

class PipelineCard extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = { ...pipeline }; // Clean data model
        this.isExpanded = false; // Component manages own expansion state
        this.hasUnsavedChanges = false; // Change tracking
        this.autoSaveTimer = null; // Debounced save timer
        this.autoSaveDelay = 2000; // 2 seconds
        
        // Create action buttons first
        this.actionButtons = new ActionButtons(pipeline);
        
        // Create child components
        this.header = new PipelineHeader(pipeline, {
            isExpanded: this.isExpanded,
            onToggle: () => this.toggle(),
            onRefreshStatus: (pipelineId) => this.handleRefreshStatus(pipelineId),
            actionButtons: this.actionButtons
        });
        
        this.stats = new PipelineStats(pipeline);
        
        this.companyList = new CompanyList(pipeline, {
            onToggleExited: (index) => this.handleCompanyToggleExited(index),
            onRemoveCompany: (index) => this.handleCompanyRemove(index),
            onAddCompany: (companyData) => this.handleAddCompany(companyData),
            onFieldChange: (index, field, value) => this.handleCompanyFieldChange(index, field, value),
            onShowAddForm: () => this.showAddCompanyForm()
        });
        
        this.progressInfo = new ProgressInfo(pipeline);
        
        // Create add company form if needed  
        if (pipeline.status === 'research_complete' || pipeline.status === 'legal_resolution_complete') {
            this.addCompanyForm = new AddCompanyForm(pipeline.pipeline_id, {
                onAdd: (companyData) => this.handleAddCompany(companyData)
            });
        }
    }
    
    render() {
        this.element = this.createElement('div', 'pipeline-card', {
            'data-pipeline-id': this.pipeline.pipeline_id
        });
        
        // Render header
        const headerElement = this.header.render();
        this.element.appendChild(headerElement);
        
        // Create content container
        const contentElement = this.createElement('div', 'pipeline-content');
        
        // Add stats
        const statsElement = this.stats.render();
        contentElement.appendChild(statsElement);
        
        // Always add company list so it can be updated when companies are added
        const companyListElement = this.companyList.render();
        contentElement.appendChild(companyListElement);
        
        // Add progress info for running pipelines
        const progressElement = this.progressInfo.render();
        contentElement.appendChild(progressElement);
        
        // Add company form if it exists
        if (this.addCompanyForm) {
            const formElement = this.addCompanyForm.render();
            contentElement.appendChild(formElement);
        }
        
        this.element.appendChild(contentElement);
        
        // Set initial collapsed state (cards start collapsed)
        this.updateVisibility();
        
        this.isRendered = true;
        return this.element;
    }
    
    toggle() {
        this.isExpanded = !this.isExpanded;
        this.updateVisibility();
        this.header.updateExpandIcon(this.isExpanded);
    }
    
    updateVisibility() {
        const contentElement = this.element?.querySelector('.pipeline-content');
        if (contentElement) {
            contentElement.style.display = this.isExpanded ? 'block' : 'none';
        }
    }
    
    // Company management methods
    handleCompanyToggleExited(index) {
        console.log('PipelineCard: Toggle company exited:', { pipelineId: this.pipeline.pipeline_id, index });
        // This will be fully implemented in Phase 3
        this.hasUnsavedChanges = true;
    }
    
    async handleCompanyRemove(index) {
        console.log('🔴 PipelineCard.handleCompanyRemove called:', { pipelineId: this.pipeline.pipeline_id, index });
        
        try {
            // Remove from local data
            if (this.pipeline.companies && index >= 0 && index < this.pipeline.companies.length) {
                console.log('🔴 Removing company at index:', index, this.pipeline.companies[index].name);
                this.pipeline.companies.splice(index, 1);
                this.hasUnsavedChanges = true;
                
                // Save to API immediately
                await this.saveChangesToAPI();
                
                // Refresh child components
                this.refreshChildComponents();
                
                console.log('PipelineCard: Company removed successfully');
            }
        } catch (error) {
            console.error('PipelineCard: Failed to remove company:', error);
            throw error;
        }
    }
    
    async handleCompanyFieldChange(index, field, value) {
        console.log('PipelineCard: Field change:', { pipelineId: this.pipeline.pipeline_id, index, field, value });
        
        // Update data model immediately for UI responsiveness
        if (this.pipeline.companies[index]) {
            this.pipeline.companies[index][field] = value;
        }
        this.hasUnsavedChanges = true;
        
        // Schedule auto-save with debouncing
        this.scheduleAutoSave();
    }
    
    scheduleAutoSave() {
        // Clear existing timer
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        // Set new timer
        this.autoSaveTimer = setTimeout(() => {
            this.saveChangesToAPI();
        }, this.autoSaveDelay);
    }
    
    async saveChangesToAPI() {
        if (!this.hasUnsavedChanges) return;
        
        try {
            console.log('PipelineCard: Auto-saving changes for pipeline:', this.pipeline.pipeline_id);
            
            // Trigger callback to PipelineCardManager
            await this.triggerCallback('onSave', this.pipeline);
            
            this.hasUnsavedChanges = false;
            console.log('PipelineCard: Auto-save successful');
            
        } catch (error) {
            console.error('PipelineCard: Auto-save failed:', error);
            // Could show a subtle notification here, but not blocking
        }
    }
    
    showAddCompanyForm() {
        if (this.addCompanyForm) {
            this.addCompanyForm.show();
        }
    }
    
    async handleAddCompany(companyData) {
        console.log('PipelineCard: Add company:', { pipelineId: this.pipeline.pipeline_id, companyData });
        
        try {
            // Initialize companies array if needed
            if (!this.pipeline.companies) {
                this.pipeline.companies = [];
            }
            
            // Add to local data
            this.pipeline.companies.push(companyData);
            this.hasUnsavedChanges = true;
            
            // Save to API immediately
            await this.saveChangesToAPI();
            
            // Refresh child components to show new company
            this.refreshChildComponents();
            
            // Hide add form if it exists
            if (this.addCompanyForm) {
                this.addCompanyForm.hide();
            }
            
            console.log('PipelineCard: Company added successfully');
            
        } catch (error) {
            console.error('PipelineCard: Failed to add company:', error);
            throw error;
        }
    }
    
    // Data management methods
    update(newPipelineData) {
        this.pipeline = { ...newPipelineData };
        this.refreshChildComponents();
    }
    
    refreshChildComponents() {
        // Update all child components with new data
        if (this.header) this.header.update(this.pipeline);
        if (this.stats) this.stats.update(this.pipeline);
        if (this.companyList) this.companyList.update(this.pipeline);
        if (this.progressInfo) this.progressInfo.update(this.pipeline);
        // Action buttons are now updated via header.update()
        console.log('PipelineCard refreshChildComponents - companyList exists:', !!this.companyList);
    }
    
    // DOM Data Collection - called when user saves changes
    collectDataFromDOM() {
        if (this.companyList) {
            this.pipeline.companies = this.companyList.getCompaniesData();
        }
    }
    
    saveChanges() {
        this.collectDataFromDOM();
        this.triggerCallback('onSave', this.pipeline);
        this.hasUnsavedChanges = false;
    }
    
    // Company CRUD operations for Phase 3
    addCompany(companyData) {
        this.pipeline.companies.push(companyData);
        this.hasUnsavedChanges = true;
        this.refreshCompanyList();
    }
    
    updateCompany(companyIndex, updatedData) {
        this.pipeline.companies[companyIndex] = updatedData;
        this.hasUnsavedChanges = true;
    }
    
    removeCompany(companyIndex) {
        this.pipeline.companies.splice(companyIndex, 1);
        this.hasUnsavedChanges = true;
        this.refreshCompanyList();
    }
    
    refreshCompanyList() {
        if (this.companyList) {
            this.companyList.update(this.pipeline);
        }
        // Also update stats since company count changed
        if (this.stats) {
            this.stats.update(this.pipeline);
        }
    }
    
    async handleRefreshStatus(pipelineId) {
        console.log('PipelineCard: Refreshing status for pipeline:', pipelineId);
        
        try {
            // Show loading feedback
            const refreshButton = this.element.querySelector('.status-refresh');
            if (refreshButton) {
                refreshButton.style.opacity = '0.5';
                refreshButton.style.pointerEvents = 'none';
            }
            
            // Trigger callback to PipelineCardManager
            await this.triggerCallback('onRefreshPipeline', pipelineId);
            
        } catch (error) {
            console.error('PipelineCard: Failed to refresh status:', error);
        } finally {
            // Restore refresh button
            const refreshButton = this.element.querySelector('.status-refresh');
            if (refreshButton) {
                refreshButton.style.opacity = '1';
                refreshButton.style.pointerEvents = 'auto';
            }
        }
    }
    
    // Implement cascading destroy pattern
    destroyChildren() {
        // Clear auto-save timer
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        
        // Destroy all child components in order
        if (this.header) this.header.destroy();
        if (this.stats) this.stats.destroy();
        if (this.companyList) this.companyList.destroy();
        if (this.progressInfo) this.progressInfo.destroy();
        if (this.actionButtons) this.actionButtons.destroy();
        if (this.addCompanyForm) this.addCompanyForm.destroy();
    }
    
    unbindEvents() {
        // Remove any event listeners this component added
        // (Child components handle their own event listener removal)
    }
}

// Make PipelineCard available globally
window.PipelineCard = PipelineCard;