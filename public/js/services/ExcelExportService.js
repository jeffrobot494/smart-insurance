/**
 * Excel Export Service
 * Handles Excel/spreadsheet generation and download using SheetJS library
 * Requires SheetJS (xlsx) library to be loaded: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js
 */

class ExcelExportService {
    
    /**
     * Check if SheetJS library is available
     */
    static isSheetJSAvailable() {
        return typeof XLSX !== 'undefined';
    }

    /**
     * Load SheetJS library dynamically if not already loaded
     */
    static async loadSheetJS() {
        if (this.isSheetJSAvailable()) {
            return true;
        }
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
            script.onload = () => {
                if (this.isSheetJSAvailable()) {
                    console.log('SheetJS library loaded successfully');
                    resolve(true);
                } else {
                    reject(new Error('SheetJS failed to load'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load SheetJS library'));
            document.head.appendChild(script);
        });
    }

    /**
     * Format revenue for Excel display (reuse HTMLReportService logic)
     */
    static formatRevenueDisplay(amount) {
        if (!amount || amount === 0) return '-';
        
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(numAmount)) return '-';
        
        if (numAmount >= 1000000000) {
            const billions = (numAmount / 1000000000);
            return `$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(1)}B`;
        } else if (numAmount >= 1000000) {
            const millions = (numAmount / 1000000);
            return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
        } else if (numAmount >= 1000) {
            const thousands = (numAmount / 1000);
            return `$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
        } else {
            return `$${numAmount.toLocaleString()}`;
        }
    }

    /**
     * Format currency for Excel (used for totals)
     */
    static formatCurrency(amount) {
        return `$${Math.round(amount).toLocaleString()}`;
    }

    /**
     * Format self-funded classification for display
     */
    static formatFundingStatus(classification) {
        const statusMap = {
            'self-funded': 'Self-Funded',
            'insured': 'Fully Insured', 
            'partially-self-funded': 'Partially Self-Funded',
            'indeterminate': 'Unknown',
            'no-medical-plans': 'No Medical Plans',
            'no-data': 'No Data',
            'error': 'Error',
            'unknown': 'Unknown'
        };
        
        return statusMap[classification] || 'Unknown';
    }

    /**
     * Extract unique broker names from company plans
     */
    static extractBrokerNames(plans) {
        if (!plans || plans.length === 0) {
            return "-";
        }
        
        const uniqueBrokers = new Set();
        for (const plan of plans) {
            if (plan.carrier_name && plan.carrier_name.trim()) {
                uniqueBrokers.add(plan.carrier_name.trim());
            }
        }
        
        if (uniqueBrokers.size === 0) {
            return "-";
        }
        
        return Array.from(uniqueBrokers).join(", ");
    }

    /**
     * Calculate totals across all companies (reuse HTMLReportService logic)
     */
    static calculateTotals(companies) {
        let totalPremiums = 0;
        let totalBrokerageFees = 0;
        let totalEmployeesCovered = 0;
        let totalRevenue = 0;
        let selfFundedCount = 0;
        let totalCompanies = 0;
        const allBrokers = new Set();
        
        for (const company of companies) {
            totalPremiums += company.total_premiums || 0;
            totalBrokerageFees += company.total_brokerage_fees || 0;
            totalEmployeesCovered += company.total_people_covered || 0;
            
            // Sum up revenue - convert to numeric for totaling
            if (company.annual_revenue_usd) {
                const numRevenue = typeof company.annual_revenue_usd === 'string' ? 
                    parseFloat(company.annual_revenue_usd) : company.annual_revenue_usd;
                if (!isNaN(numRevenue)) {
                    totalRevenue += numRevenue;
                }
            }
            
            totalCompanies++;
            const classification = company.self_funded_classification || 'unknown';
            if (classification !== 'insured' && classification !== 'indeterminate' && 
                classification !== 'unknown' && classification !== 'no-data' && classification !== 'error') {
                selfFundedCount++;
            }
            
            // Collect unique brokers across all companies
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
            totalBrokerageFees,
            totalEmployeesCovered,
            totalRevenue,
            selfFundedCount,
            totalCompanies,
            uniqueBrokerCount: allBrokers.size,
            uniqueBrokers: Array.from(allBrokers)
        };
    }

    /**
     * Convert processed data to Excel worksheet data
     */
    static prepareWorksheetData(processedData) {
        // Define headers
        const headers = [
            'Company Name',
            'Revenue', 
            'Employees',
            'Funding Status',
            'Brokers',
            'Premiums',
            'Commissions'
        ];

        // Prepare data rows
        const dataRows = [];
        
        // Add company rows
        for (const company of processedData.companies) {
            const row = [
                company.company_name || 'Unknown Company',
                this.formatRevenueDisplay(company.annual_revenue_usd),
                (company.total_people_covered || 0).toLocaleString(),
                this.formatFundingStatus(company.self_funded_classification || 'unknown'),
                this.extractBrokerNames(company.plans || []),
                this.formatCurrency(company.total_premiums || 0),
                this.formatCurrency(company.total_brokerage_fees || 0)
            ];
            dataRows.push(row);
        }
        
        // Calculate totals
        const totals = this.calculateTotals(processedData.companies);
        
        // Add empty row before totals for readability
        dataRows.push(['', '', '', '', '', '', '']);
        
        // Add totals row
        const brokerText = totals.uniqueBrokerCount === 1 
            ? `1 Unique Broker` 
            : `${totals.uniqueBrokerCount} Unique Brokers`;
        const fundingText = `${totals.selfFundedCount}/${totals.totalCompanies} self-funded`;
        const totalRevenueDisplay = totals.totalRevenue > 0 ? 
            this.formatCurrency(totals.totalRevenue) : '-';
            
        const totalRow = [
            'TOTAL',
            totalRevenueDisplay,
            totals.totalEmployeesCovered.toLocaleString(),
            fundingText,
            brokerText,
            this.formatCurrency(totals.totalPremiums),
            this.formatCurrency(totals.totalBrokerageFees)
        ];
        dataRows.push(totalRow);

        // Combine headers and data
        return [headers, ...dataRows];
    }

    /**
     * Create Excel workbook and worksheet
     */
    static createWorkbook(processedData) {
        if (!this.isSheetJSAvailable()) {
            throw new Error('SheetJS library is not available');
        }

        // Prepare worksheet data
        const worksheetData = this.prepareWorksheetData(processedData);
        
        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Set column widths for better readability
        const columnWidths = [
            { wpx: 200 }, // Company Name
            { wpx: 100 }, // Revenue  
            { wpx: 80 },  // Employees
            { wpx: 120 }, // Funding Status
            { wpx: 200 }, // Brokers
            { wpx: 100 }, // Premiums
            { wpx: 100 }  // Commissions
        ];
        worksheet['!cols'] = columnWidths;

        // Create workbook
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Insurance Report');

        return workbook;
    }

    /**
     * Generate and download Excel file
     */
    static async generateExcelReport(processedData) {
        try {
            console.log('Starting Excel export generation...');
            
            // Ensure SheetJS is loaded
            await this.loadSheetJS();
            
            // Create workbook
            const workbook = this.createWorkbook(processedData);
            
            // Generate filename
            const firmName = processedData.firm_name || 'PE_Firm';
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            const filename = `${firmName.replace(/\s+/g, '_')}_Insurance_Report_${timestamp}.xlsx`;
            
            // Write and download file
            XLSX.writeFile(workbook, filename);
            
            console.log(`Excel report downloaded: ${filename}`);
            
            return {
                success: true,
                filename: filename,
                recordCount: processedData.companies.length
            };
            
        } catch (error) {
            console.error('Failed to generate Excel report:', error);
            
            // Provide user-friendly error messages
            let userMessage = 'Failed to generate Excel report. ';
            if (error.message.includes('SheetJS')) {
                userMessage += 'Required library could not be loaded. Please check your internet connection.';
            } else {
                userMessage += 'Please try again or contact support if the problem persists.';
            }
            
            throw new Error(userMessage);
        }
    }

    /**
     * Get export capabilities and browser info
     */
    static getCapabilities() {
        return {
            sheetJSAvailable: this.isSheetJSAvailable(),
            features: {
                autoColumnWidth: true,
                formatting: true,
                totalsRow: true,
                dateTimestamp: true
            },
            supportedFormats: ['xlsx', 'csv'],
            maxRows: 1048576, // Excel limit
            maxColumns: 16384  // Excel limit
        };
    }
}

// Make available globally
window.ExcelExportService = ExcelExportService;