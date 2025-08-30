/**
 * Clean Manual PDF Generation - No autoTable, pure jsPDF control
 */

class PDFConversionServiceManual {
    
    static async loadLibraries() {
        try {
            const jsPDF = (await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm')).jsPDF;
            return { jsPDF };
        } catch (error) {
            console.error('Failed to load PDF libraries:', error);
            throw new Error('Unable to load required PDF generation libraries');
        }
    }

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

    static calculateTotals(companies) {
        let totalPremiums = 0;
        let totalFees = 0;
        let totalEmployees = 0;
        const allBrokers = new Set();

        for (const company of companies) {
            totalPremiums += company.total_premiums || 0;
            totalFees += company.total_brokerage_fees || 0;
            totalEmployees += company.total_people_covered || 0;
            
            // Count unique brokers across all companies
            if (company.plans) {
                for (const plan of company.plans) {
                    if (plan.carrier_name && plan.carrier_name.trim()) {
                        allBrokers.add(plan.carrier_name.trim());
                    }
                }
            }
        }

        return {
            totalPremiums,
            totalFees,
            totalEmployees,
            uniqueBrokers: allBrokers.size
        };
    }

    static createManualPDF(companies, firmName, jsPDF) {
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 297; // A4 landscape
        const pageHeight = 210;
        const margin = 15;
        const usableWidth = pageWidth - (margin * 2); // 267mm

        console.log('PDF dimensions:', { pageWidth, pageHeight, usableWidth });

        // Title and subtitle
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        const title = `${firmName} Portfolio Companies`;
        pdf.text(title, pageWidth/2, 25, { align: 'center' });

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        const subtitle = 'Insurance Costs & Brokerage Fees Report';
        pdf.text(subtitle, pageWidth/2, 35, { align: 'center' });

        // Table setup
        const startY = 55;
        let currentY = startY;
        const rowHeight = 10;
        const headerHeight = 12;

        // Column widths that actually fit in 267mm
        const colWidths = {
            company: 45,    // 45mm
            revenue: 25,    // 25mm  
            employees: 20,  // 20mm
            funding: 25,    // 25mm
            brokers: 90,    // 90mm (biggest)
            premiums: 31,   // 31mm
            fees: 31        // 31mm
        };                  // Total: 267mm = usableWidth

        // Column X positions
        const cols = {
            company: margin,
            revenue: margin + 45,
            employees: margin + 70,
            funding: margin + 90,
            brokers: margin + 115,
            premiums: margin + 205,
            fees: margin + 236
        };

        console.log('Column positions:', cols);
        console.log('Total table width:', 267, 'vs usableWidth:', usableWidth);

        // Header row
        pdf.setFillColor(52, 73, 94);
        pdf.rect(margin, currentY, usableWidth, headerHeight, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        
        pdf.text('Company', cols.company + colWidths.company/2, currentY + 8, { align: 'center' });
        pdf.text('Revenue', cols.revenue + colWidths.revenue/2, currentY + 8, { align: 'center' });
        pdf.text('Employees', cols.employees + colWidths.employees/2, currentY + 8, { align: 'center' });
        pdf.text('Funding', cols.funding + colWidths.funding/2, currentY + 8, { align: 'center' });
        pdf.text('Brokers', cols.brokers + colWidths.brokers/2, currentY + 8, { align: 'center' });
        pdf.text('Premiums', cols.premiums + colWidths.premiums/2, currentY + 8, { align: 'center' });
        pdf.text('Fees', cols.fees + colWidths.fees/2, currentY + 8, { align: 'center' });
        
        currentY += headerHeight;

        // Data rows
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);

        for (let i = 0; i < companies.length; i++) {
            const company = companies[i];
            
            // Alternate row colors
            if (i % 2 === 0) {
                pdf.setFillColor(248, 249, 250);
                pdf.rect(margin, currentY, usableWidth, rowHeight, 'F');
            }
            
            // Truncate long text
            let companyName = (company.company_name || '-');
            if (companyName.length > 20) companyName = companyName.substring(0, 17) + '...';
            
            let revenue = company.revenue ? `$${company.revenue.toLocaleString()}` : '-';
            
            let brokers = this.extractBrokerNames(company.plans);
            if (brokers.length > 50) brokers = brokers.substring(0, 47) + '...';
            
            // Draw text
            pdf.text(companyName, cols.company + 2, currentY + 6);
            pdf.text(revenue, cols.revenue + colWidths.revenue - 2, currentY + 6, { align: 'right' });
            pdf.text((company.total_people_covered || '-').toString(), cols.employees + colWidths.employees/2, currentY + 6, { align: 'center' });
            pdf.text(company.funding || '-', cols.funding + colWidths.funding/2, currentY + 6, { align: 'center' });
            pdf.setFontSize(8);
            pdf.text(brokers, cols.brokers + 2, currentY + 6);
            pdf.setFontSize(9);
            pdf.text(`$${Math.round(company.total_premiums || 0).toLocaleString()}`, cols.premiums + colWidths.premiums - 2, currentY + 6, { align: 'right' });
            pdf.text(`$${Math.round(company.total_brokerage_fees || 0).toLocaleString()}`, cols.fees + colWidths.fees - 2, currentY + 6, { align: 'right' });
            
            currentY += rowHeight;
        }

        // Calculate totals properly
        const totals = this.calculateTotals(companies);

        // Totals row
        pdf.setFillColor(52, 73, 94);
        pdf.rect(margin, currentY, usableWidth, rowHeight, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        
        pdf.text('TOTAL', cols.company + 2, currentY + 6);
        pdf.text('-', cols.revenue + colWidths.revenue/2, currentY + 6, { align: 'center' });
        pdf.text(totals.totalEmployees.toString(), cols.employees + colWidths.employees/2, currentY + 6, { align: 'center' });
        pdf.text('-', cols.funding + colWidths.funding/2, currentY + 6, { align: 'center' });
        pdf.text(`${totals.uniqueBrokers} Unique`, cols.brokers + colWidths.brokers/2, currentY + 6, { align: 'center' });
        pdf.text(`$${Math.round(totals.totalPremiums).toLocaleString()}`, cols.premiums + colWidths.premiums - 2, currentY + 6, { align: 'right' });
        pdf.text(`$${Math.round(totals.totalFees).toLocaleString()}`, cols.fees + colWidths.fees - 2, currentY + 6, { align: 'right' });

        // Timestamp
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(`Generated on ${new Date().toLocaleDateString()}`, margin, pageHeight - 10);
        
        return pdf;
    }

    static async convertToPDF(processedData, firmName) {
        try {
            console.log('🔧 CLEAN MANUAL PDF - Starting generation for:', firmName);
            
            const { jsPDF } = await this.loadLibraries();
            const companies = processedData.companies || [];
            const pdf = this.createManualPDF(companies, firmName, jsPDF);
            
            const filename = `${firmName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_Manual_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);
            
            console.log(`✅ Clean manual PDF generated: ${filename}`);
            
        } catch (error) {
            console.error('❌ Manual PDF generation failed:', error);
            throw error;
        }
    }

    static isSupportedBrowser() {
        return true;
    }
}

window.PDFConversionServiceManual = PDFConversionServiceManual;
console.log('✅ Clean Manual PDF service loaded!');