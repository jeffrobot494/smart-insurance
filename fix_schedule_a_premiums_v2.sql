-- Fix Schedule A premium data collection - Version 2 (Non-Zero Logic)
-- Problem: COALESCE picks first non-null, but we need first non-zero
-- Solution: Use CASE statement to pick first field > 0 instead of first non-null field
-- Impact: Safer handling of explicit zero values vs null values

-- Drop and recreate the function with corrected non-zero logic
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
        -- FIXED V2: Use first NON-ZERO field instead of first NON-NULL field
        CASE 
            WHEN s.wlfr_tot_earned_prem_amt > 0 THEN s.wlfr_tot_earned_prem_amt
            WHEN s.wlfr_tot_charges_paid_amt > 0 THEN s.wlfr_tot_charges_paid_amt
            ELSE 0
        END as total_charges,
        CASE 
            WHEN s.wlfr_type_bnft_oth_text IS NOT NULL AND s.wlfr_type_bnft_oth_text != '' THEN s.wlfr_type_bnft_oth_text
            ELSE 'Standard Benefits'
        END::TEXT
    FROM schedule_a_records s
    WHERE s.sch_a_ein = ein_param
    ORDER BY s.year DESC, s.ins_carrier_name;
END;
$$ LANGUAGE plpgsql;

-- Test the updated fix with ClareMedica's EIN
SELECT 
    year,
    carrier_name,
    total_charges,
    'V2 Fix: Should still show Health Options = $808,681, Guardian = $192,577' as note
FROM get_schedule_a_by_ein('300955527')
WHERE year = 2024
ORDER BY year DESC;