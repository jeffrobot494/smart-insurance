/**
 * Convert portfolio company verification results to the format expected by SaveTaskResults
 * for database saving as portfolio companies
 */
class VerificationResultsConverter {
  
  /**
   * Convert verification workflow results to portfolio company format
   * @param {Array} verificationResults - Array of workflow results from portfolio_company_verification
   * @returns {Array} Array of converted results in format expected by SaveTaskResults
   */
  static convertToPortfolioFormat(verificationResults) {
    const convertedResults = [];
    
    for (const result of verificationResults) {
      try {
        const convertedResult = this.convertSingleResult(result);
        if (convertedResult) {
          convertedResults.push(convertedResult);
        }
      } catch (error) {
        console.error(`❌ Failed to convert verification result:`, error.message);
        // Continue processing other results
      }
    }
    
    return convertedResults;
  }
  
  /**
   * Extract JSON from Claude's response that may include commentary
   * @param {string} rawResult - Raw result string from Claude
   * @returns {Object|null} Parsed JSON object or null if not found
   */
  static extractJsonFromResponse(rawResult) {
    if (!rawResult || typeof rawResult !== 'string') {
      return null;
    }
    
    try {
      // First try parsing as-is
      return JSON.parse(rawResult);
    } catch (error) {
      // If that fails, look for JSON within the response
      
      // Look for content between first { and last }
      const firstBrace = rawResult.indexOf('{');
      const lastBrace = rawResult.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonString = rawResult.substring(firstBrace, lastBrace + 1);
        
        try {
          return JSON.parse(jsonString);
        } catch (innerError) {
          console.error('❌ Failed to parse extracted JSON:', innerError.message);
          console.error('❌ Extracted JSON string:', jsonString.substring(0, 200) + '...');
        }
      }
      
      console.error('❌ Could not find valid JSON in response:', rawResult.substring(0, 200) + '...');
      return null;
    }
  }

  /**
   * Convert a single workflow result to portfolio format
   * @param {Object} result - Single workflow result object
   * @returns {Object|null} Converted result or null if not convertible
   */
  static convertSingleResult(result) {
    if (!result || !result.tasks) {
      return null;
    }
    
    // Find the final task result (highest task ID)
    const taskIds = Object.keys(result.tasks).map(id => parseInt(id));
    const finalTaskId = Math.max(...taskIds);
    const finalTask = result.tasks[finalTaskId];
    
    if (!finalTask || !finalTask.success || !finalTask.result) {
      return null;
    }
    
    // Extract JSON from potentially messy Claude response
    const verificationData = this.extractJsonFromResponse(finalTask.result);
    if (!verificationData) {
      return null;
    }
    
    // Only include companies that are ready for extraction or need resolution
    const validStatuses = ['READY_FOR_EXTRACTION', 'NEEDS_ADVANCED_RESOLUTION'];
    if (!validStatuses.includes(verificationData.status)) {
      console.log(`⏭️ Skipping company ${verificationData.company_name} with status: ${verificationData.status}`);
      return null;
    }
    
    // Use the legal_name from form5500_match, fallback to original company name
    let refinedCompanyName = verificationData.company_name;
    
    if (verificationData.form5500_match && 
        verificationData.form5500_match.legal_name) {
      refinedCompanyName = verificationData.form5500_match.legal_name;
      console.log(`🔄 Using Form 5500 legal name for ${verificationData.company_name}: ${refinedCompanyName}`);
    } else {
      console.log(`⚠️ No Form 5500 legal name found for ${verificationData.company_name}, using original name`);
    }
    
    // Get firm name
    const firmName = verificationData.firm_name || 'Unknown Firm';
    
    // Create the expected format: "Firm Name: Company1, Company2, ..."
    // Since this is a single company result, we'll just have one company per result
    const portfolioFormatString = `${firmName}: ${refinedCompanyName}`;
    
    // Return in the structure expected by SaveTaskResults
    return {
      ...result, // Keep original structure
      tasks: {
        ...result.tasks,
        [finalTaskId]: {
          ...finalTask,
          result: portfolioFormatString // Replace with portfolio format
        }
      }
    };
  }
  
  /**
   * Group multiple single-company results by firm and create consolidated results
   * @param {Array} verificationResults - Array of verification workflow results
   * @returns {Array} Array of consolidated results grouped by firm
   */
  static consolidateByFirm(verificationResults) {
    if (verificationResults.length === 0) {
      return [];
    }
    
    // Get firm name from the first valid result to use for all companies
    let masterFirmName = 'Unknown Firm';
    let templateResult = null;
    
    for (const result of verificationResults) {
      try {
        const finalTaskId = Math.max(...Object.keys(result.tasks).map(id => parseInt(id)));
        const finalTask = result.tasks[finalTaskId];
        
        if (!finalTask || !finalTask.success) continue;
        
        const verificationData = this.extractJsonFromResponse(finalTask.result);
        if (!verificationData) continue;
        
        masterFirmName = verificationData.firm_name || 'Unknown Firm';
        templateResult = result;
        console.log(`📋 Using firm name from first result: "${masterFirmName}"`);
        break;
      } catch (error) {
        console.error('❌ Failed to get firm name from result:', error.message);
        continue;
      }
    }
    
    if (!templateResult) {
      console.error('❌ Could not find any valid results to get firm name');
      return [];
    }
    
    // Collect all valid companies using the master firm name
    const companies = [];
    
    for (const result of verificationResults) {
      try {
        const finalTaskId = Math.max(...Object.keys(result.tasks).map(id => parseInt(id)));
        const finalTask = result.tasks[finalTaskId];
        
        if (!finalTask || !finalTask.success) continue;
        
        const verificationData = this.extractJsonFromResponse(finalTask.result);
        if (!verificationData) continue;
        
        const validStatuses = ['READY_FOR_EXTRACTION', 'NEEDS_ADVANCED_RESOLUTION'];
        if (!validStatuses.includes(verificationData.status)) continue;
        
        // Use form5500_match.legal_name if available, otherwise original company name
        const refinedCompanyName = verificationData.form5500_match?.legal_name || verificationData.company_name;
        companies.push(refinedCompanyName);
        
      } catch (error) {
        console.error('❌ Failed to process result for consolidation:', error.message);
        continue;
      }
    }
    
    if (companies.length === 0) {
      console.log('⚠️ No valid companies found for consolidation');
      return [];
    }
    
    // Create single consolidated result with master firm name
    const portfolioFormatString = `${masterFirmName}: ${companies.join(', ')}`;
    const finalTaskId = Math.max(...Object.keys(templateResult.tasks).map(id => parseInt(id)));
    
    return [{
      ...templateResult,
      tasks: {
        ...templateResult.tasks,
        [finalTaskId]: {
          ...templateResult.tasks[finalTaskId],
          result: portfolioFormatString
        }
      }
    }];
  }
}

module.exports = VerificationResultsConverter;