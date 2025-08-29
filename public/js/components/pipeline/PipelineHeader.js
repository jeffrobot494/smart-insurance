// Smart Insurance - Pipeline Header Component

class PipelineHeader extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = pipeline;
        this.isExpanded = callbacks.isExpanded || false;
        this.actionButtons = callbacks.actionButtons || null;
    }
    
    render() {
        const statusDisplay = Utils.getStatusDisplay(this.pipeline.status);
        const formattedDate = Utils.formatDate(this.pipeline.created_at);
        
        this.element = this.createElement('div', 'pipeline-header');
        this.element.innerHTML = `
            <div>
                <div class="pipeline-title">${this.pipeline.firm_name}</div>
                ${this.pipeline.status === 'data_extraction_complete' ? 
                    `<div class="pipeline-date">Completed: ${formattedDate}</div>` : 
                    `<div class="pipeline-date">Started: ${formattedDate}</div>`
                }
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="action-buttons-container"></div>
                <div class="status-badge ${statusDisplay.class}">${statusDisplay.text}</div>
                <span class="status-refresh" data-pipeline-id="${this.pipeline.pipeline_id}" title="Refresh status">⟲</span>
                <span class="expand-icon ${this.isExpanded ? 'rotated' : ''}">▼</span>
            </div>
        `;
        
        // Add action buttons if provided
        if (this.actionButtons) {
            const actionButtonsContainer = this.element.querySelector('.action-buttons-container');
            const actionButtonsElement = this.actionButtons.render();
            actionButtonsContainer.appendChild(actionButtonsElement);
        }
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
                const target = event.target;
                
                // Handle refresh button clicks
                if (target.classList.contains('status-refresh')) {
                    event.stopPropagation();
                    const pipelineId = target.dataset.pipelineId;
                    this.triggerCallback('onRefreshStatus', pipelineId);
                    return;
                }
                
                // Handle regular header clicks (toggle expansion)
                this.triggerCallback('onToggle');
            };
            this.element.addEventListener('click', this.clickHandler);
        }
    }
    
    unbindEvents() {
        if (this.element && this.clickHandler) {
            this.element.removeEventListener('click', this.clickHandler);
        }
    }
    
    updateExpandIcon(isExpanded) {
        this.isExpanded = isExpanded;
        const icon = this.element?.querySelector('.expand-icon');
        if (icon) {
            if (isExpanded) {
                icon.classList.add('rotated');
            } else {
                icon.classList.remove('rotated');
            }
        }
    }
    
    update(pipeline) {
        this.pipeline = pipeline;
        // Update action buttons if they exist
        if (this.actionButtons) {
            this.actionButtons.update(pipeline);
        }
        if (this.isRendered) {
            // Re-render with new data
            const parent = this.element.parentNode;
            this.destroy();
            const newElement = this.render();
            if (parent) {
                parent.appendChild(newElement);
            }
        }
    }
}

// Make PipelineHeader available globally
window.PipelineHeader = PipelineHeader;