#!/usr/bin/env python3
"""
Data Processor for PE Firm Insurance Reports
Processes raw JSON data and applies year preferences and aggregations
"""

import json
import sys
import argparse
from typing import Dict, List, Any, Optional
from pathlib import Path


def get_preferred_year(available_years: List[str]) -> Optional[str]:
    """
    Get the preferred year based on priority: 2023 > 2022 > other years > 2024
    Only use 2024 if it's the only year available
    """
    if not available_years:
        return None
    
    # Convert to integers for proper sorting
    years = [int(year) for year in available_years]
    years.sort(reverse=True)  # Sort descending
    
    # Check for preferred years in order
    if 2023 in years:
        return "2023"
    elif 2022 in years:
        return "2022"
    elif len(years) == 1 and 2024 in years:
        # Only use 2024 if it's the only option
        return "2024"
    else:
        # Use the most recent year that's not 2024
        for year in years:
            if year != 2024:
                return str(year)
        # If all we have is 2024, use it
        return str(years[0])


def aggregate_schedule_a_data(schedule_a_details: Dict[str, List[Dict]], preferred_year: str) -> Dict[str, Any]:
    """
    Aggregate Schedule A data for the preferred year
    """
    if preferred_year not in schedule_a_details:
        return {
            "total_premiums": 0,
            "total_brokerage_fees": 0,
            "total_people_covered": 0,
            "plans": []
        }
    
    year_data = schedule_a_details[preferred_year]
    total_premiums = 0
    total_brokerage_fees = 0
    total_people_covered = 0
    plans = []
    
    for plan in year_data:
        # Parse monetary values, handling empty strings
        premiums = float(plan.get("totalCharges", "0") or "0")
        brokerage = float(plan.get("brokerCommission", "0") or "0")
        people = int(plan.get("personsCovered", "0") or "0")
        
        total_premiums += premiums
        total_brokerage_fees += brokerage
        total_people_covered += people
        
        plans.append({
            "benefit_type": plan.get("benefitType", ""),
            "carrier_name": plan.get("carrierName", ""),
            "premiums": premiums,
            "brokerage_fees": brokerage,
            "people_covered": people
        })
    
    return {
        "total_premiums": total_premiums,
        "total_brokerage_fees": total_brokerage_fees,
        "total_people_covered": total_people_covered,
        "plans": plans
    }


def get_total_participants(form5500_records: Dict[str, List[Dict]], preferred_year: str) -> int:
    """
    Get total active participants for the preferred year from Form 5500 data
    """
    if preferred_year not in form5500_records:
        return 0
    
    year_records = form5500_records[preferred_year]
    total_participants = 0
    
    for record in year_records:
        participants = record.get("active_participants", 0)
        if participants:
            total_participants += participants
    
    return total_participants


def process_company_data(company: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process individual company data
    """
    company_name = company.get("companyName", "Unknown Company")
    
    # Get Schedule A data and available years
    schedule_a = company.get("scheduleA", {})
    schedule_a_details = schedule_a.get("details", {})
    available_years = list(schedule_a_details.keys())
    
    # Get preferred year
    preferred_year = get_preferred_year(available_years)
    
    # If no Schedule A data, check Form 5500 years for display purposes
    if not preferred_year:
        form5500 = company.get("form5500", {})
        form5500_years = form5500.get("years", [])
        if form5500_years:
            preferred_year = get_preferred_year(form5500_years)
    
    # Aggregate the data
    if preferred_year and preferred_year in schedule_a_details:
        aggregated_data = aggregate_schedule_a_data(schedule_a_details, preferred_year)
        has_data = True
    else:
        aggregated_data = {
            "total_premiums": 0,
            "total_brokerage_fees": 0,
            "total_people_covered": 0,
            "plans": []
        }
        has_data = False
    
    # Get total participants from Form 5500 if available
    form5500_records = company.get("form5500", {}).get("records", {})
    total_participants = get_total_participants(form5500_records, preferred_year) if preferred_year else 0
    
    return {
        "company_name": company_name,
        "data_year": preferred_year,
        "has_data": has_data,
        "total_premiums": aggregated_data["total_premiums"],
        "total_brokerage_fees": aggregated_data["total_brokerage_fees"],
        "total_people_covered": aggregated_data["total_people_covered"],
        "total_participants": total_participants,
        "plans": aggregated_data["plans"]
    }


def extract_firm_name(json_file_path: str) -> str:
    """
    Extract firm name from the JSON file path
    """
    file_stem = Path(json_file_path).stem
    # Remove common suffixes and convert to title case
    firm_name = file_stem.replace("_research_results", "").replace("_", " ").title()
    return firm_name


def process_pe_data(input_file: str, output_file: str, firm_name: Optional[str] = None) -> None:
    """
    Main processing function
    """
    try:
        # Load the raw JSON data
        with open(input_file, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)
        
        # Extract firm name if not provided
        if not firm_name:
            firm_name = extract_firm_name(input_file)
        
        # Process each company
        processed_companies = []
        companies_with_data = 0
        
        for company in raw_data.get("companies", []):
            processed_company = process_company_data(company)
            processed_companies.append(processed_company)
            
            if processed_company["has_data"]:
                companies_with_data += 1
        
        # Calculate summary statistics
        total_companies = len(processed_companies)
        most_recent_year = "2023"  # Default based on our preference logic
        
        # Check what years we actually have
        years_found = set()
        for company in processed_companies:
            if company["data_year"]:
                years_found.add(company["data_year"])
        
        if years_found:
            # Get the most recent year that's not 2024, or 2024 if it's all we have
            sorted_years = sorted(years_found, reverse=True)
            if "2023" in years_found:
                most_recent_year = "2023"
            elif "2022" in years_found:
                most_recent_year = "2022"
            else:
                most_recent_year = sorted_years[0]
        
        # Create the processed data structure
        processed_data = {
            "firm_name": firm_name,
            "timestamp": raw_data.get("timestamp"),
            "summary": {
                "total_companies": total_companies,
                "companies_with_data": companies_with_data,
                "most_recent_year": most_recent_year
            },
            "companies": processed_companies
        }
        
        # Write the processed data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(processed_data, f, indent=2, ensure_ascii=False)
        
        print(f"Successfully processed {total_companies} companies")
        print(f"Companies with cost data: {companies_with_data}")
        print(f"Output saved to: {output_file}")
        
    except FileNotFoundError:
        print(f"Error: Input file '{input_file}' not found", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error processing data: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Process PE firm insurance data from raw JSON")
    parser.add_argument("input_file", help="Input JSON file path")
    parser.add_argument("output_file", help="Output processed JSON file path")
    parser.add_argument("--firm-name", help="Override firm name (defaults to filename-based)")
    
    args = parser.parse_args()
    
    process_pe_data(args.input_file, args.output_file, args.firm_name)


if __name__ == "__main__":
    main()