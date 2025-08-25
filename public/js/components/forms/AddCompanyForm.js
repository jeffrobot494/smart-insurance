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
                    <input type="text" class="editable-input" id="new-company-name-${this.pipelineId}" placeholder="Enter company name">
                </div>
                <div class="form-group" style="flex: 0 0 120px;">
                    <label class="form-label">Status</label>
                    <label style="display: flex; align-items: center; margin-top: 8px;">
                        <input type="checkbox" class="checkbox" id="new-company-exited-${this.pipelineId}"> Exited
                    </label>
                </div>
            </div>
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
    
    handleButtonClick(action) {
        if (action === 'add') {
            const companyData = this.getFormData();
            if (companyData) {
                this.triggerCallback('onAdd', companyData);
                this.clearForm();
                this.hide();
            }
        } else if (action === 'cancel') {
            this.clearForm();
            this.hide();
        }
    }
    
    getFormData() {
        const nameInput = this.element.querySelector(`#new-company-name-${this.pipelineId}`);
        const exitedInput = this.element.querySelector(`#new-company-exited-${this.pipelineId}`);
        
        if (!nameInput || !nameInput.value.trim()) {
            alert('Please enter a company name');
            return null;
        }
        
        return {
            name: nameInput.value.trim(),
            exited: exitedInput ? exitedInput.checked : false
        };
    }
    
    clearForm() {
        const nameInput = this.element?.querySelector(`#new-company-name-${this.pipelineId}`);
        const exitedInput = this.element?.querySelector(`#new-company-exited-${this.pipelineId}`);
        
        if (nameInput) nameInput.value = '';
        if (exitedInput) exitedInput.checked = false;
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