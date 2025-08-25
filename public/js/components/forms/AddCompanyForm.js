// Smart Insurance - Add Company Form Component

class AddCompanyForm extends BaseComponent {
    constructor(pipelineId, callbacks = {}) {
        super(null, callbacks);
        this.pipelineId = pipelineId;
        this.isVisible = false; // Component manages own visibility state
    }
    
    render() {
        this.element = this.createElement('div', 'add-company-form');
        this.element.id = `add-form-${this.pipelineId}`;
        
        this.element.innerHTML = `
            <h5 style="margin-bottom: 15px;">Add New Company</h5>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Company Name *</label>
                    <input type="text" class="editable-input" id="new-company-name-${this.pipelineId}" placeholder="Enter company name" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Legal Entity Name</label>
                    <input type="text" class="editable-input" id="new-company-legal-${this.pipelineId}" placeholder="Legal entity name (optional)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">City</label>
                    <input type="text" class="editable-input" id="new-company-city-${this.pipelineId}" placeholder="City (optional)">
                </div>
                <div class="form-group">
                    <label class="form-label">State</label>
                    <input type="text" class="editable-input" id="new-company-state-${this.pipelineId}" placeholder="State (optional)">
                </div>
                <div class="form-group" style="flex: 0 0 120px;">
                    <label class="form-label">Status</label>
                    <label style="display: flex; align-items: center; margin-top: 8px;">
                        <input type="checkbox" class="checkbox" id="new-company-exited-${this.pipelineId}"> Exited
                    </label>
                </div>
            </div>
            <div class="form-error" style="display: none; color: #dc3545; margin-bottom: 10px; font-size: 12px;"></div>
            <div class="button-row">
                <button class="btn btn-success" data-action="add">Add Company</button>
                <button class="btn btn-secondary" data-action="cancel">Cancel</button>
            </div>
        `;
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
                const button = event.target.closest('button');
                if (button) {
                    event.stopPropagation(); // Prevent form interaction from bubbling
                    const action = button.dataset.action;
                    this.handleButtonClick(action);
                }
            };
            
            this.keyHandler = (event) => {
                if (event.key === 'Enter') {
                    event.stopPropagation();
                    this.handleButtonClick('add');
                } else if (event.key === 'Escape') {
                    event.stopPropagation();
                    this.handleButtonClick('cancel');
                }
            };
            
            this.inputHandler = (event) => {
                event.stopPropagation(); // Prevent typing from bubbling
            };
            
            this.element.addEventListener('click', this.clickHandler);
            this.element.addEventListener('keydown', this.keyHandler);
            this.element.addEventListener('input', this.inputHandler);
        }
    }
    
    unbindEvents() {
        if (this.element) {
            if (this.clickHandler) this.element.removeEventListener('click', this.clickHandler);
            if (this.keyHandler) this.element.removeEventListener('keydown', this.keyHandler);
            if (this.inputHandler) this.element.removeEventListener('input', this.inputHandler);
        }
    }
    
    async handleButtonClick(action) {
        if (action === 'add') {
            const addButton = this.element.querySelector('[data-action="add"]');
            
            try {
                // Show loading state
                this.setButtonLoading(addButton, true);
                this.hideError();
                
                const companyData = this.getFormData();
                if (companyData) {
                    await this.triggerCallback('onAdd', companyData);
                    this.clearForm();
                    this.hide();
                }
            } catch (error) {
                this.showError(error.message || 'Failed to add company');
            } finally {
                // Restore button state
                this.setButtonLoading(addButton, false);
            }
        } else if (action === 'cancel') {
            this.clearForm();
            this.hide();
        }
    }
    
    setButtonLoading(button, isLoading) {
        if (!button) return;
        
        if (isLoading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.innerHTML = '<span class="spinner"></span> Adding...';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || 'Add Company';
        }
    }
    
    getFormData() {
        const nameInput = this.element.querySelector(`#new-company-name-${this.pipelineId}`);
        const legalInput = this.element.querySelector(`#new-company-legal-${this.pipelineId}`);
        const cityInput = this.element.querySelector(`#new-company-city-${this.pipelineId}`);
        const stateInput = this.element.querySelector(`#new-company-state-${this.pipelineId}`);
        const exitedInput = this.element.querySelector(`#new-company-exited-${this.pipelineId}`);
        
        const rawData = {
            name: nameInput?.value || '',
            legal_entity_name: legalInput?.value || '',
            city: cityInput?.value || '',
            state: stateInput?.value || '',
            exited: exitedInput ? exitedInput.checked : false
        };
        
        // Use CompanyManager for validation and normalization
        const companyManager = window.app?.companyManager;
        if (companyManager) {
            return companyManager.normalizeCompanyData(rawData);
        }
        
        // Fallback to basic validation if CompanyManager not available
        if (!rawData.name || !rawData.name.trim()) {
            throw new Error('Company name is required');
        }
        
        return {
            name: rawData.name.trim(),
            legal_entity_name: rawData.legal_entity_name.trim() || null,
            city: rawData.city.trim() || null,
            state: rawData.state.trim() || null,
            exited: rawData.exited,
            confidence_level: 'medium'
        };
    }
    
    showError(message) {
        const errorDiv = this.element.querySelector('.form-error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }
    
    hideError() {
        const errorDiv = this.element.querySelector('.form-error');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }
    
    clearForm() {
        const nameInput = this.element?.querySelector(`#new-company-name-${this.pipelineId}`);
        const legalInput = this.element?.querySelector(`#new-company-legal-${this.pipelineId}`);
        const cityInput = this.element?.querySelector(`#new-company-city-${this.pipelineId}`);
        const stateInput = this.element?.querySelector(`#new-company-state-${this.pipelineId}`);
        const exitedInput = this.element?.querySelector(`#new-company-exited-${this.pipelineId}`);
        
        if (nameInput) nameInput.value = '';
        if (legalInput) legalInput.value = '';
        if (cityInput) cityInput.value = '';
        if (stateInput) stateInput.value = '';
        if (exitedInput) exitedInput.checked = false;
        
        this.hideError();
    }
    
    show() {
        this.isVisible = true;
        if (this.element) {
            this.element.classList.add('show');
            const nameInput = this.element.querySelector(`#new-company-name-${this.pipelineId}`);
            if (nameInput) nameInput.focus();
        }
    }
    
    hide() {
        this.isVisible = false;
        if (this.element) {
            this.element.classList.remove('show');
        }
    }
    
    update(data) {
        // Form doesn't need data updates - it's just for input
    }
}

// Make AddCompanyForm available globally
window.AddCompanyForm = AddCompanyForm;