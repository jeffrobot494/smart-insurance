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
        
        // Apply initial filtering
        this.handleFilterChange();
        
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
                    
                    <!-- Company Filters -->
                    <div class="config-section">
                        <div class="config-title">Filter Options</div>
                        <div class="filter-options">
                            <label class="filter-checkbox">
                                <input type="checkbox" id="exclude-exited-companies" checked>
                                Exclude exited companies
                            </label>
                            <label class="filter-checkbox">
                                <input type="checkbox" id="exclude-no-data-companies" checked>
                                Exclude companies without Form 5500 data
                            </label>
                        </div>
                    </div>
                    
                    <!-- Content Sections (Hidden) -->
                    <div class="config-section" style="display: none;">
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
                        <button class="btn btn-primary" id="download-excel-btn">Download Spreadsheet</button>
                        <button class="btn btn-info" id="download-txt-btn">Download TXT</button>
                        <button class="btn btn-secondary" id="cancel-report-btn">Cancel</button>
                    </div>
                    
                    <!-- Company Selection -->
                    <div class="config-section">
                        <div class="config-title">Companies to Include</div>
                        <div class="company-selection" id="company-checkboxes">
                            <!-- Dynamically populated -->
                        </div>
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
        
        // Download Excel button
        const downloadExcelBtn = this.modalElement.querySelector('#download-excel-btn');
        if (downloadExcelBtn) {
            downloadExcelBtn.addEventListener('click', () => this.handleExcelSubmit());
        }

        // Download TXT button
        const downloadTXTBtn = this.modalElement.querySelector('#download-txt-btn');
        if (downloadTXTBtn) {
            downloadTXTBtn.addEventListener('click', () => this.handleTXTSubmit());
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
        
        // Filter checkbox handlers
        const excludeExitedCheckbox = this.modalElement.querySelector('#exclude-exited-companies');
        if (excludeExitedCheckbox) {
            excludeExitedCheckbox.addEventListener('change', () => this.handleFilterChange());
        }
        
        const excludeNoDataCheckbox = this.modalElement.querySelector('#exclude-no-data-companies');
        if (excludeNoDataCheckbox) {
            excludeNoDataCheckbox.addEventListener('change', () => this.handleFilterChange());
        }
    }

    /**
     * Populate company table
     */
    populateCompanies(companies) {
        const container = this.modalElement?.querySelector('#company-checkboxes');
        
        if (!container) return;
        
        if (companies.length === 0) {
            container.innerHTML = '<p class="no-companies">No companies found in this pipeline.</p>';
            return;
        }
        
        // Create table HTML
        const tableHTML = `
            <table class="companies-table">
                <thead>
                    <tr>
                        <th>Company Name</th>
                        <th>Has Data</th>
                        <th>Exited</th>
                        <th>Include</th>
                    </tr>
                </thead>
                <tbody>
                    ${companies.map((company, index) => this.createCompanyRow(company, index)).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
    }

    /**
     * Create a single company row
     */
    createCompanyRow(company, index) {
        const companyName = company.name || 'Unknown Company';
        const hasData = company.form5500_data && Object.keys(company.form5500_data).length > 0;
        const isExited = company.exited === true; // Explicit boolean check
        
        return `
            <tr class="company-row" data-company-index="${index}">
                <td class="company-name">${companyName}</td>
                <td class="has-data">${hasData ? '✅ Yes' : '❌ No'}</td>
                <td class="exited-status">${isExited ? '🚪 Exited' : '✅ Active'}</td>
                <td class="include-checkbox">
                    <input type="checkbox" value="${index}" checked>
                </td>
            </tr>
        `;
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
     * Handle Excel export submission
     */
    handleExcelSubmit() {
        console.log('ReportConfigModal: Excel export submitted');

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
        console.log('ReportConfigModal: Excel export data collected:', config);

        // Trigger callback for Excel export
        this.triggerCallback('onGenerateExcel', config);
    }

    /**
     * Handle TXT download submission
     */
    handleTXTSubmit() {
        console.log('ReportConfigModal: TXT download submitted');

        // Clear any previous errors
        this.hideError();

        // For TXT download, we don't need company selection validation
        // We want the FULL pipeline record for the selected firm

        // Get basic form data for the callback
        const config = {
            pipelineId: this.pipeline.pipeline_id,
            format: 'txt'
        };

        console.log('ReportConfigModal: TXT download data collected:', config);

        // Trigger callback for TXT download
        this.triggerCallback('onGenerateTXT', config);
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
     * Handle filter checkbox changes
     */
    handleFilterChange() {
        if (!this.pipeline || !this.modalElement) return;
        
        const excludeExited = this.modalElement.querySelector('#exclude-exited-companies')?.checked || false;
        const excludeNoData = this.modalElement.querySelector('#exclude-no-data-companies')?.checked || false;
        
        const companyRows = this.modalElement.querySelectorAll('.company-row');
        
        companyRows.forEach((row, index) => {
            const company = this.pipeline.companies[index];
            const checkbox = row.querySelector('input[type="checkbox"]');
            
            if (!company) return;
            
            const isExited = company.exited === true;
            const hasData = company.form5500_data && Object.keys(company.form5500_data).length > 0;
            
            let shouldExclude = false;
            
            if (excludeExited && isExited) {
                shouldExclude = true;
            }
            
            if (excludeNoData && !hasData) {
                shouldExclude = true;
            }
            
            // All rows stay visible, only checkbox state changes
            if (shouldExclude) {
                checkbox.checked = false;
            } else {
                // Only check if it wasn't manually unchecked before
                if (!checkbox.hasAttribute('data-manually-unchecked')) {
                    checkbox.checked = true;
                }
            }
        });
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