/**
 * HTML Report Service
 * Handles HTML report generation and formatting
 */

class HTMLReportService {
    
    /**
     * Format currency with commas and dollar sign
     */
    static formatCurrency(amount) {
        return `$${Math.round(amount).toLocaleString()}`;
    }

    /**
     * Generate CSS styles for the report
     */
    static generateCSS() {
        return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 50px;
            padding: 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .summary {
            background: white;
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        }

        .summary h3 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.3rem;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }

        .summary-item {
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .summary-number {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }

        .table-section {
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 8px 25px rgba(0,0,0,0.08);
        }

        .table-container {
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95rem;
        }

        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 15px;
            text-align: left;
            font-weight: 600;
            border-bottom: none;
        }

        .company-row {
            cursor: pointer;
            transition: all 0.2s ease;
            border-bottom: 1px solid #e9ecef;
        }

        .company-row:hover {
            background-color: #f8f9fa;
        }

        .company-row.expanded {
            background-color: #e3f2fd;
        }

        .company-row td {
            padding: 18px 15px;
            font-weight: 500;
            vertical-align: middle;
        }

        .company-name {
            display: flex;
            align-items: center;
            gap: 10px;
            color: #495057;
            font-weight: 600;
        }

        .expand-arrow {
            width: 0;
            height: 0;
            border-left: 6px solid #667eea;
            border-top: 4px solid transparent;
            border-bottom: 4px solid transparent;
            transition: transform 0.2s ease;
        }

        .expand-arrow.expanded {
            transform: rotate(90deg);
        }

        .detail-rows {
            display: none;
        }

        .detail-rows.expanded {
            display: table-row-group;
        }

        .detail-row {
            background-color: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }

        .detail-row:last-child {
            border-bottom: 2px solid #dee2e6;
        }

        .detail-row td {
            padding: 12px 15px 12px 35px;
            font-size: 0.9rem;
            color: #6c757d;
        }

        .detail-row .plan-name {
            color: #495057;
            font-weight: 500;
        }

        .currency {
            font-weight: 600;
            color: #28a745;
            text-align: right;
        }

        .currency.total {
            color: #0d6efd;
            font-size: 1.05rem;
        }

        .people-count {
            font-weight: 500;
            color: #6f42c1;
            text-align: right;
        }

        .year-badge {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }

        .no-data-badge {
            background: #6c757d;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }

        @media print {
            .expand-arrow { display: none !important; }
            .company-row { cursor: default !important; }
            .detail-rows { display: table-row-group !important; }
        }
        `;
    }

    /**
     * Generate JavaScript for interactive functionality
     */
    static generateJavaScript() {
        return `
        function toggleCompanyDetails(companyId) {
            const detailsElement = document.getElementById('details-' + companyId);
            const arrowElement = document.getElementById('arrow-' + companyId);
            const companyRow = arrowElement.closest('.company-row');
            
            if (detailsElement.classList.contains('expanded')) {
                // Collapse
                detailsElement.classList.remove('expanded');
                arrowElement.classList.remove('expanded');
                companyRow.classList.remove('expanded');
            } else {
                // Expand
                detailsElement.classList.add('expanded');
                arrowElement.classList.add('expanded');
                companyRow.classList.add('expanded');
            }
        }
        `;
    }

    /**
     * Generate summary section HTML
     */
    static generateSummarySection(summary) {
        return `
        <div class="summary">
            <h3>Report Summary</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-number">${summary.total_companies}</div>
                    <div>Total Companies</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">${summary.companies_with_data}</div>
                    <div>Companies with Cost Data</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">${summary.most_recent_year}</div>
                    <div>Most Recent Year</div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate detail rows for a company's plans
     */
    static generateDetailRows(company, companyId, dataYear) {
        if (!company.has_data || !company.plans || company.plans.length === 0) {
            return "";
        }

        let detailRows = `\n        <tbody id="details-${companyId}" class="detail-rows">`;
        
        for (const plan of company.plans) {
            detailRows += `
            <tr class="detail-row">
                <td class="plan-name">${plan.benefit_type} - ${plan.carrier_name}</td>
                <td>${dataYear}</td>
                <td class="currency">${this.formatCurrency(plan.premiums)}</td>
                <td class="currency">${this.formatCurrency(plan.brokerage_fees)}</td>
                <td class="people-count">${plan.people_covered.toLocaleString()}</td>
            </tr>`;
        }
        
        detailRows += `
        </tbody>`;
        
        return detailRows;
    }

    /**
     * Generate HTML for a single company row with expandable details
     */
    static generateCompanyRow(company, index) {
        const companyId = `company-${index}`;
        const companyName = company.company_name;
        const dataYear = company.data_year;
        const hasData = company.has_data;
        const totalPremiums = company.total_premiums;
        const totalBrokerageFees = company.total_brokerage_fees;
        const totalPeopleCovered = company.total_people_covered;
        
        // Generate the main company row
        let yearBadge, onclick, arrowHtml, rowClass;
        if (hasData) {
            yearBadge = `<span class="year-badge">${dataYear}</span>`;
            onclick = `onclick="toggleCompanyDetails('${companyId}')"`;
            arrowHtml = `<div class="expand-arrow" id="arrow-${companyId}"></div>`;
            rowClass = "company-row";
        } else {
            yearBadge = '<span class="no-data-badge">No Data</span>';
            onclick = '';
            arrowHtml = '';
            rowClass = "company-row";
        }
        
        const companyRow = `
            <tr class="${rowClass}" ${onclick}>
                <td>
                    <div class="company-name">
                        ${arrowHtml}
                        ${companyName}
                    </div>
                </td>
                <td>${yearBadge}</td>
                <td class="currency total">${this.formatCurrency(totalPremiums)}</td>
                <td class="currency total">${this.formatCurrency(totalBrokerageFees)}</td>
                <td class="people-count">${totalPeopleCovered.toLocaleString()}</td>
            </tr>`;
        
        // Generate detail rows if there's data
        const detailRows = this.generateDetailRows(company, companyId, dataYear);
        
        return companyRow + detailRows;
    }

    /**
     * Generate table section HTML
     */
    static generateTableSection(companies) {
        let companyRowsHtml = "";
        for (let i = 0; i < companies.length; i++) {
            companyRowsHtml += this.generateCompanyRow(companies[i], i);
        }
        
        return `
        <div class="table-section">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Company Name</th>
                            <th>Data Year</th>
                            <th>Total Premiums</th>
                            <th>Total Brokerage Fees</th>
                            <th>People Covered</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${companyRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    /**
     * Generate header section HTML
     */
    static generateHeaderSection(firmName) {
        return `
        <div class="header">
            <h1>${firmName} Portfolio Companies</h1>
            <p>Insurance Costs & Brokerage Fees Report</p>
        </div>
        `;
    }

    /**
     * Generate complete HTML document structure
     */
    static generateHTMLDocument(firmName, summarySection, tableSection) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${firmName} Portfolio Companies - Insurance Costs Report</title>
    <style>
        ${this.generateCSS()}
    </style>
</head>
<body>
    <div class="container">
        ${this.generateHeaderSection(firmName)}
        ${summarySection}
        ${tableSection}
    </div>

    <script>
        ${this.generateJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Main method to generate complete HTML report
     */
    static generateHTMLReport(processedData) {
        const firmName = processedData.firm_name;
        const summary = processedData.summary;
        const companies = processedData.companies;
        
        // Generate individual sections
        const summarySection = this.generateSummarySection(summary);
        const tableSection = this.generateTableSection(companies);
        
        // Combine into full HTML document
        return this.generateHTMLDocument(firmName, summarySection, tableSection);
    }
}

export { HTMLReportService };