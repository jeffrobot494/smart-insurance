// Smart Insurance - Action Buttons Component

class ActionButtons extends BaseComponent {
    constructor(pipeline) {
        super(pipeline);
        this.pipeline = pipeline;
    }
    
    render() {
        const buttons = this.getButtonsForStatus(this.pipeline.status);
        
        if (buttons.length === 0) {
            this.element = this.createElement('div');
            this.element.style.display = 'none';
            this.isRendered = true;
            return this.element;
        }
        
        this.element = this.createElement('div', 'button-row');
        this.element.innerHTML = buttons.join('');
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    getButtonsForStatus(status) {
        const pipelineId = this.pipeline.pipeline_id;
        const buttons = [];
        
        switch (status) {
            case 'research_complete':
                buttons.push(`<button class="btn btn-primary" data-action="proceed-legal">Proceed to Legal Resolution</button>`);
                buttons.push(`<button class="btn btn-secondary" data-action="edit">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'legal_resolution_complete':
                buttons.push(`<button class="btn btn-primary" data-action="proceed-data">Proceed to Data Extraction</button>`);
                buttons.push(`<button class="btn btn-secondary" data-action="edit">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'data_extraction_complete':
                buttons.push(`<button class="btn btn-success" data-action="report">Generate Report</button>`);
                buttons.push(`<button class="btn btn-secondary" data-action="edit">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'failed':
                buttons.push(`<button class="btn btn-primary" data-action="retry">Retry</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'pending':
                // Pending pipelines need a "Start Research" button
                buttons.push(`<button class="btn btn-primary" data-action="start-research">Start Research</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'research_running':
            case 'legal_resolution_running':
            case 'data_extraction_running':
                // For running pipelines, only show delete option
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
        }
        
        return buttons;
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
                const button = event.target.closest('button');
                if (button) {
                    event.stopPropagation(); // Prevent pipeline card from toggling
                    const action = button.dataset.action;
                    this.handleButtonClick(action);
                }
            };
            this.element.addEventListener('click', this.clickHandler);
        }
    }
    
    unbindEvents() {
        if (this.element && this.clickHandler) {
            this.element.removeEventListener('click', this.clickHandler);
        }
    }
    
    handleButtonClick(action) {
        const pipelineId = this.pipeline.pipeline_id;
        
        switch (action) {
            case 'start-research':
                window.app?.handleStartResearch?.(pipelineId);
                break;
            case 'proceed-legal':
                window.app?.handleProceedToStep?.(pipelineId, 'legal-resolution');
                break;
            case 'proceed-data':
                window.app?.handleProceedToStep?.(pipelineId, 'data-extraction');
                break;
            case 'report':
                window.app?.handleGenerateReport?.(pipelineId);
                break;
            case 'edit':
                window.app?.handleEditPipeline?.(pipelineId);
                break;
            case 'retry':
                window.app?.handleRetryPipeline?.(pipelineId);
                break;
            case 'delete':
                if (confirm('Delete this pipeline? This action cannot be undone.')) {
                    window.app?.handleDeletePipeline?.(pipelineId);
                }
                break;
        }
    }
    
    update(pipeline) {
        this.pipeline = pipeline;
        if (this.isRendered) {
            // Re-render with new buttons for updated status
            const parent = this.element.parentNode;
            this.destroy();
            const newElement = this.render();
            if (parent) {
                parent.appendChild(newElement);
            }
        }
    }
}

// Make ActionButtons available globally
window.ActionButtons = ActionButtons;