/**
 * PDF Conversion Service
 * Handles HTML to PDF conversion and download operations
 */

class PDFConversionService {
    
    /**
     * Load required external libraries dynamically
     */
    static async loadLibraries() {
        try {
            // Import html2canvas and jsPDF from CDN
            const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default;
            const jsPDF = (await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm')).jsPDF;
            
            return { html2canvas, jsPDF };
        } catch (error) {
            console.error('Failed to load PDF libraries:', error);
            throw new Error('Unable to load required PDF generation libraries');
        }
    }

    /**
     * Create temporary DOM container for HTML content
     */
    static createTempContainer(htmlContent) {
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = htmlContent;
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '1200px'; // Fixed width for consistent PDF layout
        tempContainer.style.background = '#f8f9fa'; // Match body background
        
        document.body.appendChild(tempContainer);
        return tempContainer;
    }

    /**
     * Clean up temporary DOM container
     */
    static cleanupTempContainer(container) {
        if (container && container.parentNode) {
            document.body.removeChild(container);
        }
    }

    /**
     * Configure html2canvas options for optimal PDF generation
     */
    static getCanvasOptions() {
        return {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#f8f9fa',
            logging: false, // Reduce console noise
            removeContainer: false, // We'll handle cleanup manually
            foreignObjectRendering: true,
            imageTimeout: 0,
            onclone: (clonedDoc) => {
                // Ensure all detail rows are expanded in the clone for PDF
                const detailRows = clonedDoc.querySelectorAll('.detail-rows');
                detailRows.forEach(row => {
                    row.style.display = 'table-row-group';
                });
                
                // Remove interactive elements that don't make sense in PDF
                const expandArrows = clonedDoc.querySelectorAll('.expand-arrow');
                expandArrows.forEach(arrow => {
                    arrow.style.display = 'none';
                });
                
                // Make company rows non-interactive
                const companyRows = clonedDoc.querySelectorAll('.company-row');
                companyRows.forEach(row => {
                    row.style.cursor = 'default';
                    row.removeAttribute('onclick');
                });
            }
        };
    }

    /**
     * Generate canvas from HTML content
     */
    static async generateCanvas(htmlContent, html2canvas) {
        let tempContainer = null;
        
        try {
            tempContainer = this.createTempContainer(htmlContent);
            
            console.log('Temp container HTML length:', tempContainer.innerHTML.length);
            console.log('Temp container dimensions:', tempContainer.offsetWidth, tempContainer.offsetHeight);
            
            // Wait a moment for styles to apply
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const canvasOptions = this.getCanvasOptions();
            const canvas = await html2canvas(tempContainer, canvasOptions);
            
            console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
            console.log('Canvas data URL length:', canvas.toDataURL('image/png').length);
            
            return canvas;
        } finally {
            // Always cleanup, even if there's an error
            this.cleanupTempContainer(tempContainer);
        }
    }

    /**
     * Calculate PDF dimensions and layout
     */
    static calculatePDFLayout(canvas) {
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 295; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        return {
            imgWidth,
            pageHeight,
            imgHeight,
            totalPages: Math.ceil(imgHeight / pageHeight)
        };
    }

    /**
     * Create PDF from canvas
     */
    static createPDFFromCanvas(canvas, jsPDF) {
        const layout = this.calculatePDFLayout(canvas);
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        let heightLeft = layout.imgHeight;
        let position = 0;
        let pageNumber = 1;
        
        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, layout.imgWidth, layout.imgHeight);
        heightLeft -= layout.pageHeight;
        
        // Add additional pages if needed
        while (heightLeft >= 0) {
            position = heightLeft - layout.imgHeight;
            pdf.addPage();
            pageNumber++;
            pdf.addImage(imgData, 'PNG', 0, position, layout.imgWidth, layout.imgHeight);
            heightLeft -= layout.pageHeight;
        }
        
        return pdf;
    }

    /**
     * Generate filename for PDF download
     */
    static generateFilename(firmName) {
        const sanitizedName = firmName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        return `${sanitizedName}_Insurance_Report_${timestamp}.pdf`;
    }

    /**
     * Trigger PDF download in browser
     */
    static downloadPDF(pdf, filename) {
        try {
            pdf.save(filename);
            console.log(`PDF report generated and downloaded: ${filename}`);
            return true;
        } catch (error) {
            console.error('Failed to download PDF:', error);
            throw new Error('Failed to download PDF file');
        }
    }

    /**
     * Show progress indicator during PDF generation
     */
    static showProgress(message = 'Generating PDF...') {
        // Create simple progress indicator
        const progressDiv = document.createElement('div');
        progressDiv.id = 'pdf-progress-indicator';
        progressDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 5px;
            z-index: 9999;
            font-family: Arial, sans-serif;
        `;
        progressDiv.textContent = message;
        document.body.appendChild(progressDiv);
        
        return progressDiv;
    }

    /**
     * Hide progress indicator
     */
    static hideProgress() {
        const progressDiv = document.getElementById('pdf-progress-indicator');
        if (progressDiv && progressDiv.parentNode) {
            progressDiv.parentNode.removeChild(progressDiv);
        }
    }

    /**
     * Main method to convert HTML to PDF and trigger download
     */
    static async convertToPDF(htmlContent, firmName) {
        let progressIndicator = null;
        
        try {
            console.log('Starting PDF generation for:', firmName);
            progressIndicator = this.showProgress('Generating PDF...');
            
            // Load required libraries
            const { html2canvas, jsPDF } = await this.loadLibraries();
            
            // Update progress
            if (progressIndicator) {
                progressIndicator.textContent = 'Rendering content...';
            }
            
            // Generate canvas from HTML
            const canvas = await this.generateCanvas(htmlContent, html2canvas);
            
            // Update progress
            if (progressIndicator) {
                progressIndicator.textContent = 'Creating PDF...';
            }
            
            // Create PDF from canvas
            const pdf = this.createPDFFromCanvas(canvas, jsPDF);
            
            // Generate filename and download
            const filename = this.generateFilename(firmName);
            this.downloadPDF(pdf, filename);
            
            console.log(`PDF generation completed successfully: ${filename}`);
            
        } catch (error) {
            console.error('Error during PDF conversion:', error);
            
            // Show user-friendly error message
            alert('Failed to generate PDF report. Please try again or contact support if the problem persists.');
            
            throw error;
        } finally {
            // Always hide progress indicator
            this.hideProgress();
        }
    }

    /**
     * Check if PDF generation is supported in current browser
     */
    static isSupportedBrowser() {
        // Check for required browser features
        const hasCanvas = !!document.createElement('canvas').getContext;
        const hasBlob = typeof Blob !== 'undefined';
        const hasURL = typeof URL !== 'undefined' && URL.createObjectURL;
        
        return hasCanvas && hasBlob && hasURL;
    }

    /**
     * Get estimated PDF generation time based on content complexity
     */
    static estimateGenerationTime(htmlContent) {
        // Rough estimation based on content length and complexity
        const contentLength = htmlContent.length;
        const tableCount = (htmlContent.match(/<table/g) || []).length;
        const imageCount = (htmlContent.match(/<img/g) || []).length;
        
        // Base time + additional time for tables and images
        const baseTime = Math.max(2, Math.min(10, contentLength / 10000));
        const additionalTime = (tableCount * 0.5) + (imageCount * 1);
        
        return Math.round(baseTime + additionalTime);
    }
}

export { PDFConversionService };