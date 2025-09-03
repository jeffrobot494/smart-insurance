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
            
            // Step 4: Convert to PDF using vector approach for crisp text
            console.log('Converting to PDF using vector approach...');
            console.log('Vector service available:', !!window.PDFConversionServiceVector);
            console.log('Regular service available:', !!window.PDFConversionService);
            console.log('Window properties:', Object.keys(window).filter(k => k.includes('PDF')));
            
            // USE YOUR TEMPLATE WITH VECTOR PDF (BEST OF BOTH WORLDS)
            console.log('🔧 USING YOUR TEMPLATE + VECTOR PDF');
            try {
                // Generate HTML with your beautiful template
                console.log('Step 4a: Using your template HTML...');
                
                // Modify the HTML to remove ALL scrollbar CSS before PDF conversion
                let modifiedHTML = reportResult.html
                    .replace(/overflow-x:\s*auto/g, 'overflow-x: visible')
                    .replace(/overflow:\s*auto/g, 'overflow: visible')
                    .replace(/overflow-x:\s*scroll/g, 'overflow-x: visible')
                    .replace(/overflow:\s*scroll/g, 'overflow: visible');
                
                // Also add CSS to force table to fit
                modifiedHTML = modifiedHTML.replace(
                    '</style>',
                    'table { table-layout: fixed !important; width: 100% !important; } .table-container { overflow: visible !important; } </style>'
                );
                
                console.log('HTML after CSS modifications:', modifiedHTML.length, 'characters');
                
                console.log('Step 4b: Converting template HTML to vector PDF...');
                await window.PDFConversionService.convertToPDF(modifiedHTML, processedData.firm_name, reportResult.config);
                console.log('✅ Template + Vector PDF completed successfully');
            } catch (vectorError) {
                console.error('❌ Template + Vector PDF failed:', vectorError);
                console.log('⚠️ FALLING BACK TO AUTOTABLE METHOD');
                await window.PDFConversionServiceVector.convertToPDF(processedData, processedData.firm_name);
            }
            
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
     * Generate HTML and open in new tab (Phase 3 - For testing only)
     */
    static async generateHTMLInNewTab(pipeline) {
        const startTime = Date.now();
        const firmName = pipeline.firm_name;
        
        try {
            console.log('🧪 Phase 3: Opening HTML report in new tab for testing');
            
            // Step 1: Validation
            this.validateBrowserSupport();
            this.validateInputData(pipeline, firmName);
            
            // Step 2: Process the pipeline data
            console.log('Processing pipeline data...');
            const processedData = window.DataProcessingService.processJSONData(pipeline);
            
            // Step 3: Generate HTML report
            console.log('Generating HTML report...');
            const reportResult = await window.HTMLReportService.generateHTMLReport(processedData, this.TEMPLATE_NAME);
            
            // Step 4: Open HTML in new tab instead of converting to PDF
            const newWindow = window.open('', '_blank');
            newWindow.document.write(reportResult.html);
            newWindow.document.close();
            
            console.log('✅ Phase 3: HTML report opened in new tab');
            
            // Log stats
            this.logGenerationStats(processedData, startTime);
            
        } catch (error) {
            console.error('❌ Phase 3: Failed to open HTML in new tab:', error);
            alert('Phase 3 test failed. Check console for details.');
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

    /**
     * Test Phase 3 with sample data (for browser console testing)
     */
    static async testPhase3WithSampleData() {
        console.log('🧪 Testing Phase 3 with sample data...');
        
        // Create sample pipeline data
        const samplePipeline = {
            firm_name: "Phase 3 Test Firm",
            pipeline_id: "test-123",
            companies: [
                {
                    company_name: "Test Company A",
                    total_premiums: 100000,
                    total_brokerage_fees: 5000,
                    total_people_covered: 150,
                    self_funded_classification: "insured",
                    plans: [
                        { carrier_name: "Test Insurance Co" }
                    ]
                },
                {
                    company_name: "Test Company B", 
                    total_premiums: 200000,
                    total_brokerage_fees: 10000,
                    total_people_covered: 300,
                    self_funded_classification: "self-funded",
                    plans: [
                        { carrier_name: "Another Insurance Co" }
                    ]
                }
            ]
        };
        
        try {
            await this.generateHTMLInNewTab(samplePipeline);
            console.log('✅ Phase 3 test completed - check new tab!');
        } catch (error) {
            console.error('❌ Phase 3 test failed:', error);
        }
    }
}

// Make available globally
window.ReportGenerationService = ReportGenerationService;