/**
 * Data Processing Service
 * Handles raw JSON data transformation and aggregation
 */

class DataProcessingService {
    
    /**
     * Get the preferred year based on priority: 2023 > 2022 > other years > 2024
     * Only use 2024 if it's the only year available
     */
    static getPreferredYear(availableYears) {
        if (!availableYears || availableYears.length === 0) {
            return null;
        }
        
        // Convert to integers for proper sorting
        const years = availableYears.map(year => parseInt(year)).sort((a, b) => b - a);
        
        // Check for preferred years in order
        if (years.includes(2023)) {
            return "2023";
        } else if (years.includes(2022)) {
            return "2022";
        } else if (years.length === 1 && years.includes(2024)) {
            // Only use 2024 if it's the only option
            return "2024";
        } else {
            // Use the most recent year that's not 2024
            for (const year of years) {
                if (year !== 2024) {
                    return year.toString();
                }
            }
            // If all we have is 2024, use it
            return years[0].toString();
        }
    }

    /**
     * Aggregate Schedule A data for the preferred year
     */
    static aggregateScheduleAData(scheduleADetails, preferredYear) {
        if (!scheduleADetails[preferredYear]) {
            return {
                total_premiums: 0,
                total_brokerage_fees: 0,
                total_people_covered: 0,
                plans: []
            };
        }
        
        const yearData = scheduleADetails[preferredYear];
        let totalPremiums = 0;
        let totalBrokerageFees = 0;
        let totalPeopleCovered = 0;
        const plans = [];
        
        for (const plan of yearData) {
            // Parse monetary values, handling empty strings
            const premiums = parseFloat(plan.totalCharges || "0") || 0;
            const brokerage = parseFloat(plan.brokerCommission || "0") || 0;
            const people = parseInt(plan.personsCovered || "0") || 0;
            
            totalPremiums += premiums;
            totalBrokerageFees += brokerage;
            totalPeopleCovered += people;
            
            plans.push({
                benefit_type: plan.benefitType || "",
                carrier_name: plan.carrierName || "",
                premiums: premiums,
                brokerage_fees: brokerage,
                people_covered: people
            });
        }
        
        return {
            total_premiums: totalPremiums,
            total_brokerage_fees: totalBrokerageFees,
            total_people_covered: totalPeopleCovered,
            plans: plans
        };
    }

    /**
     * Get total active participants for the preferred year from Form 5500 data
     */
    static getTotalParticipants(form5500Records, preferredYear) {
        if (!form5500Records[preferredYear]) {
            return 0;
        }
        
        const yearRecords = form5500Records[preferredYear];
        let totalParticipants = 0;
        
        for (const record of yearRecords) {
            const participants = record.active_participants || 0;
            if (participants) {
                totalParticipants += participants;
            }
        }
        
        return totalParticipants;
    }

    /**
     * Process individual company data
     */
    static processCompanyData(company) {
        const companyName = company.companyName || "Unknown Company";
        
        // Get Schedule A data and available years
        const scheduleA = company.scheduleA || {};
        const scheduleADetails = scheduleA.details || {};
        const availableYears = Object.keys(scheduleADetails);
        
        // Get preferred year
        let preferredYear = this.getPreferredYear(availableYears);
        
        // If no Schedule A data, check Form 5500 years for display purposes
        if (!preferredYear) {
            const form5500 = company.form5500 || {};
            const form5500Years = form5500.years || [];
            if (form5500Years.length > 0) {
                preferredYear = this.getPreferredYear(form5500Years);
            }
        }
        
        // Aggregate the data
        let aggregatedData;
        let hasData;
        if (preferredYear && scheduleADetails[preferredYear]) {
            aggregatedData = this.aggregateScheduleAData(scheduleADetails, preferredYear);
            hasData = true;
        } else {
            aggregatedData = {
                total_premiums: 0,
                total_brokerage_fees: 0,
                total_people_covered: 0,
                plans: []
            };
            hasData = false;
        }
        
        // Get total participants from Form 5500 if available
        const form5500Records = (company.form5500 || {}).records || {};
        const totalParticipants = preferredYear ? this.getTotalParticipants(form5500Records, preferredYear) : 0;
        
        return {
            company_name: companyName,
            data_year: preferredYear,
            has_data: hasData,
            total_premiums: aggregatedData.total_premiums,
            total_brokerage_fees: aggregatedData.total_brokerage_fees,
            total_people_covered: aggregatedData.total_people_covered,
            total_participants: totalParticipants,
            plans: aggregatedData.plans
        };
    }

    /**
     * Extract and clean firm name
     */
    static extractFirmName(firmName) {
        if (!firmName || firmName === 'Unknown') {
            return "PE Firm";
        }
        
        // Clean up firm name
        return firmName
            .replace(/_research_results.*$/, "")
            .replace(/_/g, " ")
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Calculate summary statistics from processed companies
     */
    static calculateSummaryStatistics(processedCompanies) {
        const totalCompanies = processedCompanies.length;
        const companiesWithData = processedCompanies.filter(company => company.has_data).length;
        
        // Determine most recent year from available data
        const yearsFound = new Set();
        for (const company of processedCompanies) {
            if (company.data_year) {
                yearsFound.add(company.data_year);
            }
        }
        
        let mostRecentYear = "2023"; // Default
        if (yearsFound.size > 0) {
            // Get the most recent year that's not 2024, or 2024 if it's all we have
            const sortedYears = Array.from(yearsFound).sort((a, b) => parseInt(b) - parseInt(a));
            if (yearsFound.has("2023")) {
                mostRecentYear = "2023";
            } else if (yearsFound.has("2022")) {
                mostRecentYear = "2022";
            } else {
                mostRecentYear = sortedYears[0];
            }
        }
        
        return {
            total_companies: totalCompanies,
            companies_with_data: companiesWithData,
            most_recent_year: mostRecentYear
        };
    }

    /**
     * Main method to process PE firm data from raw JSON
     */
    static processJSONData(rawData, firmName) {
        // Extract or clean firm name
        const cleanFirmName = this.extractFirmName(firmName);
        
        // Process each company
        const processedCompanies = [];
        for (const company of rawData.companies || []) {
            const processedCompany = this.processCompanyData(company);
            processedCompanies.push(processedCompany);
        }
        
        // Calculate summary statistics
        const summary = this.calculateSummaryStatistics(processedCompanies);
        
        return {
            firm_name: cleanFirmName,
            timestamp: rawData.timestamp,
            summary: summary,
            companies: processedCompanies
        };
    }
}

export { DataProcessingService };