// Smart Insurance - Pipeline Header Component

class PipelineHeader extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = pipeline;
        this.isExpanded = callbacks.isExpanded || false;
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
                <div class="status-badge ${statusDisplay.class}">${statusDisplay.text}</div>
                <span class="expand-icon ${this.isExpanded ? 'rotated' : ''}">▼</span>
            </div>
        `;
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
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