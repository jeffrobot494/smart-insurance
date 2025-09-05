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
        
        console.log('🔴 ActionButtons: getButtonsForStatus called with status:', status);
        
        switch (status) {
            case 'research_complete':
                buttons.push(`<button class="btn btn-primary" data-action="proceed-legal">Proceed to Legal Resolution</button>`);
                // buttons.push(`<button class="btn btn-secondary" data-action="edit">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'legal_resolution_complete':
                buttons.push(`<button class="btn btn-primary" data-action="proceed-data">Proceed to Data Extraction</button>`);
                // buttons.push(`<button class="btn btn-secondary" data-action="edit">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'data_extraction_complete':
                buttons.push(`<button class="btn btn-success" data-action="report">Generate Report</button>`);
                // buttons.push(`<button class="btn btn-secondary" data-action="edit">Edit</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'research_failed':
            case 'legal_resolution_failed':
                buttons.push(`<button class="btn btn-primary" data-action="reset">Reset</button>`);
                buttons.push(`<button class="btn btn-danger" data-action="delete">Delete</button>`);
                break;
                
            case 'data_extraction_failed':
                // Programming errors need developer intervention, not user reset
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
            this.clickHandler = async (event) => {
                const button = event.target.closest('button');
                if (button) {
                    event.stopPropagation(); // Prevent pipeline card from toggling
                    const action = button.dataset.action;
                    
                    // Show loading state
                    this.setButtonLoading(button, action, true);
                    
                    try {
                        await this.handleButtonClick(action);
                        // Success state
                        this.setButtonSuccess(button, action);
                    } catch (error) {
                        console.error('ActionButtons: Action failed:', error);
                        // Restore button on error
                        this.setButtonLoading(button, action, false);
                    }
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
    
    setButtonLoading(button, action, isLoading) {
        if (isLoading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            
            switch (action) {
                case 'start-research':
                    button.innerHTML = '<span class="spinner"></span> Starting...';
                    break;
                case 'proceed-legal':
                    button.innerHTML = '<span class="spinner"></span> Starting...';
                    break;
                case 'proceed-data':
                    button.innerHTML = '<span class="spinner"></span> Starting...';
                    break;
                case 'reset':
                    button.innerHTML = '<span class="spinner"></span> Resetting...';
                    break;
                case 'delete':
                    button.innerHTML = '<span class="spinner"></span> Deleting...';
                    break;
                default:
                    button.innerHTML = '<span class="spinner"></span> Processing...';
            }
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || 'Action';
        }
    }
    
    setButtonSuccess(button, action) {
        switch (action) {
            case 'start-research':
                button.innerHTML = '✓ Research Started';
                break;
            case 'proceed-legal':
                button.innerHTML = '✓ Legal Resolution Started';
                break;
            case 'proceed-data':
                button.innerHTML = '✓ Data Extraction Started';
                break;
            case 'reset':
                button.innerHTML = '✓ Reset Complete';
                break;
            case 'delete':
                button.innerHTML = '✓ Deleted';
                break;
            default:
                button.innerHTML = '✓ Success';
        }
        
        // Button will be removed/updated when status changes
        setTimeout(() => {
            // If button still exists after 2 seconds, restore it
            if (button.parentNode) {
                button.disabled = false;
                button.textContent = button.dataset.originalText || 'Action';
            }
        }, 2000);
    }
    
    async handleButtonClick(action) {
        const pipelineId = this.pipeline.pipeline_id;
        
        switch (action) {
            case 'start-research':
            case 'proceed-legal':
            case 'proceed-data':
                if (window.app && window.app.proceedToNextStep) {
                    await window.app.proceedToNextStep(pipelineId);
                }
                break;
            case 'report':
                if (window.app && window.app.handleGenerateReport) {
                    await window.app.handleGenerateReport(pipelineId);
                }
                break;
            case 'edit':
                if (window.app && window.app.handleEditPipeline) {
                    await window.app.handleEditPipeline(pipelineId);
                }
                break;
            case 'reset':
                if (window.app && window.app.handleResetPipeline) {
                    await window.app.handleResetPipeline(pipelineId);
                }
                break;
            case 'delete':
                if (confirm('Delete this pipeline? This action cannot be undone.')) {
                    if (window.app && window.app.handleDeletePipeline) {
                        await window.app.handleDeletePipeline(pipelineId);
                    }
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