/**
 * TXT Export Service
 * Handles fixed-width text report generation and download for pipeline data
 * Optimized for LLM parsing with significant token reduction vs JSON
 */

class TXTExportService {

    /**
     * Format currency amounts for display
     */
    static formatCurrency(amount) {
        if (!amount || amount === 0) return '$0';
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(numAmount)) return '$0';
        return `$${Math.round(numAmount).toLocaleString()}`;
    }

    /**
     * Format revenue for display (e.g., $25M, $1.5B)
     */
    static formatRevenue(amount) {
        if (!amount || amount === 0) return '$0';
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(numAmount)) return '$0';

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
     * Format self-funded status for display
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
     * Generate header section
     */
    static generateHeader(pipelineData) {
        const lines = [];
        lines.push('===============================================================================');
        lines.push('PIPELINE DATA REPORT');
        lines.push('===============================================================================');
        lines.push(`Pipeline ID: ${pipelineData.pipeline_id || 'N/A'}`);
        lines.push(`Firm Name:   ${pipelineData.firm_name || 'N/A'}`);
        lines.push(`Status:      ${pipelineData.status || 'N/A'}`);

        if (pipelineData.updated_at) {
            lines.push(`Updated:     ${pipelineData.updated_at}`);
        }

        lines.push('');
        return lines;
    }

    /**
     * Generate company section
     */
    static generateCompanySection(company) {
        const lines = [];

        lines.push('===============================================================================');
        lines.push('PORTFOLIO COMPANY');
        lines.push('===============================================================================');
        lines.push('');
        lines.push(`COMPANY: ${company.name || 'Unknown'}`);
        lines.push(`LEGAL:   ${company.legal_entity_name || 'N/A'}`);

        if (company.form5500_data && company.form5500_data.ein) {
            lines.push(`EIN:     ${company.form5500_data.ein}`);
        }

        if (company.annual_revenue_usd) {
            const revenueYear = company.revenue_year ? ` (${company.revenue_year})` : '';
            lines.push(`REVENUE: ${this.formatRevenue(company.annual_revenue_usd)}${revenueYear}`);
        }

        lines.push(`STATUS:  ${company.exited ? 'Exited' : 'Active'}`);

        if (company.form5500_data && company.form5500_data.self_funded) {
            lines.push(`FUNDING: ${this.formatFundingStatus(company.form5500_data.self_funded)}`);
        }

        lines.push('');
        return lines;
    }

    /**
     * Generate insurance coverage section
     */
    static generateCoverageSection(company) {
        const lines = [];

        if (!company.form5500_data || !company.form5500_data.scheduleA || !company.form5500_data.scheduleA.details) {
            return lines;
        }

        lines.push('-------------------------------------------------------------------------------');
        lines.push('INSURANCE COVERAGE HISTORY');
        lines.push('-------------------------------------------------------------------------------');
        lines.push('');

        const scheduleADetails = company.form5500_data.scheduleA.details;
        const years = Object.keys(scheduleADetails).sort((a, b) => a.localeCompare(b));

        for (const year of years) {
            const plans = scheduleADetails[year];
            if (!plans || plans.length === 0) continue;

            lines.push(`=== ${year} COVERAGE ===`);

            plans.forEach((plan, index) => {
                lines.push(`Plan ${index + 1}: ${plan.carrierName || 'Unknown Carrier'}`);

                if (plan.benefitType) {
                    lines.push(`  Benefit Type:     ${plan.benefitType}`);
                }

                if (plan.totalCharges) {
                    lines.push(`  Total Premiums:   ${this.formatCurrency(parseFloat(plan.totalCharges))}`);
                }

                if (plan.personsCovered) {
                    lines.push(`  People Covered:   ${parseInt(plan.personsCovered).toLocaleString()}`);
                }

                if (plan.brokers && plan.brokers.length > 0) {
                    const brokerLines = plan.brokers.map(broker => {
                        const commission = this.formatCurrency(parseFloat(broker.commission || 0));
                        const fees = this.formatCurrency(parseFloat(broker.fees || 0));
                        return `${broker.name || 'Unknown'} (Commission: ${commission}, Fees: ${fees})`;
                    });

                    lines.push(`  Brokers:          ${brokerLines[0]}`);
                    brokerLines.slice(1).forEach(brokerLine => {
                        lines.push(`                    ${brokerLine}`);
                    });
                }

                lines.push('');
            });
        }

        return lines;
    }

    /**
     * Generate complete fixed-width text report
     */
    static generateFixedWidthReport(pipelineData) {
        try {
            const lines = [];

            // Add header
            lines.push(...this.generateHeader(pipelineData));

            // Process each company
            if (pipelineData.companies && Array.isArray(pipelineData.companies)) {
                pipelineData.companies.forEach(company => {
                    lines.push(...this.generateCompanySection(company));
                    lines.push(...this.generateCoverageSection(company));
                });
            }

            // Add footer
            lines.push('===============================================================================');
            lines.push('END OF REPORT');
            lines.push('===============================================================================');

            return lines.join('\n');

        } catch (error) {
            console.error('Failed to generate fixed-width report:', error);
            throw new Error('Report generation failed. Please try again.');
        }
    }

    /**
     * Download text file
     */
    static downloadTXTFile(textContent, firmName) {
        try {
            console.log('Starting TXT download for:', firmName);

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            const safeFirmName = firmName ? firmName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') : 'PE_Firm';
            const filename = `${safeFirmName}_Pipeline_Report_${timestamp}.txt`;

            // Create blob with plain text MIME type
            const blob = new Blob([textContent], {
                type: 'text/plain;charset=utf-8'
            });
            const url = URL.createObjectURL(blob);

            // Create temporary download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.style.display = 'none';

            // Trigger download
            document.body.appendChild(downloadLink);
            downloadLink.click();

            // Cleanup
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);

            console.log(`TXT report downloaded successfully: ${filename}`);

            return {
                success: true,
                filename: filename,
                size: textContent.length,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Failed to download TXT file:', error);
            throw new Error('Failed to download report file. Please try again.');
        }
    }

    /**
     * Validate pipeline data
     */
    static validatePipelineData(pipelineData) {
        if (!pipelineData) {
            return { valid: false, error: 'No pipeline data provided' };
        }

        if (!pipelineData.pipeline_id) {
            return { valid: false, error: 'Missing pipeline ID' };
        }

        if (!pipelineData.firm_name) {
            return { valid: false, error: 'Missing firm name' };
        }

        return { valid: true };
    }

    /**
     * Generate and download TXT report with validation
     */
    static async downloadTXTWithValidation(pipelineData, firmName) {
        try {
            // Validate data first
            const validation = this.validatePipelineData(pipelineData);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            // Generate text report
            const textContent = this.generateFixedWidthReport(pipelineData);

            // Log size comparison with JSON
            const jsonString = JSON.stringify(pipelineData, null, 2);
            const jsonSize = jsonString.length;
            const txtSize = textContent.length;
            const reduction = Math.round(((jsonSize - txtSize) / jsonSize) * 100);

            console.log(`TXT format reduced size by ${reduction}% (${Math.round(jsonSize/1024)}KB → ${Math.round(txtSize/1024)}KB)`);

            // Download the file
            return this.downloadTXTFile(textContent, firmName);

        } catch (error) {
            console.error('TXT download with validation failed:', error);
            throw error;
        }
    }

    /**
     * Get service capabilities
     */
    static getCapabilities() {
        return {
            supportedFormats: ['txt'],
            features: {
                fixedWidth: true,
                humanReadable: true,
                llmOptimized: true,
                tokenEfficient: true,
                singleFile: true
            },
            estimatedSavings: {
                fileSize: '60%',
                tokens: '46%'
            },
            browserSupport: {
                download: typeof document !== 'undefined' && document.createElement,
                blobUrls: typeof URL !== 'undefined' && URL.createObjectURL
            }
        };
    }
}

// Make available globally
window.TXTExportService = TXTExportService;