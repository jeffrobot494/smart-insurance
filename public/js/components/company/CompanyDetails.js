// Smart Insurance - Company Details Component

class CompanyDetails extends BaseComponent {
    constructor(company, index, pipelineId, pipelineStatus, callbacks = {}) {
        super(company, callbacks);
        this.company = company;
        this.index = index;
        this.pipelineId = pipelineId;
        this.pipelineStatus = pipelineStatus;
        this.isExpanded = callbacks.isExpanded || false;
    }
    
    render() {
        this.element = this.createElement('div', 'company-details');
        this.element.id = `company-details-${this.pipelineId}-${this.index}`;
        
        if (this.isExpanded) {
            this.element.classList.add('expanded');
        }
        
        this.element.innerHTML = this.renderDetailsContent();
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    renderDetailsContent() {
        const isEditable = this.pipelineStatus === 'research_complete' || this.pipelineStatus === 'legal_resolution_complete';
        
        let html = `
            <div class="detail-row">
                <div class="detail-label">Company Name:</div>
                <div class="detail-value">
                    ${isEditable ? 
                        `<input type="text" class="editable-input" value="${this.company.name}" 
                                data-field="name">` :
                        this.company.name
                    }
                </div>
            </div>
        `;
        
        if (this.company.legal_entity_name || this.pipelineStatus === 'legal_resolution_complete') {
            const bgColor = isEditable && this.pipelineStatus === 'legal_resolution_complete' ? 
                (this.company.confidence_level === 'high' ? '#d4edda' : '#fff3cd') : '';
            
            html += `
                <div class="detail-row">
                    <div class="detail-label">Legal Entity Name:</div>
                    <div class="detail-value">
                        ${isEditable && this.pipelineStatus === 'legal_resolution_complete' ? 
                            `<input type="text" class="editable-input" value="${this.company.legal_entity_name || ''}" 
                                    style="background: ${bgColor}" 
                                    data-field="legal_entity_name">` :
                            (this.company.legal_entity_name || 'Pending legal resolution...')
                        }
                    </div>
                </div>
            `;
        }
        
        if (this.company.city || this.company.state) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Location:</div>
                    <div class="detail-value">${this.company.city || ''}, ${this.company.state || ''}</div>
                </div>
            `;
        }
        
        // Add confidence/match information
        if (this.company.confidence_level || this.pipelineStatus === 'legal_resolution_complete') {
            let confidenceText = '';
            if (this.company.confidence_level === 'high') {
                confidenceText = 'High - Exact match found';
            } else if (this.company.confidence_level === 'medium') {
                confidenceText = 'Medium - Partial match, manual review recommended';
            } else {
                confidenceText = 'High - Found on portfolio page';
            }
            
            html += `
                <div class="detail-row">
                    <div class="detail-label">Match Confidence:</div>
                    <div class="detail-value">${confidenceText}</div>
                </div>
            `;
        }
        
        return html;
    }
    
    bindEvents() {
        if (this.element) {
            this.changeHandler = (event) => {
                const input = event.target;
                if (input.classList.contains('editable-input')) {
                    event.stopPropagation();
                    const field = input.dataset.field;
                    const value = input.value;
                    this.triggerCallback('onFieldChange', this.index, field, value);
                }
            };
            this.element.addEventListener('change', this.changeHandler);
            this.element.addEventListener('input', this.changeHandler);
        }
    }
    
    unbindEvents() {
        if (this.element && this.changeHandler) {
            this.element.removeEventListener('change', this.changeHandler);
            this.element.removeEventListener('input', this.changeHandler);
        }
    }
    
    setVisible(isVisible) {
        this.isExpanded = isVisible;
        if (this.element) {
            if (isVisible) {
                this.element.classList.add('expanded');
            } else {
                this.element.classList.remove('expanded');
            }
        }
    }
    
    update(company, pipelineStatus) {
        this.company = company;
        this.pipelineStatus = pipelineStatus;
        if (this.isRendered && this.element) {
            this.element.innerHTML = this.renderDetailsContent();
            this.bindEvents(); // Re-bind events after content update
        }
    }
}

// Make CompanyDetails available globally
window.CompanyDetails = CompanyDetails;