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
     * Extract unique broker/carrier names from company plans
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
     * Format self-funded classification for display in template
     */
    static formatFundingStatus(classification) {
        const statusMap = {
            'self-funded': 'Self-Funded',
            'insured': 'Insured', 
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
        let selfFundedCount = 0;
        let totalCompanies = 0;
        const allBrokers = new Set();
        
        for (const company of companies) {
            totalPremiums += company.total_premiums || 0;
            totalBrokerageFees += company.total_brokerage_fees || 0;
            totalEmployeesCovered += company.total_people_covered || 0;
            
            totalCompanies++;
            const classification = company.self_funded_classification || 'unknown';
            if (classification !== 'insured' && classification !== 'indeterminate' && classification !== 'unknown' && classification !== 'no-data' && classification !== 'error') {
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
            selfFundedCount,
            totalCompanies,
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
        const brokers = this.extractBrokerNames(company.plans || []);
        
        return `
            <tr class="company-row">
                <td class="company-name">${companyName}</td>
                <td class="revenue">-</td>
                <td class="employees">${totalPeopleCovered.toLocaleString()}</td>
                <td class="funding">${this.formatFundingStatus(company.self_funded_classification || 'unknown')}</td>
                <td class="brokers">${brokers}</td>
                <td class="premiums">${this.formatCurrency(totalPremiums)}</td>
                <td class="commissions">${this.formatCurrency(totalBrokerageFees)}</td>
            </tr>`;
    }

    /**
     * Generate total row for summary
     */
    static generateTotalRow(totals) {
        const brokerText = totals.uniqueBrokerCount === 1 
            ? `1 Unique Broker` 
            : `${totals.uniqueBrokerCount} Unique Brokers`;
            
        const fundingText = `${totals.selfFundedCount}/${totals.totalCompanies} self-funded`;
            
        return `
            <tr class="total-row">
                <td class="total-label">TOTAL</td>
                <td class="total-revenue">-</td>
                <td class="total-employees">${totals.totalEmployeesCovered.toLocaleString()}</td>
                <td class="total-funding">${fundingText}</td>
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