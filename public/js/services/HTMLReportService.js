/**
 * HTML Report Service
 * Handles HTML report generation and formatting using templates
 */

class HTMLReportService {
    
    /**
     * Format currency with commas and dollar sign
     */
    static formatCurrency(amount) {
        return `$${Math.round(amount).toLocaleString()}`;
    }

    /**
     * Format integer revenue to human-readable string (e.g., 25000000 -> "$25M")
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
     * Parse revenue string and convert to numeric value
     * Handles formats like "$26.7 million", "$100M", "$50.5B", etc.
     */
    static parseRevenueToNumber(revenueString) {
        if (!revenueString || revenueString === '-') return 0;
        
        // Convert to uppercase and remove spaces for easier parsing
        const cleanString = revenueString.toString().toUpperCase().replace(/\s+/g, '');
        
        // Extract the numeric part
        const numericMatch = cleanString.match(/[\d.]+/);
        if (!numericMatch) return 0;
        
        const numericValue = parseFloat(numericMatch[0]);
        if (isNaN(numericValue)) return 0;
        
        // Check for multipliers
        if (cleanString.includes('BILLION') || cleanString.includes('B')) {
            return numericValue * 1000000000;
        } else if (cleanString.includes('MILLION') || cleanString.includes('M')) {
            return numericValue * 1000000;
        } else if (cleanString.includes('THOUSAND') || cleanString.includes('K')) {
            return numericValue * 1000;
        } else {
            return numericValue;
        }
    }

    /**
     * Extract unique carrier names from company plans
     */
    static extractCarrierNames(plans) {
        if (!plans || plans.length === 0) {
            return "-";
        }
        
        const uniqueCarriers = new Set();
        for (const plan of plans) {
            if (plan.carrier_name && plan.carrier_name.trim()) {
                uniqueCarriers.add(plan.carrier_name.trim());
            }
        }
        
        if (uniqueCarriers.size === 0) {
            return "-";
        }
        
        return Array.from(uniqueCarriers).join(", ");
    }

    /**
     * Extract broker names from company broker data
     */
    static extractBrokerNames(company) {
        if (company.brokers && Array.isArray(company.brokers) && company.brokers.length > 0) {
            return company.brokers.join(", ");
        }
        
        return "-";
    }

    /**
     * Format self-funded classification for display in template
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
     * Calculate totals across all companies
     */
    static calculateTotals(companies) {
        let totalPremiums = 0;
        let totalBrokerageFees = 0;
        let totalEmployeesCovered = 0;
        let totalRevenue = 0;
        let selfFundedCount = 0;
        let totalCompanies = 0;
        const allCarriers = new Set();
        const allBrokers = new Set();
        
        for (const company of companies) {
            totalPremiums += company.total_premiums || 0;
            totalBrokerageFees += company.total_brokerage_fees || 0;
            totalEmployeesCovered += company.total_people_covered || 0;
            
            // Sum up revenue using our parsing method
            totalRevenue += this.parseRevenueToNumber(company.annual_revenue_usd);
            
            totalCompanies++;
            const classification = company.self_funded_classification || 'unknown';
            if (classification !== 'insured' && classification !== 'indeterminate' && classification !== 'unknown' && classification !== 'no-data' && classification !== 'error' && classification !== 'no-medical-plans') {
                selfFundedCount++;
            }
            
            // Collect unique carriers across all companies
            if (company.plans) {
                for (const plan of company.plans) {
                    if (plan.carrier_name && plan.carrier_name.trim()) {
                        allCarriers.add(plan.carrier_name.trim());
                    }
                }
            }
            
            // Collect unique brokers across all companies
            if (company.brokers && Array.isArray(company.brokers)) {
                for (const broker of company.brokers) {
                    if (broker && broker.trim()) {
                        allBrokers.add(broker.trim());
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
            uniqueCarrierCount: allCarriers.size,
            uniqueCarriers: Array.from(allCarriers),
            uniqueBrokerCount: allBrokers.size,
            uniqueBrokers: Array.from(allBrokers)
        };
    }





    /**
     * Generate HTML for a single company row
     */
    static generateCompanyRow(company, index) {
        const companyName = company.company_name;
        const totalPremiums = company.total_premiums || 0;
        const totalBrokerageFees = company.total_brokerage_fees || 0;
        const totalPeopleCovered = company.total_people_covered || 0;
        const carriers = this.extractCarrierNames(company.plans || []);
        const brokers = this.extractBrokerNames(company);
        
        // Format revenue from integer to human-readable string (e.g., 25000000 -> "$25M")
        const revenue = this.formatRevenueDisplay(company.annual_revenue_usd);
        
        return `
            <tr class="company-row">
                <td class="company-name">${companyName}</td>
                <td class="revenue">${revenue}</td>
                <td class="employees">${totalPeopleCovered.toLocaleString()}</td>
                <td class="funding">${this.formatFundingStatus(company.self_funded_classification || 'unknown')}</td>
                <td class="carriers">${carriers}</td>
                <td class="brokers">${brokers}</td>
                <td class="premiums">${this.formatCurrency(totalPremiums)}</td>
                <td class="commissions">${this.formatCurrency(totalBrokerageFees)}</td>
            </tr>`;
    }

    /**
     * Generate total row for summary
     */
    static generateTotalRow(totals) {
        const carrierText = totals.uniqueCarrierCount === 1 
            ? `1 Unique Carrier` 
            : `${totals.uniqueCarrierCount} Unique Carriers`;
            
        const brokerText = totals.uniqueBrokerCount === 1 
            ? `1 Unique Broker` 
            : `${totals.uniqueBrokerCount} Unique Brokers`;
            
        const fundingText = `${totals.selfFundedCount}/${totals.totalCompanies} self-funded`;
        
        // Format total revenue, showing "-" if no revenue data available
        const totalRevenueDisplay = totals.totalRevenue > 0 ? 
            this.formatCurrency(totals.totalRevenue) : '-';
            
        return `
            <tr class="total-row">
                <td class="total-label">TOTAL</td>
                <td class="total-revenue">${totalRevenueDisplay}</td>
                <td class="total-employees">${totals.totalEmployeesCovered.toLocaleString()}</td>
                <td class="total-funding">${fundingText}</td>
                <td class="total-carriers">${carrierText}</td>
                <td class="total-brokers">${brokerText}</td>
                <td class="total-premiums">${this.formatCurrency(totals.totalPremiums)}</td>
                <td class="total-commissions">${this.formatCurrency(totals.totalBrokerageFees)}</td>
            </tr>`;
    }




    /**
     * Main method to generate complete HTML report using templates
     */
    static async generateHTMLReport(processedData, templateName = 'default') {
        try {
            // Load the template
            const template = await window.TemplateLoader.loadTemplate(templateName);
            window.TemplateLoader.validateTemplate(template);
            
            // Generate content sections
            let companyRows = "";
            for (let i = 0; i < processedData.companies.length; i++) {
                companyRows += this.generateCompanyRow(processedData.companies[i], i);
            }
            
            // Calculate totals and add total row
            const totals = this.calculateTotals(processedData.companies);
            companyRows += this.generateTotalRow(totals);
            
            // Create template variables
            const variables = window.TemplateLoader.createTemplateVariables(processedData, {
                styles: template.css,
                summarySection: "",
                companyRows: companyRows,
                javascript: ""
            });
            
            // Process template with variables and return both HTML and config
            const htmlContent = window.TemplateLoader.processTemplate(template, variables);
            return {
                html: htmlContent,
                config: template.config
            };
            
        } catch (error) {
            console.error('Failed to generate HTML report with template:', error);
            // Fallback to old method if template loading fails
            console.warn('Falling back to legacy HTML generation');
            return {
                html: this.generateLegacyHTMLReport(processedData),
                config: { pdfSettings: { orientation: 'portrait' } }
            };
        }
    }

    
    /**
     * Legacy HTML report generation (fallback)
     */
    static generateLegacyHTMLReport(processedData) {
        throw new Error('Template system failed and legacy methods have been removed. Please check template files.');
    }
}

// Make available globally
window.HTMLReportService = HTMLReportService;