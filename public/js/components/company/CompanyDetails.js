// Smart Insurance - Company Details Component

class CompanyDetails extends BaseComponent {
    constructor(company, index, pipelineId, pipelineStatus, callbacks = {}) {
        super(company, callbacks);
        this.company = company;
        this.index = index;
        this.pipelineId = pipelineId;
        this.pipelineStatus = pipelineStatus;
        this.isExpanded = callbacks.isExpanded || false;
        this.editingField = null; // Current field being edited
        this.originalValues = {}; // Store original values for cancel
        this.hasUnsavedChanges = false;
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
        // Get display configuration from Utils
        const displayConfig = Utils.DisplayRules.getCompanyDisplayConfig(this.pipelineStatus);
        
        let html = '';
        
        // Company Name - Always editable if pipeline allows
        html += this.renderEditableField('name', 'Company Name', this.company.name, displayConfig.isEditable, true);
        
        // Legal Entity Name - Only show if display rules allow
        if (displayConfig.showLegalEntityName && (this.company.legal_entity_name || displayConfig.isEditable)) {
            html += this.renderEditableField('legal_entity_name', 'Legal Entity Name', 
                this.company.legal_entity_name || '', displayConfig.isEditable, false);
        }
        
        // City - Editable if pipeline allows
        if (this.company.city || displayConfig.isEditable) {
            html += this.renderEditableField('city', 'City', this.company.city || '', displayConfig.isEditable, false);
        }
        
        // State - Editable if pipeline allows  
        if (this.company.state || displayConfig.isEditable) {
            html += this.renderEditableField('state', 'State', this.company.state || '', displayConfig.isEditable, false);
        }
        
        // Annual Revenue - Show if available
        if (this.company.annual_revenue_usd) {
            // Revenue may come as a formatted string like "$26.7 million" so display it directly
            const revenueDisplay = this.company.annual_revenue_usd;
            const revenueYear = this.company.revenue_year ? ` (${this.company.revenue_year})` : '';
            html += `
                <div class="detail-row">
                    <div class="detail-label">Annual Revenue:</div>
                    <div class="detail-value">${revenueDisplay}${revenueYear}</div>
                </div>
            `;
        }
        
        // Add confidence/match information (read-only) - Only show if display rules allow
        if (displayConfig.showConfidenceBadge && this.company.confidence_level) {
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
        
        // Add Form 5500 data if available
        if (this.company.form5500_data) {
            html += this.renderForm5500Data();
        }
        
        return html;
    }
    
    renderEditableField(fieldName, label, value, isEditable, isRequired) {
        const isEditing = this.editingField === fieldName;
        const displayValue = value || '';
        const editIcon = isEditable && !isEditing ? 
            `<span class="edit-icon" data-field="${fieldName}" title="Click to edit">✎</span>` : '';
        
        if (isEditing) {
            // Show input with save/cancel buttons
            return `
                <div class="detail-row editing">
                    <div class="detail-label">${label}:</div>
                    <div class="detail-value">
                        <input type="text" class="edit-input" 
                               value="${this.escapeHtml(displayValue)}" 
                               data-field="${fieldName}"
                               ${isRequired ? 'required' : ''}>
                        <div class="edit-buttons">
                            <button class="btn-save" data-field="${fieldName}" title="Save">✓</button>
                            <button class="btn-cancel" data-field="${fieldName}" title="Cancel">✗</button>
                        </div>
                        <div class="field-error" style="display: none;"></div>
                    </div>
                </div>
            `;
        } else {
            // Show read-only with optional edit icon
            return `
                <div class="detail-row">
                    <div class="detail-label">${label}:</div>
                    <div class="detail-value">
                        <span class="field-text ${isEditable ? 'editable' : ''}" 
                              ${isEditable ? `data-field="${fieldName}"` : ''}>
                            ${displayValue || (isEditable ? '<em>Click to add</em>' : 'Not set')}
                        </span>
                        ${editIcon}
                    </div>
                </div>
            `;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    renderForm5500Data() {
        const data = this.company.form5500_data;
        let html = '<div class="form5500-section"><div class="section-header">Form 5500 Data:</div>';
        
        // Get the latest year of data
        const latestYear = data.form5500?.years?.length > 0 ? 
            Math.max(...data.form5500.years.map(y => parseInt(y))) : null;
        
        if (latestYear) {
            html += `
                <div class="detail-row">
                    <div class="detail-label">Latest Plan Year:</div>
                    <div class="detail-value">${latestYear}</div>
                </div>
            `;
        }
        
        // Calculate total active participants for latest year
        if (latestYear && data.form5500?.records?.[latestYear]) {
            const totalParticipants = data.form5500.records[latestYear]
                .reduce((sum, record) => sum + (record.active_participants || 0), 0);
            
            if (totalParticipants > 0) {
                html += `
                    <div class="detail-row">
                        <div class="detail-label">Active Participants:</div>
                        <div class="detail-value">${Utils.formatNumber(totalParticipants)}</div>
                    </div>
                `;
            }
        }
        
        // Calculate totals from Schedule A data for latest year
        if (latestYear && data.scheduleA?.details?.[latestYear]) {
            const scheduleAData = data.scheduleA.details[latestYear];
            
            let totalCharges = 0;
            let totalBrokerCommission = 0;
            const carriers = new Set();
            
            scheduleAData.forEach(record => {
                if (record.totalCharges) {
                    totalCharges += parseFloat(record.totalCharges) || 0;
                }
                if (record.brokerCommission) {
                    totalBrokerCommission += parseFloat(record.brokerCommission) || 0;
                }
                if (record.carrierName) {
                    carriers.add(record.carrierName);
                }
            });
            
            if (totalCharges > 0) {
                html += `
                    <div class="detail-row">
                        <div class="detail-label">Total Premiums:</div>
                        <div class="detail-value">${Utils.formatCurrency(totalCharges)}</div>
                    </div>
                `;
            }
            
            if (totalBrokerCommission > 0) {
                html += `
                    <div class="detail-row">
                        <div class="detail-label">Total Brokerage Fees:</div>
                        <div class="detail-value">${Utils.formatCurrency(totalBrokerCommission)}</div>
                    </div>
                `;
            }
            
            if (carriers.size > 0) {
                const carriersHtml = Array.from(carriers).map(carrier => 
                    `<div>• ${carrier}</div>`
                ).join('');
                
                html += `
                    <div class="detail-row">
                        <div class="detail-label">Insurance Carriers:</div>
                        <div class="detail-value">${carriersHtml}</div>
                    </div>
                `;
            }
        }
        
        html += '</div>';
        return html;
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
                event.stopPropagation(); // Prevent company card expansion
                
                const target = event.target;
                
                // Handle edit icon or field text clicks
                if (target.classList.contains('edit-icon') || 
                   (target.classList.contains('field-text') && target.classList.contains('editable'))) {
                    const fieldName = target.dataset.field;
                    this.startEdit(fieldName);
                }
                
                // Handle save button clicks
                else if (target.classList.contains('btn-save')) {
                    const fieldName = target.dataset.field;
                    this.saveField(fieldName);
                }
                
                // Handle cancel button clicks
                else if (target.classList.contains('btn-cancel')) {
                    const fieldName = target.dataset.field;
                    this.cancelEdit(fieldName);
                }
            };
            
            this.keyHandler = (event) => {
                if (event.target.classList.contains('edit-input')) {
                    event.stopPropagation();
                    
                    if (event.key === 'Enter') {
                        const fieldName = event.target.dataset.field;
                        this.saveField(fieldName);
                    } else if (event.key === 'Escape') {
                        const fieldName = event.target.dataset.field;
                        this.cancelEdit(fieldName);
                    }
                }
            };
            
            this.element.addEventListener('click', this.clickHandler);
            this.element.addEventListener('keydown', this.keyHandler);
        }
    }
    
    unbindEvents() {
        if (this.element) {
            if (this.clickHandler) {
                this.element.removeEventListener('click', this.clickHandler);
            }
            if (this.keyHandler) {
                this.element.removeEventListener('keydown', this.keyHandler);
            }
        }
    }
    
    // Core editing methods
    startEdit(fieldName) {
        if (this.editingField && this.editingField !== fieldName) {
            // Cancel any existing edit first
            this.cancelEdit(this.editingField);
        }
        
        this.editingField = fieldName;
        this.originalValues[fieldName] = this.company[fieldName] || '';
        
        // Re-render to show input field
        this.element.innerHTML = this.renderDetailsContent();
        this.bindEvents(); // Re-bind events after DOM update
        
        // Focus the input field
        const input = this.element.querySelector(`input[data-field="${fieldName}"]`);
        if (input) {
            input.focus();
            input.select();
        }
    }
    
    async saveField(fieldName) {
        const input = this.element.querySelector(`input[data-field="${fieldName}"]`);
        if (!input) return;
        
        const newValue = input.value.trim();
        const oldValue = this.originalValues[fieldName] || '';
        
        // Check if value actually changed
        if (newValue === oldValue) {
            this.cancelEdit(fieldName);
            return;
        }
        
        try {
            // Validate the field
            const validation = this.validateField(fieldName, newValue);
            if (!validation.valid) {
                this.showFieldError(fieldName, validation.error);
                return;
            }
            
            // Update local data
            this.company[fieldName] = newValue;
            this.hasUnsavedChanges = true;
            
            // Trigger callback to parent (PipelineCard)
            await this.triggerCallback('onFieldChange', this.index, fieldName, newValue);
            
            // Success - exit edit mode
            this.editingField = null;
            delete this.originalValues[fieldName];
            
            // Re-render to show updated value
            this.element.innerHTML = this.renderDetailsContent();
            this.bindEvents();
            
        } catch (error) {
            console.error('Error saving field:', error);
            this.showFieldError(fieldName, error.message || 'Failed to save changes');
        }
    }
    
    cancelEdit(fieldName) {
        // Restore original value
        if (this.originalValues.hasOwnProperty(fieldName)) {
            this.company[fieldName] = this.originalValues[fieldName];
            delete this.originalValues[fieldName];
        }
        
        this.editingField = null;
        
        // Re-render to show original value
        this.element.innerHTML = this.renderDetailsContent();
        this.bindEvents();
    }
    
    validateField(fieldName, value) {
        switch (fieldName) {
            case 'name':
                if (!value || value.length === 0) {
                    return { valid: false, error: 'Company name is required' };
                }
                if (value.length > 200) {
                    return { valid: false, error: 'Company name must be less than 200 characters' };
                }
                break;
                
            case 'legal_entity_name':
                if (value && value.length > 200) {
                    return { valid: false, error: 'Legal entity name must be less than 200 characters' };
                }
                break;
                
            case 'city':
            case 'state':
                if (value && value.length > 100) {
                    return { valid: false, error: `${fieldName} must be less than 100 characters` };
                }
                break;
        }
        
        return { valid: true };
    }
    
    showFieldError(fieldName, errorMessage) {
        const errorDiv = this.element.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.textContent = errorMessage;
            errorDiv.style.display = 'block';
            errorDiv.style.color = '#dc3545';
            errorDiv.style.fontSize = '12px';
            errorDiv.style.marginTop = '4px';
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