-- Migration: Fix Schedule A column names to match reporting expectations
-- Created: 2025-07-18
-- Description: Update get_schedule_a_by_ein function to return original column names
-- 
-- NOTE: This migration is NOT currently being used.
-- The application code expects simplified column names (CARRIER_NAME, PERSONS_COVERED, etc.)
-- from the original function definition in create-tables.sql, not the original database 
-- column names that this migration provides. Keep for reference only.

-- Drop the existing function
DROP FUNCTION IF EXISTS get_schedule_a_by_ein(VARCHAR(9));

-- Recreate function with original column names
CREATE OR REPLACE FUNCTION get_schedule_a_by_ein(ein_param VARCHAR(9))
RETURNS TABLE (
    year INTEGER,
    ins_carrier_name TEXT,
    ins_prsn_covered_eoy_cnt INTEGER,
    ins_broker_comm_tot_amt DECIMAL(20,2),
    wlfr_tot_charges_paid_amt DECIMAL(20,2),
    wlfr_type_bnft_oth_text TEXT
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

-- Add comment for documentation
COMMENT ON FUNCTION get_schedule_a_by_ein(VARCHAR(9)) IS 'Returns Schedule A records for an EIN with original column names for reporting compatibility';