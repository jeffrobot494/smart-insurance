-- Smart Insurance Database Schema
-- Optimized for Form 5500 and Schedule A data analysis

-- ===========================================
-- FORM 5500 RECORDS TABLE
-- ===========================================

CREATE TABLE form_5500_records (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  
  -- Basic identifiers
  ack_id VARCHAR(255) NOT NULL,
  form_plan_year_begin_date DATE,
  form_tax_prd DATE,
  
  -- Plan information
  plan_name VARCHAR(255) NOT NULL,
  spons_dfe_pn INTEGER,
  plan_eff_date DATE,
  
  -- Sponsor information (KEY FIELDS FOR SEARCHING)
  sponsor_dfe_name VARCHAR(255) NOT NULL,
  spons_dfe_ein VARCHAR(9) NOT NULL,  -- Main EIN field for searches (as string to handle leading zeros)
  spons_dfe_dba_name TEXT,
  
  -- Sponsor address
  spons_dfe_mail_us_address1 VARCHAR(255),
  spons_dfe_mail_us_address2 TEXT,
  spons_dfe_mail_us_city VARCHAR(255),
  spons_dfe_mail_us_state VARCHAR(255),
  spons_dfe_mail_us_zip INTEGER,
  spons_dfe_phone_num VARCHAR(20),  -- Store as string to avoid overflow issues
  
  -- Business information
  business_code INTEGER,
  
  -- Administrator information
  admin_name TEXT,
  admin_ein TEXT,
  admin_phone_num TEXT,
  
  -- Participant counts
  tot_partcp_boy_cnt INTEGER,
  tot_active_partcp_cnt INTEGER,
  rtd_sep_partcp_rcvg_cnt INTEGER,
  rtd_sep_partcp_fut_cnt INTEGER,
  subtl_act_rtd_sep_cnt INTEGER,
  
  -- Plan type codes
  type_pension_bnft_code VARCHAR(255),
  type_welfare_bnft_code VARCHAR(255),
  
  -- Funding and benefit indicators
  funding_insurance_ind INTEGER,
  funding_trust_ind INTEGER,
  benefit_insurance_ind INTEGER,
  benefit_trust_ind INTEGER,
  
  -- Schedule attachments (important for our analysis)
  sch_a_attached_ind INTEGER,
  num_sch_a_attached_cnt INTEGER,
  
  -- Filing information
  filing_status VARCHAR(255),
  date_received DATE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint for idempotent imports
  CONSTRAINT unique_form_5500_ack_year UNIQUE (ack_id, year)
);

-- ===========================================
-- SCHEDULE A RECORDS TABLE
-- ===========================================

CREATE TABLE schedule_a_records (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  
  -- Basic identifiers
  ack_id VARCHAR(255) NOT NULL,
  form_id INTEGER NOT NULL,
  sch_a_plan_year_begin_date DATE,
  sch_a_plan_year_end_date DATE,
  sch_a_plan_num INTEGER NOT NULL,
  sch_a_ein VARCHAR(9) NOT NULL,  -- KEY FIELD FOR SEARCHING (as string to handle leading zeros)
  
  -- Insurance carrier information (KEY FIELDS FOR REPORTING)
  ins_carrier_name VARCHAR(255) NOT NULL,
  ins_carrier_ein VARCHAR(9),  -- Store as string to handle leading zeros
  ins_carrier_naic_code INTEGER,
  ins_contract_num VARCHAR(255),
  
  -- Coverage information
  ins_prsn_covered_eoy_cnt INTEGER,  -- Persons covered (key metric)
  ins_policy_from_date DATE,
  ins_policy_to_date DATE,
  
  -- Broker information
  ins_broker_comm_tot_amt DECIMAL(20,2),  -- Broker commission (key metric) - increased precision
  ins_broker_fees_tot_amt DECIMAL(20,2),
  
  -- Pension benefit fields
  pension_eoy_gen_acct_amt DECIMAL(20,2),
  pension_eoy_sep_acct_amt DECIMAL(20,2),
  pension_prem_paid_tot_amt DECIMAL(20,2),
  pension_eoy_bal_amt DECIMAL(20,2),
  
  -- Welfare benefit type indicators
  wlfr_bnft_health_ind INTEGER,
  wlfr_bnft_dental_ind INTEGER,
  wlfr_bnft_vision_ind INTEGER,
  wlfr_bnft_life_insur_ind INTEGER,
  wlfr_bnft_temp_disab_ind INTEGER,
  wlfr_bnft_long_term_disab_ind INTEGER,
  wlfr_bnft_drug_ind INTEGER,
  wlfr_bnft_hmo_ind INTEGER,
  wlfr_bnft_ppo_ind INTEGER,
  wlfr_bnft_indemnity_ind INTEGER,
  wlfr_bnft_other_ind INTEGER,
  wlfr_type_bnft_oth_text TEXT,  -- Other benefit type description
  
  -- Welfare financial information
  wlfr_tot_earned_prem_amt DECIMAL(20,2),
  wlfr_incurred_claim_amt DECIMAL(20,2),
  wlfr_tot_charges_paid_amt DECIMAL(20,2),  -- Total charges paid (key metric)
  wlfr_ret_tot_amt DECIMAL(20,2),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint for idempotent imports
  CONSTRAINT unique_schedule_a_ack_form_year UNIQUE (ack_id, form_id, year)
);

-- ===========================================
-- INDEXES FOR OPTIMAL SEARCH PERFORMANCE
-- ===========================================

-- Form 5500 indexes
CREATE INDEX idx_form_5500_sponsor_name ON form_5500_records(sponsor_dfe_name);
CREATE INDEX idx_form_5500_sponsor_ein ON form_5500_records(spons_dfe_ein);
CREATE INDEX idx_form_5500_year ON form_5500_records(year);
CREATE INDEX idx_form_5500_ack_id ON form_5500_records(ack_id);
CREATE INDEX idx_form_5500_plan_name ON form_5500_records(plan_name);
CREATE INDEX idx_form_5500_year_ein ON form_5500_records(year, spons_dfe_ein);  -- Composite index

-- Indexes to support unique constraints for optimal performance
CREATE INDEX idx_form_5500_ack_year ON form_5500_records(ack_id, year);

-- Schedule A indexes
CREATE INDEX idx_schedule_a_ein ON schedule_a_records(sch_a_ein);
CREATE INDEX idx_schedule_a_carrier_name ON schedule_a_records(ins_carrier_name);
CREATE INDEX idx_schedule_a_year ON schedule_a_records(year);
CREATE INDEX idx_schedule_a_ack_id ON schedule_a_records(ack_id);
CREATE INDEX idx_schedule_a_year_ein ON schedule_a_records(year, sch_a_ein);  -- Composite index
CREATE INDEX idx_schedule_a_ack_form_year ON schedule_a_records(ack_id, form_id, year);

-- ===========================================
-- UTILITY VIEWS FOR COMMON QUERIES
-- ===========================================

-- View to join Form 5500 and Schedule A data
CREATE VIEW company_insurance_summary AS
SELECT 
    f.year,
    f.sponsor_dfe_name,
    f.spons_dfe_ein,
    f.tot_active_partcp_cnt,
    COUNT(s.id) as schedule_a_records_count,
    STRING_AGG(DISTINCT s.ins_carrier_name, ', ') as insurance_carriers,
    SUM(s.ins_prsn_covered_eoy_cnt) as total_persons_covered,
    SUM(s.ins_broker_comm_tot_amt) as total_broker_commission,
    SUM(s.wlfr_tot_charges_paid_amt) as total_charges_paid
FROM form_5500_records f
LEFT JOIN schedule_a_records s ON f.spons_dfe_ein = s.sch_a_ein AND f.year = s.year
GROUP BY f.year, f.sponsor_dfe_name, f.spons_dfe_ein, f.tot_active_partcp_cnt;

-- View for benefit type analysis
CREATE VIEW benefit_type_analysis AS
SELECT 
    year,
    sch_a_ein,
    ins_carrier_name,
    CASE 
        WHEN wlfr_bnft_health_ind = 1 THEN 'Health'
        WHEN wlfr_bnft_dental_ind = 1 THEN 'Dental'
        WHEN wlfr_bnft_vision_ind = 1 THEN 'Vision'
        WHEN wlfr_bnft_life_insur_ind = 1 THEN 'Life Insurance'
        WHEN wlfr_bnft_temp_disab_ind = 1 THEN 'Temporary Disability'
        WHEN wlfr_bnft_long_term_disab_ind = 1 THEN 'Long Term Disability'
        WHEN wlfr_bnft_drug_ind = 1 THEN 'Drug'
        WHEN wlfr_bnft_hmo_ind = 1 THEN 'HMO'
        WHEN wlfr_bnft_ppo_ind = 1 THEN 'PPO'
        WHEN wlfr_bnft_indemnity_ind = 1 THEN 'Indemnity'
        WHEN wlfr_bnft_other_ind = 1 THEN 'Other'
        ELSE 'Unknown'
    END as benefit_type,
    wlfr_type_bnft_oth_text,
    ins_prsn_covered_eoy_cnt,
    wlfr_tot_charges_paid_amt
FROM schedule_a_records
WHERE wlfr_bnft_health_ind = 1 OR wlfr_bnft_dental_ind = 1 OR wlfr_bnft_vision_ind = 1 
   OR wlfr_bnft_life_insur_ind = 1 OR wlfr_bnft_temp_disab_ind = 1 OR wlfr_bnft_long_term_disab_ind = 1
   OR wlfr_bnft_drug_ind = 1 OR wlfr_bnft_hmo_ind = 1 OR wlfr_bnft_ppo_ind = 1 
   OR wlfr_bnft_indemnity_ind = 1 OR wlfr_bnft_other_ind = 1;

-- ===========================================
-- FUNCTIONS FOR COMMON SEARCHES
-- ===========================================

-- Function to search companies by name (case-insensitive)
CREATE OR REPLACE FUNCTION search_companies_by_name(search_term TEXT)
RETURNS TABLE (
    year INTEGER,
    sponsor_name TEXT,
    ein VARCHAR(9),
    plan_name TEXT,
    active_participants INTEGER,
    has_schedule_a BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.year,
        f.sponsor_dfe_name::TEXT,
        f.spons_dfe_ein,
        f.plan_name::TEXT,
        f.tot_active_partcp_cnt,
        (f.sch_a_attached_ind = 1) as has_schedule_a
    FROM form_5500_records f
    WHERE LOWER(f.sponsor_dfe_name) LIKE LOWER('%' || search_term || '%')
    ORDER BY f.year DESC, f.sponsor_dfe_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get Schedule A records for an EIN
CREATE OR REPLACE FUNCTION get_schedule_a_by_ein(ein_param VARCHAR(9))
RETURNS TABLE (
    year INTEGER,
    carrier_name TEXT,
    persons_covered INTEGER,
    broker_commission DECIMAL(20,2),
    total_charges DECIMAL(20,2),
    benefit_types TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.year,
        s.ins_carrier_name::TEXT,
        s.ins_prsn_covered_eoy_cnt,
        s.ins_broker_comm_tot_amt,
        s.wlfr_tot_charges_paid_amt,
        CASE 
            WHEN s.wlfr_type_bnft_oth_text IS NOT NULL THEN s.wlfr_type_bnft_oth_text
            ELSE 'Standard Benefits'
        END::TEXT
    FROM schedule_a_records s
    WHERE s.sch_a_ein = ein_param
    ORDER BY s.year DESC, s.ins_carrier_name;
END;
$$ LANGUAGE plpgsql;