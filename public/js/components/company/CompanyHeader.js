// Smart Insurance - Company Header Component

class CompanyHeader extends BaseComponent {
    constructor(company, index, pipelineId, pipelineStatus, callbacks = {}) {
        super(company, callbacks);
        this.company = company;
        this.index = index;
        this.pipelineId = pipelineId;
        this.pipelineStatus = pipelineStatus;
        this.isExpanded = callbacks.isExpanded || false;
    }
    
    render() {
        const confidenceClass = `confidence-${(this.company.confidence_level || 'low')}`;
        const confidenceText = (this.company.confidence_level || 'low').toUpperCase();
        
        // Determine status indicator
        let statusIndicator = '';
        if (this.company.form5500_data) {
            statusIndicator = '<span style="color: #28a745; font-weight: 600; margin-left: 10px;">✓ Form 5500 Data Found</span>';
        } else if (this.company.legal_entity_name && this.pipelineStatus === 'legal_resolution_complete') {
            statusIndicator = '<span style="color: #28a745; font-weight: 600; margin-left: 10px;">✓ Legal Entity Found</span>';
        } else if (this.pipelineStatus === 'legal_resolution_complete') {
            statusIndicator = '<span style="color: #856404; font-weight: 600; margin-left: 10px;">⚠ Review Needed</span>';
        }
        
        const isEditable = this.pipelineStatus === 'research_complete' || this.pipelineStatus === 'legal_resolution_complete';
        
        this.element = this.createElement('div', 'company-header');
        this.element.innerHTML = `
            <div class="company-info">
                <span class="confidence-badge ${confidenceClass}">${confidenceText}</span>
                <span>${this.company.name}</span>
                ${statusIndicator}
            </div>
            <div class="company-actions">
                ${isEditable ? `
                    <input type="checkbox" class="checkbox" ${this.company.exited ? 'checked' : ''} data-action="toggle-exited"> Exited
                    <button class="btn btn-danger" data-action="remove">Remove</button>
                ` : `
                    <span style="color: ${this.company.exited ? '#dc3545' : '#666'}; font-size: 12px;">
                        ${this.company.exited ? 'Exited' : 'Active'}
                    </span>
                `}
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
                // Check if click was on an interactive element
                const target = event.target;
                
                if (target.dataset.action === 'toggle-exited') {
                    event.stopPropagation();
                    this.triggerCallback('onToggleExited', this.index);
                    return;
                }
                
                if (target.dataset.action === 'remove') {
                    event.stopPropagation();
                    if (confirm('Remove this company from the list?')) {
                        this.triggerCallback('onRemove', this.index);
                    }
                    return;
                }
                
                // If not an interactive element, toggle company details
                if (!target.closest('.company-actions')) {
                    this.triggerCallback('onToggle', this.index);
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
    
    update(company, pipelineStatus) {
        this.company = company;
        this.pipelineStatus = pipelineStatus;
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

// Make CompanyHeader available globally
window.CompanyHeader = CompanyHeader;