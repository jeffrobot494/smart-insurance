// Smart Insurance - Company Card Component

class CompanyCard extends BaseComponent {
    constructor(company, index, pipelineId, pipelineStatus, callbacks = {}) {
        super(company, callbacks);
        this.company = company;
        this.index = index;
        this.pipelineId = pipelineId;
        this.pipelineStatus = pipelineStatus;
        this.isDetailsExpanded = false; // Component manages own expansion state
        
        // Create child components
        this.header = new CompanyHeader(company, index, pipelineId, pipelineStatus, {
            isExpanded: this.isDetailsExpanded,
            onToggle: (index) => this.toggleDetails(),
            onToggleExited: (index) => this.triggerCallback('onToggleExited', index),
            onRemove: (index) => this.triggerCallback('onRemove', index)
        });
        
        this.details = new CompanyDetails(company, index, pipelineId, pipelineStatus, {
            isExpanded: this.isDetailsExpanded,
            onFieldChange: (index, field, value) => this.triggerCallback('onFieldChange', index, field, value)
        });
        
        this.form5500Card = new Form5500Card(company.form5500_data);
    }
    
    render() {
        this.element = this.createElement('div', 'company-item');
        
        // Render child components
        const headerElement = this.header.render();
        const detailsElement = this.details.render();
        
        this.element.appendChild(headerElement);
        this.element.appendChild(detailsElement);
        
        // Create a dedicated container for Form 5500 data inside details
        const form5500Container = this.createElement('div', 'form5500-container');
        detailsElement.appendChild(form5500Container);
        
        // Add Form 5500 data to dedicated container if available
        if (this.company.form5500_data) {
            const form5500Element = this.form5500Card.render();
            form5500Container.appendChild(form5500Element);
            this.form5500CardInDOM = true;
        }
        
        this.isRendered = true;
        return this.element;
    }
    
    toggleDetails() {
        this.isDetailsExpanded = !this.isDetailsExpanded;
        this.details.setVisible(this.isDetailsExpanded);
        this.header.updateExpandIcon(this.isDetailsExpanded);
    }
    
    destroyChildren() {
        if (this.header) this.header.destroy();
        if (this.details) this.details.destroy();
        if (this.form5500Card) this.form5500Card.destroy();
    }
    
    update(company, pipelineStatus) {
        this.company = company;
        this.pipelineStatus = pipelineStatus;
        
        // Update child components
        if (this.header) {
            this.header.update(company, pipelineStatus);
        }
        if (this.details) {
            this.details.update(company, pipelineStatus);
        }
        if (this.form5500Card) {
            this.form5500Card.update(company.form5500_data);
        }
        
        // Handle Form 5500 data appearing/disappearing using dedicated container
        const form5500Container = this.element.querySelector('.form5500-container');
        if (form5500Container) {
            if (company.form5500_data && !this.form5500CardInDOM) {
                const form5500Element = this.form5500Card.render();
                form5500Container.appendChild(form5500Element);
                this.form5500CardInDOM = true;
            } else if (!company.form5500_data && this.form5500CardInDOM) {
                form5500Container.innerHTML = ''; // Clear container instead of destroying
                this.form5500CardInDOM = false;
            }
        }
    }
    
    // Get current data from DOM (for data extraction)
    getCompanyData() {
        const data = { ...this.company };
        
        // Extract data from input fields if in edit mode
        const nameInput = this.element.querySelector('input[data-field="name"]');
        const legalNameInput = this.element.querySelector('input[data-field="legal_entity_name"]');
        const exitedCheckbox = this.element.querySelector('input[type="checkbox"]');
        
        if (nameInput) data.name = nameInput.value;
        if (legalNameInput) data.legal_entity_name = legalNameInput.value;
        if (exitedCheckbox) data.exited = exitedCheckbox.checked;
        
        return data;
    }
}

// Make CompanyCard available globally
window.CompanyCard = CompanyCard;