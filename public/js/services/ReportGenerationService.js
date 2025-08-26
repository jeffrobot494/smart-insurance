/**
 * Report Generation Service
 * Main orchestrator for PDF report generation from PE firm insurance data
 */

class ReportGenerationService {
    
    // Template Configuration - Change this to use a different template
    static TEMPLATE_NAME = 'default';
    
    /**
     * Validate browser support for PDF generation
     */
    static validateBrowserSupport() {
        if (!window.PDFConversionService.isSupportedBrowser()) {
            throw new Error('Your browser does not support PDF generation. Please use a modern browser like Chrome, Firefox, or Safari.');
        }
    }

    /**
     * Validate input data
     */
    static validateInputData(pipeline, firmName) {
        if (!pipeline) {
            throw new Error('No pipeline data provided for report generation');
        }
        
        if (!pipeline.companies || !Array.isArray(pipeline.companies)) {
            throw new Error('Invalid data format: companies array not found');
        }
        
        if (pipeline.companies.length === 0) {
            throw new Error('No companies found in the pipeline data');
        }
        
        if (!pipeline.firm_name) {
            throw new Error('Pipeline missing firm_name field');
        }
    }

    /**
     * Log generation statistics
     */
    static logGenerationStats(processedData, startTime) {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log('PDF Report Generation Stats:', {
            firmName: processedData.firm_name,
            totalCompanies: processedData.summary.total_companies,
            companiesWithData: processedData.summary.companies_with_data,
            mostRecentYear: processedData.summary.most_recent_year,
            generationTimeSeconds: duration.toFixed(2)
        });
    }

    /**
     * Main method to generate PDF report from raw JSON data
     * 
     * This is the primary entry point for PDF report generation.
     * It orchestrates the entire process:
     * 1. Validates input and browser support
     * 2. Processes raw data using window.DataProcessingService
     * 3. Generates HTML using window.HTMLReportService
     * 4. Converts to PDF and downloads using window.PDFConversionService
     */
    static async generatePDFReport(pipeline) {
        const startTime = Date.now();
        
        // Extract firm name from pipeline
        const firmName = pipeline.firm_name;
        
        
        try {
            console.log('Starting PDF report generation for:', firmName);
            
            // Step 1: Validation
            this.validateBrowserSupport();
            this.validateInputData(pipeline, firmName);
            
            // Step 2: Process the pipeline data
            console.log('Processing pipeline data...');
            const processedData = window.DataProcessingService.processJSONData(pipeline);
            
            // Step 3: Generate HTML report
            console.log('Generating HTML report...');
            const reportResult = await window.HTMLReportService.generateHTMLReport(processedData, this.TEMPLATE_NAME);
            
            // Step 4: Convert to PDF and download
            console.log('Converting to PDF and downloading...');
            await window.PDFConversionService.convertToPDF(reportResult.html, processedData.firm_name, reportResult.config);
            
            // Step 5: Log completion stats
            this.logGenerationStats(processedData, startTime);
            
            console.log('PDF report generation completed successfully');
            
        } catch (error) {
            console.error('Failed to generate PDF report:', error);
            
            // Provide user-friendly error messages
            let userMessage = 'Failed to generate PDF report. ';
            if (error.message.includes('browser')) {
                userMessage += 'Please try using a different browser.';
            } else if (error.message.includes('data')) {
                userMessage += 'There was an issue with the data format.';
            } else {
                userMessage += 'Please try again or contact support if the problem persists.';
            }
            
            // Show error to user (could be replaced with a more sophisticated notification system)
            if (typeof alert !== 'undefined') {
                alert(userMessage);
            }
            
            throw error;
        }
    }

    /**
     * Generate HTML preview without PDF conversion
     * Useful for debugging or preview functionality
     */
    static async generateHTMLPreview(pipeline) {
        const firmName = pipeline.firm_name;
        try {
            this.validateInputData(pipeline, firmName);
            
            const processedData = window.DataProcessingService.processJSONData(pipeline);
            const reportResult = await window.HTMLReportService.generateHTMLReport(processedData, this.TEMPLATE_NAME);
            
            return {
                html: reportResult.html,
                processedData: processedData
            };
        } catch (error) {
            console.error('Failed to generate HTML preview:', error);
            throw error;
        }
    }

    /**
     * Download HTML file directly (temporary bypass for PDF issues)
     */
    static downloadHTMLFile(htmlContent, firmName) {
        const filename = `${firmName.replace(/\s+/g, '_')}_Insurance_Report.html`;
        
        // Create blob and download link
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        // Create temporary download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        
        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // Cleanup
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        console.log(`HTML report downloaded: ${filename}`);
    }

    /**
     * Get report generation capabilities and browser info
     */
    static getCapabilities() {
        return {
            browserSupported: window.PDFConversionService.isSupportedBrowser(),
            services: {
                dataProcessing: typeof window.DataProcessingService !== 'undefined',
                htmlGeneration: typeof window.HTMLReportService !== 'undefined',
                pdfConversion: typeof window.PDFConversionService !== 'undefined'
            },
            features: {
                yearPreference: true,
                expandableDetails: true,
                responsiveDesign: true,
                printOptimized: true
            }
        };
    }
}

// Make available globally
window.ReportGenerationService = ReportGenerationService;