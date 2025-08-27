/**
 * Report Configuration Modal Component
 * Provides UI for selecting companies and report options
 */

class ReportConfigModal extends BaseComponent {
    constructor(callbacks = {}) {
        super(null, callbacks);
        
        this.pipeline = null;
        this.isVisible = false;
        this.modalElement = null;
    }

    /**
     * Show modal with pipeline data
     */
    show(pipelineId, pipeline) {
        this.pipeline = pipeline;
        
        // Create modal if it doesn't exist
        if (!this.modalElement) {
            this.createModal();
        }
        
        // Populate with pipeline data
        this.populateCompanies(pipeline.companies || []);
        this.setDefaultValues();
        
        // Show modal
        this.modalElement.classList.add('show');
        this.isVisible = true;
        
        console.log('ReportConfigModal: Modal shown for pipeline', pipelineId);
    }

    /**
     * Hide modal
     */
    hide() {
        if (this.modalElement) {
            this.modalElement.classList.remove('show');
        }
        this.isVisible = false;
        this.pipeline = null;
        
        console.log('ReportConfigModal: Modal hidden');
    }

    /**
     * Create modal HTML structure
     */
    createModal() {
        // Find existing modal in DOM or create it
        this.modalElement = document.getElementById('report-config-modal');
        
        if (!this.modalElement) {
            // Create modal structure
            this.modalElement = Utils.createElement('div', 'modal-overlay', {
                id: 'report-config-modal'
            });
            
            this.modalElement.innerHTML = `
                <div class="modal-content">
                    <h3>Generate Report</h3>
                    
                    <!-- Company Selection -->
                    <div class="config-section">
                        <div class="config-title">Companies to Include</div>
                        <div class="company-selection" id="company-checkboxes">
                            <!-- Dynamically populated -->
                        </div>
                    </div>
                    
                    <!-- Content Sections -->
                    <div class="config-section">
                        <div class="config-title">Include in Report</div>
                        <div class="checkbox-group">
                            <label><input type="checkbox" id="include-company-info" checked> Company Information</label>
                            <label><input type="checkbox" id="include-insurance" checked> Insurance Carriers</label>
                            <label><input type="checkbox" id="include-financial" checked> Financial Data</label>
                            <label><input type="checkbox" id="include-legal"> Legal Entity Details</label>
                        </div>
                    </div>
                    
                    <!-- Error Display -->
                    <div class="form-error" id="report-form-error" style="display: none;"></div>
                    
                    <!-- Action Buttons -->
                    <div class="button-row">
                        <button class="btn btn-success" id="download-report-btn">Download Report</button>
                        <button class="btn btn-secondary" id="cancel-report-btn">Cancel</button>
                    </div>
                </div>
            `;
            
            // Add to DOM
            document.body.appendChild(this.modalElement);
        }
        
        // Bind event listeners
        this.bindEvents();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        if (!this.modalElement) return;
        
        // Download report button
        const downloadBtn = this.modalElement.querySelector('#download-report-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.handleFormSubmit());
        }
        
        // Cancel button
        const cancelBtn = this.modalElement.querySelector('#cancel-report-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCancel());
        }
        
        // Close on overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.handleCancel();
            }
        });
        
        // Format change handler
        const formatRadios = this.modalElement.querySelectorAll('input[name="format"]');
        formatRadios.forEach(radio => {
            radio.addEventListener('change', () => this.handleFormatChange());
        });
    }

    /**
     * Populate company checkboxes
     */
    populateCompanies(companies) {
        const container = this.modalElement?.querySelector('#company-checkboxes');
        
        if (!container) return;
        
        if (companies.length === 0) {
            container.innerHTML = '<p class="no-companies">No companies found in this pipeline.</p>';
            return;
        }
        
        const checkboxesHTML = companies.map((company, index) => {
            const companyName = company.name || 'Unknown Company';
            const hasData = company.form5500_data ? 'has-data' : 'no-data';
            
            return `
                <label class="company-checkbox ${hasData}">
                    <input type="checkbox" value="${index}" checked>
                    <span class="company-name">${companyName}</span>
                    ${company.form5500_data ? '<span class="data-indicator">📊</span>' : '<span class="no-data-indicator">❌</span>'}
                </label>
            `;
        }).join('');
        
        container.innerHTML = checkboxesHTML;
    }

    /**
     * Set default form values
     */
    setDefaultValues() {
        if (!this.modalElement) return;
        
        // Default to PDF format
        const pdfRadio = this.modalElement.querySelector('input[name="format"][value="pdf"]');
        if (pdfRadio) pdfRadio.checked = true;
        
        // Default all content sections to checked
        const contentCheckboxes = this.modalElement.querySelectorAll('.checkbox-group input[type="checkbox"]');
        contentCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        
        // Hide any previous errors
        this.hideError();
    }

    /**
     * Get form data
     */
    getFormData() {
        if (!this.modalElement) return null;
        
        // Format is always PDF (only supported format)
        const format = 'pdf';
        
        // Get selected companies
        const companyCheckboxes = this.modalElement.querySelectorAll('#company-checkboxes input[type="checkbox"]:checked');
        const selectedCompanies = Array.from(companyCheckboxes).map(checkbox => parseInt(checkbox.value));
        
        // Get content sections
        const include = {
            companyInfo: this.modalElement.querySelector('#include-company-info')?.checked || false,
            insurance: this.modalElement.querySelector('#include-insurance')?.checked || false,
            financial: this.modalElement.querySelector('#include-financial')?.checked || false,
            legal: this.modalElement.querySelector('#include-legal')?.checked || false
        };
        
        return {
            pipelineId: this.pipeline.pipeline_id,
            format: format,
            selectedCompanies: selectedCompanies,
            include: include
        };
    }

    /**
     * Validate form
     */
    validateForm() {
        const config = this.getFormData();
        
        if (!config) {
            return { valid: false, error: 'Unable to read form data' };
        }
        
        if (config.selectedCompanies.length === 0) {
            return { valid: false, error: 'Please select at least one company to include in the report.' };
        }
        
        const hasAnyContent = Object.values(config.include).some(value => value);
        if (!hasAnyContent) {
            return { valid: false, error: 'Please select at least one content section to include.' };
        }
        
        return { valid: true };
    }

    /**
     * Show error message
     */
    showError(message) {
        const errorElement = this.modalElement?.querySelector('#report-form-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        const errorElement = this.modalElement?.querySelector('#report-form-error');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    /**
     * Handle form submission
     */
    handleFormSubmit() {
        console.log('ReportConfigModal: Form submitted');
        
        // Clear any previous errors
        this.hideError();
        
        // Validate form
        const validation = this.validateForm();
        if (!validation.valid) {
            this.showError(validation.error);
            return;
        }
        
        // Get form data
        const config = this.getFormData();
        console.log('ReportConfigModal: Form data collected:', config);
        
        // Trigger callback
        this.triggerCallback('onGenerate', config);
    }

    /**
     * Handle cancel
     */
    handleCancel() {
        console.log('ReportConfigModal: Cancel clicked');
        this.hide();
        this.triggerCallback('onCancel');
    }

    /**
     * Handle format change
     */
    handleFormatChange() {
        const config = this.getFormData();
        console.log('ReportConfigModal: Format changed to', config?.format);
        
        // Could add format-specific UI changes here
        // For example, disable certain content sections for CSV format
    }

    /**
     * Cleanup component
     */
    destroy() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
        
        this.isVisible = false;
        this.pipeline = null;
        
        super.destroy();
    }
}

// Make available globally
window.ReportConfigModal = ReportConfigModal;