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
    static async createTempContainer(htmlContent) {
        // Create iframe for proper HTML document rendering
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '0px';
        iframe.style.top = '0px';
        iframe.style.width = '1200px';
        iframe.style.height = '1600px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-1000';
        iframe.style.visibility = 'hidden';
        iframe.style.transform = 'scale(1)'; // Ensure no scaling issues
        
        document.body.appendChild(iframe);
        
        // Write HTML content to iframe
        iframe.contentDocument.open();
        iframe.contentDocument.write(htmlContent);
        iframe.contentDocument.close();
        
        // Wait for content to render, then resize iframe to match content
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const body = iframe.contentDocument.body;
        const contentHeight = Math.max(body.scrollHeight, body.offsetHeight);
        
        // Resize iframe to match actual content height
        iframe.style.height = contentHeight + 'px';
        
        console.log('DEBUG: Content dimensions:', {
            bodyHeight: body.scrollHeight,
            bodyWidth: body.scrollWidth,
            originalIframeHeight: '1600px',
            newIframeHeight: iframe.style.height,
            actualContentHeight: contentHeight
        });
        
        // Return the iframe's body for canvas rendering
        return iframe.contentDocument.body;
    }

    /**
     * Clean up temporary DOM container
     */
    static cleanupTempContainer(container) {
        if (container && container.ownerDocument && container.ownerDocument.defaultView && container.ownerDocument.defaultView.frameElement) {
            // This is an iframe body, remove the iframe
            const iframe = container.ownerDocument.defaultView.frameElement;
            if (iframe.parentNode) {
                document.body.removeChild(iframe);
            }
        } else if (container && container.parentNode) {
            // Fallback for regular containers
            container.parentNode.removeChild(container);
        }
    }

    /**
     * Configure html2canvas options for optimal PDF generation
     */
    static getCanvasOptions() {
        // Calculate optimal scale based on device pixel ratio
        const devicePixelRatio = window.devicePixelRatio || 1;
        const optimalScale = Math.max(2, Math.min(4, devicePixelRatio * 2));
        
        return {
            scale: optimalScale, // Dynamic scale based on device capabilities
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff', // Pure white background
            logging: true,
            removeContainer: false,
            foreignObjectRendering: true, // Re-enable for better text rendering
            imageTimeout: 15000,
            width: 1200,
            height: null,
            dpi: 300, // High DPI for crisp text
            letterRendering: true, // Better text rendering
            onclone: (clonedDoc) => {
                // Add high-resolution CSS for better text rendering
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    * {
                        -webkit-font-smoothing: antialiased !important;
                        -moz-osx-font-smoothing: grayscale !important;
                        text-rendering: optimizeLegibility !important;
                        font-smooth: always !important;
                    }
                    
                    body {
                        transform: scale(1) !important;
                        zoom: 1 !important;
                    }
                    
                    table, th, td {
                        font-weight: 500 !important;
                        letter-spacing: 0.01em !important;
                    }
                `;
                clonedDoc.head.appendChild(style);
                
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
            tempContainer = await this.createTempContainer(htmlContent);
            
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
     * Calculate PDF dimensions and layout based on orientation
     */
    static calculatePDFLayout(canvas, orientation = 'portrait') {
        let imgWidth, pageHeight;
        
        if (orientation === 'landscape') {
            imgWidth = 295; // A4 landscape width in mm
            pageHeight = 210; // A4 landscape height in mm
        } else {
            imgWidth = 210; // A4 portrait width in mm
            pageHeight = 295; // A4 portrait height in mm
        }
        
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        const layout = {
            imgWidth,
            pageHeight,
            imgHeight,
            totalPages: Math.ceil(imgHeight / pageHeight)
        };

        console.log('DEBUG: PDF Layout calculations:', {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            pdfImgWidth: imgWidth,
            pdfPageHeight: pageHeight,
            pdfImgHeight: imgHeight,
            totalPages: layout.totalPages,
            heightRatio: imgHeight / pageHeight
        });

        return layout;
    }

    /**
     * Create PDF from canvas
     */
    static createPDFFromCanvas(canvas, jsPDF, orientation = 'portrait') {
        const layout = this.calculatePDFLayout(canvas, orientation);
        // Use PNG for crisp text rendering (better than JPEG for text)
        const imgData = canvas.toDataURL('image/png');
        const orientationCode = orientation === 'landscape' ? 'l' : 'p';
        // Create PDF with higher compression settings
        const pdf = new jsPDF({
            orientation: orientationCode,
            unit: 'mm',
            format: 'a4',
            compress: true
        });
        
        let heightLeft = layout.imgHeight;
        let position = 0;
        let pageNumber = 1;
        
        // Add first page with better image quality settings
        pdf.addImage(imgData, 'PNG', 0, position, layout.imgWidth, layout.imgHeight, undefined, 'FAST');
        heightLeft -= layout.pageHeight;
        
        // Add additional pages if needed
        while (heightLeft >= 0) {
            position = heightLeft - layout.imgHeight;
            pdf.addPage();
            pageNumber++;
            
            console.log('DEBUG: Adding page', pageNumber, {
                heightLeft: heightLeft,
                position: position,
                remainingHeight: heightLeft
            });
            
            pdf.addImage(imgData, 'PNG', 0, position, layout.imgWidth, layout.imgHeight, undefined, 'FAST');
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
    static async convertToPDF(htmlContent, firmName, templateConfig = null) {
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
            
            // Get orientation from template config
            const orientation = templateConfig?.pdfSettings?.orientation || 'portrait';
            
            // Create PDF from canvas
            const pdf = this.createPDFFromCanvas(canvas, jsPDF, orientation);
            
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
     * Generate PDF using Paged.js + browser print (Phase 4 - Absolute minimum)
     */
    static async generatePrintablePDF(htmlContent, firmName, templateConfig = null) {
        // Open new tab with HTML content
        const newWindow = window.open('', '_blank');
        newWindow.document.write(htmlContent);
        newWindow.document.close();
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

// Make available globally
window.PDFConversionService = PDFConversionService;