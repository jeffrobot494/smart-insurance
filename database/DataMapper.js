/**
 * Maps CSV data to database records with proper field conversions
 */
class DataMapper {
  constructor() {
    // Define the mapping from CSV columns to database columns
    this.form5500Mapping = {
      'ACK_ID': 'ack_id',
      'FORM_PLAN_YEAR_BEGIN_DATE': 'form_plan_year_begin_date',
      'FORM_TAX_PRD': 'form_tax_prd',
      'PLAN_NAME': 'plan_name',
      'SPONS_DFE_PN': 'spons_dfe_pn',
      'PLAN_EFF_DATE': 'plan_eff_date',
      'SPONSOR_DFE_NAME': 'sponsor_dfe_name',
      'SPONS_DFE_EIN': 'spons_dfe_ein',
      'SPONS_DFE_DBA_NAME': 'spons_dfe_dba_name',
      'SPONS_DFE_MAIL_US_ADDRESS1': 'spons_dfe_mail_us_address1',
      'SPONS_DFE_MAIL_US_ADDRESS2': 'spons_dfe_mail_us_address2',
      'SPONS_DFE_MAIL_US_CITY': 'spons_dfe_mail_us_city',
      'SPONS_DFE_MAIL_US_STATE': 'spons_dfe_mail_us_state',
      'SPONS_DFE_MAIL_US_ZIP': 'spons_dfe_mail_us_zip',
      'SPONS_DFE_PHONE_NUM': 'spons_dfe_phone_num',
      'BUSINESS_CODE': 'business_code',
      'ADMIN_NAME': 'admin_name',
      'ADMIN_EIN': 'admin_ein',
      'ADMIN_PHONE_NUM': 'admin_phone_num',
      'TOT_PARTCP_BOY_CNT': 'tot_partcp_boy_cnt',
      'TOT_ACTIVE_PARTCP_CNT': 'tot_active_partcp_cnt',
      'RTD_SEP_PARTCP_RCVG_CNT': 'rtd_sep_partcp_rcvg_cnt',
      'RTD_SEP_PARTCP_FUT_CNT': 'rtd_sep_partcp_fut_cnt',
      'SUBTL_ACT_RTD_SEP_CNT': 'subtl_act_rtd_sep_cnt',
      'TYPE_PENSION_BNFT_CODE': 'type_pension_bnft_code',
      'TYPE_WELFARE_BNFT_CODE': 'type_welfare_bnft_code',
      'FUNDING_INSURANCE_IND': 'funding_insurance_ind',
      'FUNDING_TRUST_IND': 'funding_trust_ind',
      'BENEFIT_INSURANCE_IND': 'benefit_insurance_ind',
      'BENEFIT_TRUST_IND': 'benefit_trust_ind',
      'SCH_A_ATTACHED_IND': 'sch_a_attached_ind',
      'NUM_SCH_A_ATTACHED_CNT': 'num_sch_a_attached_cnt',
      'FILING_STATUS': 'filing_status',
      'DATE_RECEIVED': 'date_received'
    };

    this.scheduleAMapping = {
      'ACK_ID': 'ack_id',
      'FORM_ID': 'form_id',
      'SCH_A_PLAN_YEAR_BEGIN_DATE': 'sch_a_plan_year_begin_date',
      'SCH_A_PLAN_YEAR_END_DATE': 'sch_a_plan_year_end_date',
      'SCH_A_PLAN_NUM': 'sch_a_plan_num',
      'SCH_A_EIN': 'sch_a_ein',
      'INS_CARRIER_NAME': 'ins_carrier_name',
      'INS_CARRIER_EIN': 'ins_carrier_ein',
      'INS_CARRIER_NAIC_CODE': 'ins_carrier_naic_code',
      'INS_CONTRACT_NUM': 'ins_contract_num',
      'INS_PRSN_COVERED_EOY_CNT': 'ins_prsn_covered_eoy_cnt',
      'INS_POLICY_FROM_DATE': 'ins_policy_from_date',
      'INS_POLICY_TO_DATE': 'ins_policy_to_date',
      'INS_BROKER_COMM_TOT_AMT': 'ins_broker_comm_tot_amt',
      'INS_BROKER_FEES_TOT_AMT': 'ins_broker_fees_tot_amt',
      'PENSION_EOY_GEN_ACCT_AMT': 'pension_eoy_gen_acct_amt',
      'PENSION_EOY_SEP_ACCT_AMT': 'pension_eoy_sep_acct_amt',
      'PENSION_PREM_PAID_TOT_AMT': 'pension_prem_paid_tot_amt',
      'PENSION_EOY_BAL_AMT': 'pension_eoy_bal_amt',
      'WLFR_BNFT_HEALTH_IND': 'wlfr_bnft_health_ind',
      'WLFR_BNFT_DENTAL_IND': 'wlfr_bnft_dental_ind',
      'WLFR_BNFT_VISION_IND': 'wlfr_bnft_vision_ind',
      'WLFR_BNFT_LIFE_INSUR_IND': 'wlfr_bnft_life_insur_ind',
      'WLFR_BNFT_TEMP_DISAB_IND': 'wlfr_bnft_temp_disab_ind',
      'WLFR_BNFT_LONG_TERM_DISAB_IND': 'wlfr_bnft_long_term_disab_ind',
      'WLFR_BNFT_DRUG_IND': 'wlfr_bnft_drug_ind',
      'WLFR_BNFT_HMO_IND': 'wlfr_bnft_hmo_ind',
      'WLFR_BNFT_PPO_IND': 'wlfr_bnft_ppo_ind',
      'WLFR_BNFT_INDEMNITY_IND': 'wlfr_bnft_indemnity_ind',
      'WLFR_BNFT_OTHER_IND': 'wlfr_bnft_other_ind',
      'WLFR_TYPE_BNFT_OTH_TEXT': 'wlfr_type_bnft_oth_text',
      'WLFR_TOT_EARNED_PREM_AMT': 'wlfr_tot_earned_prem_amt',
      'WLFR_INCURRED_CLAIM_AMT': 'wlfr_incurred_claim_amt',
      'WLFR_TOT_CHARGES_PAID_AMT': 'wlfr_tot_charges_paid_amt',
      'WLFR_RET_TOT_AMT': 'wlfr_ret_tot_amt'
    };

    // Define fields that should be converted to numbers
    this.numericFields = new Set([
      'spons_dfe_pn', 'spons_dfe_mail_us_zip', 'business_code', 'tot_partcp_boy_cnt', 
      'tot_active_partcp_cnt', 'rtd_sep_partcp_rcvg_cnt', 'rtd_sep_partcp_fut_cnt', 
      'subtl_act_rtd_sep_cnt', 'funding_insurance_ind', 'funding_trust_ind', 
      'benefit_insurance_ind', 'benefit_trust_ind', 'sch_a_attached_ind', 
      'num_sch_a_attached_cnt', 'form_id', 'sch_a_plan_num', 'ins_carrier_naic_code', 
      'ins_prsn_covered_eoy_cnt', 'wlfr_bnft_health_ind', 'wlfr_bnft_dental_ind', 
      'wlfr_bnft_vision_ind', 'wlfr_bnft_life_insur_ind', 'wlfr_bnft_temp_disab_ind', 
      'wlfr_bnft_long_term_disab_ind', 'wlfr_bnft_drug_ind', 'wlfr_bnft_hmo_ind', 
      'wlfr_bnft_ppo_ind', 'wlfr_bnft_indemnity_ind', 'wlfr_bnft_other_ind'
    ]);

    // Define EIN fields that need special handling
    this.einFields = new Set([
      'spons_dfe_ein', 'sch_a_ein', 'ins_carrier_ein'
    ]);

    // Define fields that should be stored as strings (to avoid overflow)
    this.stringFields = new Set([
      'spons_dfe_phone_num'
    ]);

    // Define fields that should be converted to decimals
    this.decimalFields = new Set([
      'ins_broker_comm_tot_amt', 'ins_broker_fees_tot_amt', 'pension_eoy_gen_acct_amt',
      'pension_eoy_sep_acct_amt', 'pension_prem_paid_tot_amt', 'pension_eoy_bal_amt',
      'wlfr_tot_earned_prem_amt', 'wlfr_incurred_claim_amt', 'wlfr_tot_charges_paid_amt',
      'wlfr_ret_tot_amt'
    ]);

    // Define fields that should be converted to dates
    this.dateFields = new Set([
      'form_plan_year_begin_date', 'form_tax_prd', 'plan_eff_date', 'date_received',
      'sch_a_plan_year_begin_date', 'sch_a_plan_year_end_date', 'ins_policy_from_date',
      'ins_policy_to_date'
    ]);
  }

  /**
   * Map Form 5500 CSV row to database record
   * @param {Object} csvRow - Raw CSV row data
   * @param {number} year - Year of the data
   * @returns {Object} Mapped database record
   */
  mapForm5500Record(csvRow, year) {
    const record = { year };

    // Map each field from CSV to database
    for (const [csvField, dbField] of Object.entries(this.form5500Mapping)) {
      if (csvRow[csvField] !== undefined) {
        record[dbField] = this.convertValue(csvRow[csvField], dbField);
      }
    }

    // Validate required fields
    this.validateForm5500Record(record);

    return record;
  }

  /**
   * Map Schedule A CSV row to database record
   * @param {Object} csvRow - Raw CSV row data
   * @param {number} year - Year of the data
   * @returns {Object} Mapped database record
   */
  mapScheduleARecord(csvRow, year) {
    const record = { year };

    // Map each field from CSV to database
    for (const [csvField, dbField] of Object.entries(this.scheduleAMapping)) {
      if (csvRow[csvField] !== undefined) {
        record[dbField] = this.convertValue(csvRow[csvField], dbField);
      }
    }

    // Validate required fields
    this.validateScheduleARecord(record);

    return record;
  }

  /**
   * Convert a value to the appropriate data type
   * @param {string} value - Raw value from CSV
   * @param {string} fieldName - Database field name
   * @returns {any} Converted value
   */
  convertValue(value, fieldName) {
    // Handle empty/null values
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Clean string values
    if (typeof value === 'string') {
      value = value.trim();
      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
    }

    // Convert to appropriate type
    if (this.einFields.has(fieldName)) {
      return this.convertToEIN(value);
    } else if (this.stringFields.has(fieldName)) {
      return this.convertToString(value);
    } else if (this.numericFields.has(fieldName)) {
      return this.convertToInteger(value);
    } else if (this.decimalFields.has(fieldName)) {
      return this.convertToDecimal(value);
    } else if (this.dateFields.has(fieldName)) {
      return this.convertToDate(value);
    } else {
      // Return as string, but truncate if too long
      return this.convertToString(value);
    }
  }

  /**
   * Convert value to EIN (handle 8 and 9 digit EINs)
   * @param {any} value - Value to convert
   * @returns {string|null} Converted EIN as string or null
   */
  convertToEIN(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Clean the value
    const cleanValue = String(value).replace(/\D/g, '');
    
    // EINs should be 8 or 9 digits (8 digits means leading zero was dropped)
    if (cleanValue.length === 8) {
      return '0' + cleanValue; // Add leading zero
    } else if (cleanValue.length === 9) {
      return cleanValue;
    } else {
      // Invalid EIN length - return as string but log warning
      console.warn(`Invalid EIN length (${cleanValue.length}): ${value}`);
      return cleanValue || null;
    }
  }


  /**
   * Convert value to integer
   * @param {any} value - Value to convert
   * @returns {number|null} Converted integer or null
   */
  convertToInteger(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const num = parseInt(value, 10);
    
    // Check for integer overflow (PostgreSQL INTEGER max: 2,147,483,647)
    if (num > 2147483647) {
      console.warn(`Integer overflow: ${value} - converting to null`);
      return null;
    }
    
    return isNaN(num) ? null : num;
  }

  /**
   * Convert value to decimal
   * @param {any} value - Value to convert
   * @returns {number|null} Converted decimal or null
   */
  convertToDecimal(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  /**
   * Convert value to date
   * @param {any} value - Value to convert
   * @returns {string|null} Converted date string or null
   */
  convertToDate(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Handle different date formats
    if (typeof value === 'string') {
      // If it's already in YYYY-MM-DD format, return as-is
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return value;
      }
      
      // Handle MM/DD/YYYY format
      const mmddyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (mmddyyyy) {
        return `${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}`;
      }
      
      // Handle other formats - try to parse as date
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }

    return null;
  }

  /**
   * Convert value to string with length limits
   * @param {any} value - Value to convert
   * @returns {string|null} Converted string or null
   */
  convertToString(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    let str = String(value);
    
    // Truncate very long strings to prevent database errors
    if (str.length > 1000) {
      str = str.substring(0, 1000);
    }

    return str;
  }

  /**
   * Validate Form 5500 record has required fields
   * @param {Object} record - Database record to validate
   * @throws {Error} If validation fails
   */
  validateForm5500Record(record) {
    const requiredFields = ['ack_id', 'plan_name', 'sponsor_dfe_name', 'spons_dfe_ein'];
    
    for (const field of requiredFields) {
      if (!record[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // EIN validation is now handled in convertToEIN method
  }

  /**
   * Validate Schedule A record has required fields
   * @param {Object} record - Database record to validate
   * @throws {Error} If validation fails
   */
  validateScheduleARecord(record) {
    const requiredFields = ['ack_id', 'form_id', 'sch_a_plan_num', 'sch_a_ein', 'ins_carrier_name'];
    
    for (const field of requiredFields) {
      if (!record[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // EIN validation is now handled in convertToEIN method
  }

  /**
   * Get statistics about mapping coverage
   * @param {Object} csvRow - Sample CSV row
   * @param {string} type - 'form5500' or 'schedule_a'
   * @returns {Object} Mapping statistics
   */
  getMappingStats(csvRow, type) {
    const mapping = type === 'form5500' ? this.form5500Mapping : this.scheduleAMapping;
    const csvFields = Object.keys(csvRow);
    const mappedFields = Object.keys(mapping);
    
    const unmappedFields = csvFields.filter(field => !mappedFields.includes(field));
    const missingFields = mappedFields.filter(field => !csvFields.includes(field));

    return {
      totalCsvFields: csvFields.length,
      totalMappedFields: mappedFields.length,
      mappedCount: csvFields.filter(field => mappedFields.includes(field)).length,
      unmappedFields: unmappedFields.slice(0, 10), // Show first 10 unmapped fields
      missingFields: missingFields.slice(0, 10), // Show first 10 missing fields
      coveragePercent: ((csvFields.length - unmappedFields.length) / csvFields.length * 100).toFixed(1)
    };
  }
}

module.exports = DataMapper;