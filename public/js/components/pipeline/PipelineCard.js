// Smart Insurance - Pipeline Card Component

class PipelineCard extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = { ...pipeline }; // Clean data model
        this.isExpanded = false; // Component manages own expansion state
        this.hasUnsavedChanges = false; // Change tracking
        
        // Create child components
        this.header = new PipelineHeader(pipeline, {
            isExpanded: this.isExpanded,
            onToggle: () => this.toggle()
        });
        
        this.stats = new PipelineStats(pipeline);
        
        this.companyList = new CompanyList(pipeline, {
            onToggleExited: (index) => this.handleCompanyToggleExited(index),
            onRemove: (index) => this.handleCompanyRemove(index),
            onFieldChange: (index, field, value) => this.handleCompanyFieldChange(index, field, value),
            onShowAddForm: () => this.showAddCompanyForm()
        });
        
        this.progressInfo = new ProgressInfo(pipeline);
        
        this.actionButtons = new ActionButtons(pipeline);
        
        // Create add company form if needed
        if (pipeline.status === 'research_complete') {
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
        
        // Add company list if pipeline has progressed beyond pending
        const companies = this.pipeline.companies || [];
        if (this.pipeline.status !== 'pending' && companies.length > 0) {
            const companyListElement = this.companyList.render();
            contentElement.appendChild(companyListElement);
        }
        
        // Add progress info for running pipelines
        const progressElement = this.progressInfo.render();
        contentElement.appendChild(progressElement);
        
        // Add action buttons
        const actionsElement = this.actionButtons.render();
        contentElement.appendChild(actionsElement);
        
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
    
    handleCompanyRemove(index) {
        console.log('PipelineCard: Remove company:', { pipelineId: this.pipeline.pipeline_id, index });
        // This will be fully implemented in Phase 3
        this.hasUnsavedChanges = true;
    }
    
    handleCompanyFieldChange(index, field, value) {
        console.log('PipelineCard: Field change:', { pipelineId: this.pipeline.pipeline_id, index, field, value });
        // Update data model immediately for UI responsiveness
        if (this.pipeline.companies[index]) {
            this.pipeline.companies[index][field] = value;
        }
        this.hasUnsavedChanges = true;
    }
    
    showAddCompanyForm() {
        if (this.addCompanyForm) {
            this.addCompanyForm.show();
        }
    }
    
    handleAddCompany(companyData) {
        console.log('PipelineCard: Add company:', { pipelineId: this.pipeline.pipeline_id, companyData });
        // This will be fully implemented in Phase 3
        this.hasUnsavedChanges = true;
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
        if (this.actionButtons) this.actionButtons.update(this.pipeline);
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
    
    // Implement cascading destroy pattern
    destroyChildren() {
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