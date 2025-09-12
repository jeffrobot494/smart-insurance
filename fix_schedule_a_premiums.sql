-- Fix Schedule A premium data collection
-- Problem: get_schedule_a_by_ein function only uses wlfr_tot_charges_paid_amt
-- Solution: Prioritize wlfr_tot_earned_prem_amt (employer premium cost) over wlfr_tot_charges_paid_amt (insurer claim costs)
-- Impact: Captures missing premium data from ~51,544 records (6.6% improvement in coverage)

-- Drop and recreate the function with corrected premium logic
DROP FUNCTION IF EXISTS get_schedule_a_by_ein(VARCHAR(9));

CREATE OR REPLACE FUNCTION get_schedule_a_by_ein(ein_param VARCHAR(9))
RETURNS TABLE (
    year INTEGER,
    ack_id VARCHAR(255),
    form_id INTEGER,
    carrier_name TEXT,
    persons_covered INTEGER,
    broker_commission DECIMAL(20,2),
    broker_fees DECIMAL(20,2),
    total_charges DECIMAL(20,2),
    benefit_types TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.year,
        s.ack_id,
        s.form_id,
        s.ins_carrier_name::TEXT,
        s.ins_prsn_covered_eoy_cnt,
        s.ins_broker_comm_tot_amt,
        s.ins_broker_fees_tot_amt,
        -- FIXED: Prioritize earned premiums (employer cost) over charges paid (insurer claims)
        COALESCE(s.wlfr_tot_earned_prem_amt, s.wlfr_tot_charges_paid_amt, 0) as total_charges,
        CASE 
            WHEN s.wlfr_type_bnft_oth_text IS NOT NULL AND s.wlfr_type_bnft_oth_text != '' THEN s.wlfr_type_bnft_oth_text
            ELSE 'Standard Benefits'
        END::TEXT
    FROM schedule_a_records s
    WHERE s.sch_a_ein = ein_param
    ORDER BY s.year DESC, s.ins_carrier_name;
END;
$$ LANGUAGE plpgsql;

-- Test the fix with ClareMedica's EIN
SELECT 
    year,
    carrier_name,
    total_charges,
    'Expected: Health Options should now show $808,681 instead of $0' as note
FROM get_schedule_a_by_ein('300955527')
WHERE year = 2024
ORDER BY year DESC;