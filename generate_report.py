#!/usr/bin/env python3
"""
HTML Report Generator for PE Firm Insurance Reports
Generates interactive HTML reports from processed JSON data
"""

import json
import sys
import argparse
from typing import Dict, List, Any
from pathlib import Path


def format_currency(amount: float) -> str:
    """Format currency with commas and dollar sign"""
    return f"${amount:,.0f}"


def generate_company_row(company: Dict[str, Any], index: int) -> str:
    """Generate HTML for a single company row with expandable details"""
    company_id = f"company-{index}"
    company_name = company["company_name"]
    data_year = company["data_year"]
    has_data = company["has_data"]
    total_premiums = company["total_premiums"]
    total_brokerage_fees = company["total_brokerage_fees"]
    total_people_covered = company["total_people_covered"]
    plans = company["plans"]
    
    # Generate the main company row
    if has_data:
        year_badge = f'<span class="year-badge">{data_year}</span>'
        onclick = f'onclick="toggleCompanyDetails(\'{company_id}\')"'
        arrow_html = f'<div class="expand-arrow" id="arrow-{company_id}"></div>'
        row_class = "company-row"
    else:
        year_badge = '<span class="no-data-badge">No Data</span>'
        onclick = ''
        arrow_html = ''
        row_class = "company-row"
    
    company_row = f'''
        <tr class="{row_class}" {onclick}>
            <td>
                <div class="company-name">
                    {arrow_html}
                    {company_name}
                </div>
            </td>
            <td>{year_badge}</td>
            <td class="currency total">{format_currency(total_premiums)}</td>
            <td class="currency total">{format_currency(total_brokerage_fees)}</td>
            <td class="people-count">{total_people_covered:,}</td>
        </tr>'''
    
    # Generate detail rows if there's data
    detail_rows = ""
    if has_data and plans:
        detail_rows = f'''
        <tbody id="details-{company_id}" class="detail-rows">'''
        
        for plan in plans:
            detail_rows += f'''
            <tr class="detail-row">
                <td class="plan-name">{plan["benefit_type"]} - {plan["carrier_name"]}</td>
                <td>{data_year}</td>
                <td class="currency">{format_currency(plan["premiums"])}</td>
                <td class="currency">{format_currency(plan["brokerage_fees"])}</td>
                <td class="people-count">{plan["people_covered"]:,}</td>
            </tr>'''
        
        detail_rows += '''
        </tbody>'''
    
    return company_row + detail_rows


def generate_html_report(processed_data: Dict[str, Any]) -> str:
    """Generate the complete HTML report"""
    firm_name = processed_data["firm_name"]
    summary = processed_data["summary"]
    companies = processed_data["companies"]
    
    # Generate all company rows
    company_rows_html = ""
    for i, company in enumerate(companies):
        company_rows_html += generate_company_row(company, i)
    
    html_template = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{firm_name} Portfolio Companies - Insurance Costs Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
            padding: 40px 20px;
        }}

        .header {{
            text-align: center;
            margin-bottom: 50px;
            padding: 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }}

        .header h1 {{
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 10px;
        }}

        .header p {{
            font-size: 1.1rem;
            opacity: 0.9;
        }}

        .summary {{
            background: white;
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        }}

        .summary h3 {{
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.3rem;
        }}

        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }}

        .summary-item {{
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }}

        .summary-number {{
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }}

        .table-section {{
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 8px 25px rgba(0,0,0,0.08);
        }}

        .table-container {{
            overflow-x: auto;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95rem;
        }}

        th {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 15px;
            text-align: left;
            font-weight: 600;
            border-bottom: none;
        }}

        .company-row {{
            cursor: pointer;
            transition: all 0.2s ease;
            border-bottom: 1px solid #e9ecef;
        }}

        .company-row:hover {{
            background-color: #f8f9fa;
        }}

        .company-row.expanded {{
            background-color: #e3f2fd;
        }}

        .company-row td {{
            padding: 18px 15px;
            font-weight: 500;
            vertical-align: middle;
        }}

        .company-name {{
            display: flex;
            align-items: center;
            gap: 10px;
            color: #495057;
            font-weight: 600;
        }}

        .expand-arrow {{
            width: 0;
            height: 0;
            border-left: 6px solid #667eea;
            border-top: 4px solid transparent;
            border-bottom: 4px solid transparent;
            transition: transform 0.2s ease;
        }}

        .expand-arrow.expanded {{
            transform: rotate(90deg);
        }}

        .detail-rows {{
            display: none;
        }}

        .detail-rows.expanded {{
            display: table-row-group;
        }}

        .detail-row {{
            background-color: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }}

        .detail-row:last-child {{
            border-bottom: 2px solid #dee2e6;
        }}

        .detail-row td {{
            padding: 12px 15px 12px 35px;
            font-size: 0.9rem;
            color: #6c757d;
        }}

        .detail-row .plan-name {{
            color: #495057;
            font-weight: 500;
        }}

        .currency {{
            font-weight: 600;
            color: #28a745;
            text-align: right;
        }}

        .currency.total {{
            color: #0d6efd;
            font-size: 1.05rem;
        }}

        .people-count {{
            font-weight: 500;
            color: #6f42c1;
            text-align: right;
        }}

        .year-badge {{
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }}

        .no-data-badge {{
            background: #6c757d;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }}

        .benefit-type {{
            font-weight: 500;
            color: #495057;
        }}

        .carrier-name {{
            color: #667eea;
            font-weight: 500;
        }}

        @media (max-width: 768px) {{
            .container {{
                padding: 20px 10px;
                max-width: 100%;
            }}
            
            .header h1 {{
                font-size: 2rem;
            }}
            
            table {{
                font-size: 0.85rem;
            }}
            
            th, td {{
                padding: 12px 8px;
            }}
            
            .detail-row td {{
                padding: 10px 8px 10px 20px;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{firm_name} Portfolio Companies</h1>
            <p>Insurance Costs & Brokerage Fees Report</p>
        </div>

        <div class="summary">
            <h3>Report Summary</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-number">{summary["total_companies"]}</div>
                    <div>Total Companies</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">{summary["companies_with_data"]}</div>
                    <div>Companies with Cost Data</div>
                </div>
                <div class="summary-item">
                    <div class="summary-number">{summary["most_recent_year"]}</div>
                    <div>Most Recent Year</div>
                </div>
            </div>
        </div>

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
                        {company_rows_html}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        function toggleCompanyDetails(companyId) {{
            const detailsElement = document.getElementById('details-' + companyId);
            const arrowElement = document.getElementById('arrow-' + companyId);
            const companyRow = arrowElement.closest('.company-row');
            
            if (detailsElement.classList.contains('expanded')) {{
                // Collapse
                detailsElement.classList.remove('expanded');
                arrowElement.classList.remove('expanded');
                companyRow.classList.remove('expanded');
            }} else {{
                // Expand
                detailsElement.classList.add('expanded');
                arrowElement.classList.add('expanded');
                companyRow.classList.add('expanded');
            }}
        }}
    </script>
</body>
</html>'''
    
    return html_template


def generate_report(input_file: str, output_file: str) -> None:
    """
    Main report generation function
    """
    try:
        # Load the processed JSON data
        with open(input_file, 'r', encoding='utf-8') as f:
            processed_data = json.load(f)
        
        # Generate the HTML report
        html_report = generate_html_report(processed_data)
        
        # Write the HTML file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html_report)
        
        firm_name = processed_data["firm_name"]
        total_companies = processed_data["summary"]["total_companies"]
        companies_with_data = processed_data["summary"]["companies_with_data"]
        
        print(f"Successfully generated report for {firm_name}")
        print(f"Total companies: {total_companies}")
        print(f"Companies with data: {companies_with_data}")
        print(f"HTML report saved to: {output_file}")
        
    except FileNotFoundError:
        print(f"Error: Input file '{input_file}' not found", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyError as e:
        print(f"Error: Missing required field in processed data: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error generating report: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Generate HTML report from processed PE firm data")
    parser.add_argument("input_file", help="Input processed JSON file path")
    parser.add_argument("output_file", help="Output HTML file path")
    
    args = parser.parse_args()
    
    generate_report(args.input_file, args.output_file)


if __name__ == "__main__":
    main()