/**
 * Vector-based PDF Conversion Service
 * Generates PDFs using native jsPDF text/table functions for crisp, vector-quality output
 */

class PDFConversionServiceVector {
    
    /**
     * Load required libraries
     */
    static async loadLibraries() {
        try {
            const jsPDF = (await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm')).jsPDF;
            // Load autoTable plugin for better table formatting
            await import('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.6.0/+esm');
            return { jsPDF };
        } catch (error) {
            console.error('Failed to load PDF libraries:', error);
            throw new Error('Unable to load required PDF generation libraries');
        }
    }

    /**
     * Extract data from processed pipeline data for PDF generation
     */
    static extractPDFData(processedData) {
        const companies = processedData.companies || [];
        const summary = processedData.summary || {};
        
        const tableData = companies.map(company => [
            company.company_name || '-',
            company.revenue ? `$${company.revenue.toLocaleString()}` : '-',
            company.total_people_covered || '-',
            company.funding || '-',
            this.extractBrokerNames(company.plans),
            `$${Math.round(company.total_premiums || 0).toLocaleString()}`,
            `$${Math.round(company.total_brokerage_fees || 0).toLocaleString()}`
        ]);

        // Add totals row
        const totals = [
            'TOTAL',
            '-',
            summary.total_employees_covered || '-',
            '-',
            `${summary.unique_brokers || 0} Unique Brokers`,
            `$${Math.round(summary.total_premiums || 0).toLocaleString()}`,
            `$${Math.round(summary.total_brokerage_fees || 0).toLocaleString()}`
        ];

        return {
            firmName: processedData.firm_name,
            tableData,
            totals,
            summary
        };
    }

    /**
     * Extract broker names from plans
     */
    static extractBrokerNames(plans) {
        if (!plans || plans.length === 0) return "-";
        
        const uniqueBrokers = new Set();
        for (const plan of plans) {
            if (plan.carrier_name && plan.carrier_name.trim()) {
                uniqueBrokers.add(plan.carrier_name.trim());
            }
        }
        
        if (uniqueBrokers.size === 0) return "-";
        return Array.from(uniqueBrokers).join(", ");
    }

    /**
     * Create vector-based PDF with native jsPDF functions
     */
    static createVectorPDF(pdfData, jsPDF) {
        // Create PDF in portrait mode to avoid width issues
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10; // Reduced margin for more space
        
        console.log('PDF Page dimensions:', { pageWidth, pageHeight, margin });

        // Title
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        const title = `${pdfData.firmName} Portfolio Companies`;
        const titleWidth = pdf.getTextWidth(title);
        pdf.text(title, (pageWidth - titleWidth) / 2, 25);

        // Subtitle
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        const subtitle = 'Insurance Costs & Brokerage Fees Report';
        const subtitleWidth = pdf.getTextWidth(subtitle);
        pdf.text(subtitle, (pageWidth - subtitleWidth) / 2, 35);

        // Table headers
        const tableHeaders = [
            'Company',
            'Revenue', 
            'Employees\nCovered',
            'Funding',
            'Brokers',
            'Total\nPremiums',
            'Total Brokerage\nFees'
        ];

        // Configure table - fit to page width with conservative sizing
        const availableWidth = pageWidth - (margin * 2);
        
        console.log('VECTOR PDF - Page setup:', { 
            pageWidth, 
            pageHeight,
            margin, 
            availableWidth
        });
        
        const tableOptions = {
            head: [tableHeaders],
            body: pdfData.tableData,
            startY: 50,
            margin: { left: margin, right: margin },
            tableWidth: availableWidth, // Force fit within page
            styles: {
                fontSize: 8,
                cellPadding: 3,
                overflow: 'linebreak',
                halign: 'left',
                valign: 'middle'
            },
            headStyles: {
                fillColor: [44, 62, 80], // Match your template color #2c3e50
                textColor: 255,
                fontSize: 9,
                fontStyle: 'bold',
                halign: 'center',
                fillColor: [248, 249, 250], // Light gray like your template
                textColor: [44, 62, 80] // Dark text
            },
            columnStyles: {
                0: { cellWidth: 'auto', minCellWidth: 30 }, // Company name
                1: { halign: 'center', cellWidth: 'auto' }, // Revenue
                2: { halign: 'right', cellWidth: 'auto' }, // Employees
                3: { halign: 'center', cellWidth: 'auto' }, // Funding  
                4: { fontSize: 7, cellWidth: 'auto', minCellWidth: 50 }, // Brokers
                5: { halign: 'right', cellWidth: 'auto' }, // Premiums
                6: { halign: 'right', cellWidth: 'auto' }  // Brokerage fees
            },
            alternateRowStyles: {
                fillColor: [250, 251, 252] // Very light gray alternating
            }
        };

        // Generate main table
        pdf.autoTable(tableOptions);

        // Add totals row separately with different styling
        const finalY = pdf.lastAutoTable.finalY + 5;
        
        const totalsOptions = {
            head: [],
            body: [pdfData.totals],
            startY: finalY,
            margin: { left: margin, right: margin },
            tableWidth: availableWidth,
            styles: {
                fontSize: 9,
                fontStyle: 'bold',
                fillColor: [44, 62, 80], // Match your template #2c3e50
                textColor: 255,
                cellPadding: 4,
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 'auto', halign: 'center' },
                2: { cellWidth: 'auto', halign: 'right' },
                3: { cellWidth: 'auto', halign: 'center' },
                4: { cellWidth: 'auto', halign: 'center' },
                5: { cellWidth: 'auto', halign: 'right' },
                6: { cellWidth: 'auto', halign: 'right' }
            }
        };

        pdf.autoTable(totalsOptions);

        // Add generation timestamp
        const timestamp = new Date().toLocaleDateString();
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Generated on ${timestamp}`, margin, pageHeight - 10);

        return pdf;
    }

    /**
     * Main method to convert processed data to vector PDF
     */
    static async convertToPDF(processedData, firmName) {
        try {
            console.log('Starting vector PDF generation for:', firmName);
            
            // Load libraries
            const { jsPDF } = await this.loadLibraries();
            
            // Extract and structure data for PDF
            const pdfData = this.extractPDFData(processedData);
            
            // Create vector PDF
            const pdf = this.createVectorPDF(pdfData, jsPDF);
            
            // Generate filename and download
            const filename = `${firmName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_Insurance_Report_Vector_${new Date().toISOString().split('T')[0]}.pdf`;
            
            pdf.save(filename);
            
            console.log(`Vector PDF generated successfully: ${filename}`);
            
        } catch (error) {
            console.error('Error during vector PDF generation:', error);
            throw error;
        }
    }

    /**
     * Check if vector PDF generation is supported
     */
    static isSupportedBrowser() {
        return true; // jsPDF works in all modern browsers
    }
}

// Make available globally
window.PDFConversionServiceVector = PDFConversionServiceVector;

// Debug logging to confirm this file loaded
console.log('✅ PDFConversionService_Vector.js loaded successfully!');