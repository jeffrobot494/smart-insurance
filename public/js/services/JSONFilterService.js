/**
 * JSON Filter Service
 * Filters pipeline data to remove unused fields for smaller download files
 */

class JSONFilterService {

    /**
     * Filter out unused fields from pipeline data for JSON download
     * Removes fields that are never used in HTML/Excel reports
     */
    static filterPipelineForDownload(pipelineData) {
        if (!pipelineData || typeof pipelineData !== 'object') {
            return pipelineData;
        }

        const filteredPipeline = {
            // Keep essential pipeline fields
            pipeline_id: pipelineData.pipeline_id,
            firm_name: pipelineData.firm_name,
            status: pipelineData.status,
            companies: []
        };

        // Process each company
        if (pipelineData.companies && Array.isArray(pipelineData.companies)) {
            filteredPipeline.companies = pipelineData.companies.map(company => {
                return this.filterCompany(company);
            });
        }

        // Keep only updated_at timestamp (most useful for tracking)
        if (pipelineData.updated_at) {
            filteredPipeline.updated_at = pipelineData.updated_at;
        }

        // Keep error if present
        if (pipelineData.error) {
            filteredPipeline.error = pipelineData.error;
        }

        return filteredPipeline;
    }

    /**
     * Filter individual company data
     */
    static filterCompany(company) {
        const filteredCompany = {
            // Core company fields used in reports
            name: company.name,
            exited: company.exited,
            annual_revenue_usd: company.annual_revenue_usd,
            revenue_year: company.revenue_year,
            legal_entity_name: company.legal_entity_name
        };

        // Process form5500_data if present
        if (company.form5500_data) {
            filteredCompany.form5500_data = this.filterForm5500Data(company.form5500_data);
        }

        // Add processed fields that are used in reports
        if (company.total_premiums !== undefined) {
            filteredCompany.total_premiums = company.total_premiums;
        }
        if (company.total_brokerage_fees !== undefined) {
            filteredCompany.total_brokerage_fees = company.total_brokerage_fees;
        }
        if (company.total_people_covered !== undefined) {
            filteredCompany.total_people_covered = company.total_people_covered;
        }
        if (company.self_funded_classification !== undefined) {
            filteredCompany.self_funded_classification = company.self_funded_classification;
        }
        if (company.brokers !== undefined) {
            filteredCompany.brokers = company.brokers;
        }
        if (company.plans !== undefined) {
            filteredCompany.plans = company.plans;
        }

        return filteredCompany;
    }

    /**
     * Filter form5500_data to remove unused metadata
     */
    static filterForm5500Data(form5500Data) {
        const filtered = {
            ein: form5500Data.ein
        };

        // Keep scheduleA data (used in reports)
        if (form5500Data.scheduleA) {
            filtered.scheduleA = form5500Data.scheduleA;
        }

        // Keep simple self_funded classification (used in reports)
        if (form5500Data.self_funded !== undefined) {
            filtered.self_funded = form5500Data.self_funded;
        }

        // REMOVE: Raw form5500 object (never used in reports)
        // REMOVE: self_funded_analysis object (detailed analysis never displayed)
        // REMOVE: form5500_match object (metadata never displayed)

        return filtered;
    }

    /**
     * Get statistics about filtering savings
     */
    static getFilteringStats(originalData, filteredData) {
        const originalString = JSON.stringify(originalData);
        const filteredString = JSON.stringify(filteredData);

        const originalSize = originalString.length;
        const filteredSize = filteredString.length;
        const reduction = originalSize - filteredSize;
        const reductionPercent = Math.round((reduction / originalSize) * 100);

        return {
            originalSize,
            filteredSize,
            reduction,
            reductionPercent,
            originalSizeKB: Math.round(originalSize / 1024),
            filteredSizeKB: Math.round(filteredSize / 1024)
        };
    }

    /**
     * Validate that filtering preserves essential data for reports
     */
    static validateFilteredData(filteredData) {
        const issues = [];

        if (!filteredData.pipeline_id) {
            issues.push('Missing pipeline_id');
        }

        if (!filteredData.firm_name) {
            issues.push('Missing firm_name');
        }

        if (!filteredData.companies || !Array.isArray(filteredData.companies)) {
            issues.push('Missing or invalid companies array');
        } else {
            // Check first company for essential fields
            const firstCompany = filteredData.companies[0];
            if (firstCompany) {
                if (!firstCompany.name) {
                    issues.push('Company missing name field');
                }

                if (firstCompany.form5500_data && !firstCompany.form5500_data.scheduleA) {
                    issues.push('Company missing scheduleA data');
                }
            }
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }
}

// Make available globally
window.JSONFilterService = JSONFilterService;