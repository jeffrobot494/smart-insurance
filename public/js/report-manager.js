/**
 * Smart Insurance - Report Manager
 * Phase 5 implementation - Complete report generation with modal UI
 */

class ReportManager {
    constructor() {
        this.isVisible = false;
        this.currentPipeline = null;
        
        // Initialize modal with callbacks
        this.modal = new window.ReportConfigModal({
            onGenerate: (config) => this.generateReport(config),
            onGenerateExcel: (config) => this.generateExcelReport(config),
            onGenerateTXT: (config) => this.generateTXTDownload(config),
            onCancel: () => this.handleCancel()
        });
        
        console.log('ReportManager: Initialized with full Phase 5 implementation');
    }

    /**
     * Show report configuration modal with pipeline data
     */
    async showReportConfig(pipelineId, pipeline) {
        console.log('ReportManager: Showing report config for pipeline', pipelineId);
        
        // Validate pipeline data
        if (!pipeline) {
            console.error('ReportManager: No pipeline data provided');
            Utils.showError('No pipeline data available for report generation');
            return;
        }
        
        if (!pipeline.companies || pipeline.companies.length === 0) {
            console.warn('ReportManager: Pipeline has no companies');
            Utils.showError('This pipeline has no companies to include in the report');
            return;
        }
        
        // Store current pipeline
        this.currentPipeline = pipeline;
        
        // Show modal
        this.modal.show(pipelineId, pipeline);
        this.isVisible = true;
    }

    /**
     * Hide report configuration modal
     */
    hideReportConfig() {
        console.log('ReportManager: Hiding report config');
        
        this.modal.hide();
        this.isVisible = false;
        this.currentPipeline = null;
    }

    /**
     * Generate report based on configuration
     */
    async generateReport(config) {
        console.log('ReportManager: Generating report with config:', config);
        
        try {
            // Validate config
            const validation = this.validateConfig(config);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // Get filtered pipeline data
            const filteredPipeline = this.filterPipelineCompanies(this.currentPipeline, config.selectedCompanies);
            
            // Show progress
            this.handleReportProgress(`Generating ${config.format.toUpperCase()} report...`);
            
            // Route to appropriate generator based on format
            switch (config.format) {
                case 'pdf':
                    await this.generatePDFReport(config, filteredPipeline);
                    break;
                    
                case 'excel':
                    await this.generateExcelReport(config, filteredPipeline);
                    break;
                    
                case 'csv':
                    await this.generateCSVReport(config, filteredPipeline);
                    break;
                    
                default:
                    throw new Error(`Unsupported format: ${config.format}`);
            }
            
            // Success feedback removed - was blocking PDF tab from appearing
            
            // Hide modal
            this.hideReportConfig();
            
        } catch (error) {
            console.error('ReportManager: Report generation failed:', error);
            
            // Show user-friendly error
            const userMessage = this.getUserFriendlyError(error);
            if (window.app && window.app.showError) {
                window.app.showError(`Report generation failed: ${userMessage}`);
            }
            
            // Keep modal open so user can try again
        }
    }

    /**
     * Generate PDF report using legacy services
     */
    async generatePDFReport(config, pipeline) {
        console.log('ReportManager: Generating PDF report');
        
        try {
            // Use refactored legacy service with new pipeline format
            await window.ReportGenerationService.generatePDFReport(pipeline);
            
        } catch (error) {
            console.error('ReportManager: PDF generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate Excel report using ExcelExportService
     */
    async generateExcelReport(config, pipeline = null) {
        console.log('ReportManager: Generating Excel report with config:', config);
        
        try {
            // If no pipeline provided, filter the current pipeline
            const targetPipeline = pipeline || this.filterPipelineCompanies(this.currentPipeline, config.selectedCompanies);
            
            // Show progress
            this.handleReportProgress('Generating Excel report...');
            
            // Process data using the same service as PDF generation
            const processedData = window.DataProcessingService.processJSONData(targetPipeline);
            
            // Generate and download Excel file
            const result = await window.ExcelExportService.generateExcelReport(processedData);
            
            console.log(`ReportManager: Excel report generated successfully: ${result.filename}`);
            
            // Hide modal
            this.hideReportConfig();
            
            // Hide loading
            Utils.hideLoading();
            
        } catch (error) {
            console.error('ReportManager: Excel generation failed:', error);
            Utils.hideLoading();
            throw error;
        }
    }

    /**
     * Generate TXT download of complete pipeline data
     */
    async generateTXTDownload(config) {
        console.log('ReportManager: Generating TXT download with config:', config);

        try {
            // Show progress
            this.handleReportProgress('Preparing TXT report...');

            // Fetch complete pipeline data from server
            const response = await fetch(`/api/pipeline/${config.pipelineId}`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch pipeline data');
            }

            // Download the TXT file using TXTExportService
            const downloadResult = await window.TXTExportService.downloadTXTWithValidation(
                result.pipeline,
                result.pipeline.firm_name
            );

            console.log(`ReportManager: TXT download completed successfully: ${downloadResult.filename}`);

            // Hide modal
            this.hideReportConfig();

            // Hide loading
            Utils.hideLoading();

        } catch (error) {
            console.error('ReportManager: TXT download failed:', error);
            Utils.hideLoading();
            throw error;
        }
    }

    /**
     * Generate CSV report (client-side)
     */
    async generateCSVReport(config, pipeline) {
        console.log('ReportManager: CSV generation not yet implemented');

        // Placeholder - would generate CSV from pipeline data
        throw new Error('CSV report generation will be implemented in a future phase');
    }

    /**
     * Filter pipeline companies based on selectedCompanies array
     */
    filterPipelineCompanies(pipeline, selectedCompanies) {
        if (!selectedCompanies || selectedCompanies.length === 0) {
            // If no selection, include all companies
            return pipeline;
        }
        
        const filteredCompanies = pipeline.companies.filter((company, index) => 
            selectedCompanies.includes(index)
        );
        
        console.log(`ReportManager: Filtered ${filteredCompanies.length} of ${pipeline.companies.length} companies`);
        
        return {
            ...pipeline,
            companies: filteredCompanies
        };
    }

    /**
     * Validate report configuration
     */
    validateConfig(config) {
        if (!config) {
            return { valid: false, error: 'No configuration provided' };
        }
        
        if (!config.pipelineId) {
            return { valid: false, error: 'Pipeline ID is required' };
        }
        
        if (!config.format) {
            return { valid: false, error: 'Report format is required' };
        }
        
        if (!['pdf', 'excel', 'csv'].includes(config.format)) {
            return { valid: false, error: 'Invalid report format' };
        }
        
        if (!config.selectedCompanies || config.selectedCompanies.length === 0) {
            return { valid: false, error: 'At least one company must be selected' };
        }
        
        return { valid: true };
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            format: 'pdf',
            selectedCompanies: [], // Will be populated based on pipeline companies
            include: {
                companyInfo: true,
                insurance: true,
                financial: true,
                legal: false
            }
        };
    }

    /**
     * Handle report progress feedback
     */
    handleReportProgress(message) {
        console.log('ReportManager: Progress:', message);
        Utils.showLoading(message);
    }

    /**
     * Handle cancel action
     */
    handleCancel() {
        console.log('ReportManager: Report generation cancelled');
        this.hideReportConfig();
    }

    /**
     * Get user-friendly error message
     */
    getUserFriendlyError(error) {
        if (error.message.includes('browser')) {
            return 'Your browser may not support this feature. Try using Chrome or Firefox.';
        }
        
        if (error.message.includes('data')) {
            return 'There was an issue with the report data format.';
        }
        
        if (error.message.includes('companies')) {
            return 'No companies were selected for the report.';
        }
        
        if (error.message.includes('not yet implemented')) {
            return 'This feature is coming soon!';
        }
        
        // Generic fallback
        return error.message || 'An unexpected error occurred';
    }

    /**
     * Check report generation capabilities
     */
    getCapabilities() {
        const capabilities = window.ReportGenerationService.getCapabilities();
        
        return {
            ...capabilities,
            formats: {
                pdf: capabilities.browserSupported,
                excel: false, // Not yet implemented
                csv: false    // Not yet implemented
            },
            features: {
                ...capabilities.features,
                companyFiltering: true,
                contentSections: true,
                modalInterface: true
            }
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.modal) {
            this.modal.destroy();
            this.modal = null;
        }
        
        this.isVisible = false;
        this.currentPipeline = null;
        
        console.log('ReportManager: Destroyed');
    }
}

// Make available globally for legacy compatibility
window.ReportManager = ReportManager;

// Already exported via window.ReportManager above