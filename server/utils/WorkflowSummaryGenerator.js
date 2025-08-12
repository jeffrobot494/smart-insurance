/**
 * Generate a summary table of workflow results for all companies
 */
function generateWorkflowSummary(results) {
  const stats = {
    total: results.length,
    activePortfolio: 0,
    exitedCompanies: 0,
    smallCompanies: 0,
    form5500Matches: 0,
    needsResolution: 0,
    errors: 0
  };
  
  const companyDetails = [];
  
  results.forEach((result, index) => {
    const input = result.input || `Company ${index + 1}`;
    const tasks = result.tasks || {};
    
    // Extract company name from input string format "Firm: X, Company: Y"
    const companyMatch = input.match(/Company:\s*(.+)/);
    const companyName = companyMatch ? companyMatch[1].trim() : input;
    
    const detail = {
      company: companyName,
      location: 'Unknown',
      portfolioStatus: 'Unknown',
      employeeCount: 'Unknown',
      legalEntity: 'Unknown',
      form5500Status: 'Unknown'
    };
    
    try {
      // Task 1: Location
      if (tasks[1] && tasks[1].success && tasks[1].result) {
        const locationData = JSON.parse(tasks[1].result);
        if (locationData.headquarters_location) {
          detail.location = `${locationData.headquarters_location.city || 'Unknown'}, ${locationData.headquarters_location.state || 'Unknown'}`;
        }
      }
      
      // Task 2: Portfolio verification
      if (tasks[2] && tasks[2].success && tasks[2].result) {
        const portfolioData = JSON.parse(tasks[2].result);
        // Check for active portfolio company format
        if (portfolioData.portfolio_verification && portfolioData.portfolio_verification.is_active_portfolio === true) {
          detail.portfolioStatus = 'Active';
          stats.activePortfolio++;
        } 
        // Check for direct is_active_portfolio field (inactive company format)
        else if (portfolioData.is_active_portfolio === false) {
          detail.portfolioStatus = 'Exited';
          stats.exitedCompanies++;
        }
        // Check for direct is_active_portfolio field (active company format - fallback)
        else if (portfolioData.is_active_portfolio === true) {
          detail.portfolioStatus = 'Active';
          stats.activePortfolio++;
        }
      }
      
      // Task 3: Employee count
      if (tasks[3] && tasks[3].success && tasks[3].result) {
        const employeeData = JSON.parse(tasks[3].result);
        if (employeeData.employee_count_assessment) {
          if (employeeData.employee_count_assessment.likely_under_100_employees) {
            detail.employeeCount = '<100';
            stats.smallCompanies++;
          } else {
            detail.employeeCount = '100+';
          }
        }
      }
      
      // Task 4: Legal entity
      if (tasks[4] && tasks[4].success && tasks[4].result) {
        const legalData = JSON.parse(tasks[4].result);
        if (legalData.legal_entity_research && legalData.legal_entity_research.legal_entity_name) {
          detail.legalEntity = legalData.legal_entity_research.legal_entity_name;
        }
      }
      
      // Task 5: Form 5500 results
      if (tasks[5] && tasks[5].success && tasks[5].result) {
        const form5500Data = JSON.parse(tasks[5].result);
        if (form5500Data.status === 'READY_FOR_EXTRACTION') {
          detail.form5500Status = 'MATCHED';
          stats.form5500Matches++;
        } else if (form5500Data.status === 'NEEDS_ADVANCED_RESOLUTION') {
          detail.form5500Status = 'NEEDS_RESOLUTION';
          stats.needsResolution++;
        } else if (form5500Data.status === 'SKIPPED_SMALL_COMPANY') {
          detail.form5500Status = 'SKIPPED_SMALL';
        } else {
          detail.form5500Status = form5500Data.status || 'Unknown';
        }
      }
      
    } catch (error) {
      detail.form5500Status = 'ERROR';
      stats.errors++;
    }
    
    companyDetails.push(detail);
  });
  
  // Generate summary table
  let summary = `Firm: ${results[0]?.input?.match(/Firm:\s*([^,]+)/)?.[1] || 'Unknown'}\n`;
  summary += `Total Companies: ${stats.total}\n\n`;
  
  // Stats breakdown
  summary += `📊 RESULTS BREAKDOWN:\n`;
  summary += `  Active Portfolio Companies: ${stats.activePortfolio}\n`;
  summary += `  Exited Companies: ${stats.exitedCompanies}\n`;
  summary += `  Small Companies (<100 employees): ${stats.smallCompanies}\n`;
  summary += `  Form 5500 Matches Found: ${stats.form5500Matches}\n`;
  summary += `  Need Advanced Resolution: ${stats.needsResolution}\n`;
  summary += `  Processing Errors: ${stats.errors}\n\n`;
  
  // Success rates
  const eligibleForForm5500 = stats.activePortfolio - stats.smallCompanies;
  const matchRate = eligibleForForm5500 > 0 ? Math.round((stats.form5500Matches / eligibleForForm5500) * 100) : 0;
  summary += `📈 SUCCESS METRICS:\n`;
  summary += `  Portfolio Verification Rate: ${Math.round((stats.activePortfolio / stats.total) * 100)}%\n`;
  summary += `  Companies Eligible for Form 5500: ${eligibleForForm5500}\n`;
  summary += `  Form 5500 Match Rate: ${matchRate}% (${stats.form5500Matches}/${eligibleForForm5500})\n\n`;
  
  // Detailed company table
  summary += `📋 COMPANY DETAILS:\n`;
  summary += `${'Company'.padEnd(25)} | ${'Location'.padEnd(20)} | ${'Portfolio'.padEnd(10)} | ${'Employees'.padEnd(10)} | ${'Form5500'.padEnd(15)}\n`;
  summary += `${'-'.repeat(25)} | ${'-'.repeat(20)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(15)}\n`;
  
  companyDetails.forEach(detail => {
    const company = detail.company.length > 24 ? detail.company.substring(0, 21) + '...' : detail.company;
    const location = detail.location.length > 19 ? detail.location.substring(0, 16) + '...' : detail.location;
    summary += `${company.padEnd(25)} | ${location.padEnd(20)} | ${detail.portfolioStatus.padEnd(10)} | ${detail.employeeCount.padEnd(10)} | ${detail.form5500Status.padEnd(15)}\n`;
  });
  
  return summary;
}

module.exports = {
  generateWorkflowSummary
};