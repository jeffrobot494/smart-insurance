/**
 * Report Generation Service
 * Main orchestrator for PDF report generation from PE firm insurance data
 */

import { DataProcessingService } from './DataProcessingService.js';
import { HTMLReportService } from './HTMLReportService.js';
import { PDFConversionService } from './PDFConversionService.js';

class ReportGenerationService {
    
    /**
     * Validate browser support for PDF generation
     */
    static validateBrowserSupport() {
        if (!PDFConversionService.isSupportedBrowser()) {
            throw new Error('Your browser does not support PDF generation. Please use a modern browser like Chrome, Firefox, or Safari.');
        }
    }

    /**
     * Validate input data
     */
    static validateInputData(rawData, firmName) {
        if (!rawData) {
            throw new Error('No data provided for report generation');
        }
        
        if (!rawData.companies || !Array.isArray(rawData.companies)) {
            throw new Error('Invalid data format: companies array not found');
        }
        
        if (rawData.companies.length === 0) {
            throw new Error('No companies found in the provided data');
        }
        
        if (!firmName || typeof firmName !== 'string') {
            console.warn('No firm name provided, using default');
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
     * 2. Processes raw data using DataProcessingService
     * 3. Generates HTML using HTMLReportService
     * 4. Converts to PDF and downloads using PDFConversionService
     */
    static async generatePDFReport(rawData, firmName) {
        const startTime = Date.now();
        
        try {
            console.log('Starting PDF report generation for:', firmName);
            
            // Step 1: Validation
            this.validateBrowserSupport();
            this.validateInputData(rawData, firmName);
            
            // Step 2: Process the raw JSON data
            console.log('Processing JSON data...');
            const processedData = DataProcessingService.processJSONData(rawData, firmName);
            
            // Step 3: Generate HTML report
            console.log('Generating HTML report...');
            const htmlContent = HTMLReportService.generateHTMLReport(processedData);
            
            // Step 4: Convert to PDF and download
            console.log('Converting to PDF and downloading...');
            await PDFConversionService.convertToPDF(htmlContent, processedData.firm_name);
            
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
    static async generateHTMLPreview(rawData, firmName) {
        try {
            this.validateInputData(rawData, firmName);
            
            const processedData = DataProcessingService.processJSONData(rawData, firmName);
            const htmlContent = HTMLReportService.generateHTMLReport(processedData);
            
            return {
                html: htmlContent,
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
            browserSupported: PDFConversionService.isSupportedBrowser(),
            services: {
                dataProcessing: typeof DataProcessingService !== 'undefined',
                htmlGeneration: typeof HTMLReportService !== 'undefined',
                pdfConversion: typeof PDFConversionService !== 'undefined'
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

// Export for both module and script usage
export { ReportGenerationService };