#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config({ path: './server/.env' });

async function investigateMissingPremiums() {
    const client = new Client({
        connectionString: process.env.DATABASE_PUBLIC_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        console.log('\n🔍 Investigating the remaining ~15% of records with no premium data...\n');

        // Find records with NO premium data in any field
        const noPremiumQuery = `
            SELECT 
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM schedule_a_records WHERE year >= 2022), 1) as percentage
            FROM schedule_a_records 
            WHERE year >= 2022
              AND (wlfr_tot_earned_prem_amt = 0 OR wlfr_tot_earned_prem_amt IS NULL)
              AND (wlfr_tot_charges_paid_amt = 0 OR wlfr_tot_charges_paid_amt IS NULL) 
              AND (pension_prem_paid_tot_amt = 0 OR pension_prem_paid_tot_amt IS NULL);
        `;

        const noPremiumResult = await client.query(noPremiumQuery);
        const noPremStats = noPremiumResult.rows[0];

        console.log('📊 Records with NO premium data in any field:');
        console.log('================================================================================');
        console.log(`Records with zero/null premiums: ${noPremStats.count} (${noPremStats.percentage}%)`);

        // Check what benefit types these "no premium" records have
        console.log('\n🏷️ Benefit types of records with no premium data:');
        console.log('================================================================================');

        const benefitTypeQuery = `
            SELECT 
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
                    ELSE 'No Benefit Indicators'
                END as benefit_type,
                wlfr_type_bnft_oth_text,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / ${noPremStats.count}, 1) as percentage_of_no_premium
            FROM schedule_a_records 
            WHERE year >= 2022
              AND (wlfr_tot_earned_prem_amt = 0 OR wlfr_tot_earned_prem_amt IS NULL)
              AND (wlfr_tot_charges_paid_amt = 0 OR wlfr_tot_charges_paid_amt IS NULL) 
              AND (pension_prem_paid_tot_amt = 0 OR pension_prem_paid_tot_amt IS NULL)
            GROUP BY benefit_type, wlfr_type_bnft_oth_text
            ORDER BY count DESC
            LIMIT 10;
        `;

        const benefitResult = await client.query(benefitTypeQuery);
        
        benefitResult.rows.forEach((row, index) => {
            const otherText = row.wlfr_type_bnft_oth_text ? ` (${row.wlfr_type_bnft_oth_text.substring(0, 50)}...)` : '';
            console.log(`${index + 1}. ${row.benefit_type}${otherText}: ${row.count} records (${row.percentage_of_no_premium}%)`);
        });

        // Check if these records have any financial data at all
        console.log('\n💰 Financial data in "no premium" records:');
        console.log('================================================================================');

        const financialQuery = `
            SELECT 
                COUNT(CASE WHEN ins_broker_comm_tot_amt > 0 THEN 1 END) as has_broker_commission,
                COUNT(CASE WHEN ins_broker_fees_tot_amt > 0 THEN 1 END) as has_broker_fees,
                COUNT(CASE WHEN wlfr_incurred_claim_amt > 0 THEN 1 END) as has_claims,
                COUNT(CASE WHEN wlfr_ret_tot_amt > 0 THEN 1 END) as has_retention,
                COUNT(CASE WHEN ins_prsn_covered_eoy_cnt > 0 THEN 1 END) as has_people_covered
            FROM schedule_a_records 
            WHERE year >= 2022
              AND (wlfr_tot_earned_prem_amt = 0 OR wlfr_tot_earned_prem_amt IS NULL)
              AND (wlfr_tot_charges_paid_amt = 0 OR wlfr_tot_charges_paid_amt IS NULL) 
              AND (pension_prem_paid_tot_amt = 0 OR pension_prem_paid_tot_amt IS NULL);
        `;

        const financialResult = await client.query(financialQuery);
        const finStats = financialResult.rows[0];

        console.log(`Records with broker commissions > 0: ${finStats.has_broker_commission}`);
        console.log(`Records with broker fees > 0: ${finStats.has_broker_fees}`);
        console.log(`Records with claims > 0: ${finStats.has_claims}`);
        console.log(`Records with retention > 0: ${finStats.has_retention}`);
        console.log(`Records with people covered > 0: ${finStats.has_people_covered}`);

        // Sample some of these records to see what they look like
        console.log('\n🔍 Sample records with no premium data:');
        console.log('================================================================================');

        const sampleQuery = `
            SELECT 
                year,
                ins_carrier_name,
                ins_prsn_covered_eoy_cnt,
                ins_broker_comm_tot_amt,
                ins_broker_fees_tot_amt,
                wlfr_type_bnft_oth_text
            FROM schedule_a_records 
            WHERE year >= 2022
              AND (wlfr_tot_earned_prem_amt = 0 OR wlfr_tot_earned_prem_amt IS NULL)
              AND (wlfr_tot_charges_paid_amt = 0 OR wlfr_tot_charges_paid_amt IS NULL) 
              AND (pension_prem_paid_tot_amt = 0 OR pension_prem_paid_tot_amt IS NULL)
              AND ins_prsn_covered_eoy_cnt > 0
            ORDER BY ins_prsn_covered_eoy_cnt DESC
            LIMIT 5;
        `;

        const sampleResult = await client.query(sampleQuery);
        
        sampleResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.year} - ${row.ins_carrier_name}`);
            console.log(`   People Covered: ${row.ins_prsn_covered_eoy_cnt}`);
            console.log(`   Broker Commission: $${row.ins_broker_comm_tot_amt || '0'}`);
            console.log(`   Broker Fees: $${row.ins_broker_fees_tot_amt || '0'}`);
            console.log(`   Benefit Type: ${row.wlfr_type_bnft_oth_text || 'Not specified'}\n`);
        });

    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await client.end();
        console.log('✅ Database connection closed');
    }
}

investigateMissingPremiums().catch(console.error);