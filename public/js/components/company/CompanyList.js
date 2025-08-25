// Smart Insurance - Company List Component

class CompanyList extends BaseComponent {
    constructor(pipeline, callbacks = {}) {
        super(pipeline, callbacks);
        this.pipeline = pipeline;
        this.companyCards = [];
    }
    
    render() {
        const companies = this.pipeline.companies || [];
        if (companies.length === 0) {
            this.element = this.createElement('div');
            this.element.style.display = 'none';
            this.isRendered = true;
            return this.element;
        }
        
        const headerText = this.getCompanyListHeader(this.pipeline.status);
        
        this.element = this.createElement('div', 'company-list');
        
        // Create section header
        const headerElement = this.createElement('div', 'company-section-header');
        headerElement.innerHTML = `
            <h4>${headerText}</h4>
            ${this.pipeline.status === 'research_complete' ? 
                `<button class="btn btn-success" data-action="add-company">+ Add Company</button>` : ''
            }
        `;
        this.element.appendChild(headerElement);
        
        // Create company cards
        this.companyCards = [];
        companies.forEach((company, index) => {
            const companyCard = new CompanyCard(company, index, this.pipeline.pipeline_id, this.pipeline.status, {
                onToggleExited: (index) => this.triggerCallback('onToggleExited', index),
                onRemove: (index) => this.triggerCallback('onRemove', index),
                onFieldChange: (index, field, value) => this.triggerCallback('onFieldChange', index, field, value)
            });
            
            const cardElement = companyCard.render();
            this.element.appendChild(cardElement);
            this.companyCards.push(companyCard);
        });
        
        this.bindEvents();
        this.isRendered = true;
        return this.element;
    }
    
    getCompanyListHeader(status) {
        switch (status) {
            case 'research_complete':
                return 'Portfolio Companies (Click to edit)';
            case 'legal_resolution_complete':
                return 'Portfolio Companies (Legal Entities Resolved - Click to edit)';
            case 'data_extraction_complete':
                return 'Portfolio Companies (Final Results)';
            default:
                return 'Portfolio Companies';
        }
    }
    
    bindEvents() {
        if (this.element) {
            this.clickHandler = (event) => {
                const button = event.target.closest('button[data-action="add-company"]');
                if (button) {
                    event.stopPropagation();
                    this.triggerCallback('onShowAddForm');
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
    
    destroyChildren() {
        this.companyCards.forEach(card => card.destroy());
        this.companyCards = [];
    }
    
    update(pipeline) {
        this.pipeline = pipeline;
        const companies = pipeline.companies || [];
        
        // Update existing company cards
        this.companyCards.forEach((card, index) => {
            if (index < companies.length) {
                card.update(companies[index], pipeline.status);
            }
        });
        
        // Handle companies added/removed (re-render for now)
        if (companies.length !== this.companyCards.length) {
            if (this.isRendered) {
                const parent = this.element.parentNode;
                this.destroy();
                const newElement = this.render();
                if (parent) {
                    parent.appendChild(newElement);
                }
            }
        } else {
            // Update header text if status changed
            const headerElement = this.element.querySelector('.company-section-header h4');
            if (headerElement) {
                headerElement.textContent = this.getCompanyListHeader(pipeline.status);
            }
        }
    }
    
    // Get all company data (for data extraction)
    getCompaniesData() {
        return this.companyCards.map(card => card.getCompanyData());
    }
}

// Make CompanyList available globally
window.CompanyList = CompanyList;