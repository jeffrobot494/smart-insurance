#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config({ path: './server/.env' });

async function checkAlternativePremiumFields() {
    const client = new Client({
        connectionString: process.env.DATABASE_PUBLIC_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        console.log('\n🔍 Checking alternative premium field usage patterns...\n');

        // Check patterns across different premium fields
        const query = `
            SELECT 
                COUNT(*) as total_records,
                COUNT(CASE WHEN wlfr_tot_earned_prem_amt > 0 THEN 1 END) as has_earned_prem,
                COUNT(CASE WHEN wlfr_tot_charges_paid_amt > 0 THEN 1 END) as has_charges_paid,
                COUNT(CASE WHEN pension_prem_paid_tot_amt > 0 THEN 1 END) as has_pension_prem,
                COUNT(CASE WHEN wlfr_incurred_claim_amt > 0 THEN 1 END) as has_claims,
                COUNT(CASE WHEN wlfr_ret_tot_amt > 0 THEN 1 END) as has_retention,
                COUNT(CASE WHEN wlfr_tot_earned_prem_amt > 0 AND wlfr_tot_charges_paid_amt > 0 THEN 1 END) as has_both_welfare_fields,
                COUNT(CASE WHEN wlfr_tot_earned_prem_amt = 0 AND wlfr_tot_charges_paid_amt = 0 AND pension_prem_paid_tot_amt > 0 THEN 1 END) as pension_only
            FROM schedule_a_records 
            WHERE year >= 2022;
        `;

        const result = await client.query(query);
        const stats = result.rows[0];

        console.log('📊 Premium Field Usage Statistics:');
        console.log('================================================================================');
        console.log(`Total Schedule A records (2022+): ${stats.total_records}`);
        console.log(`Records with wlfr_tot_earned_prem_amt > 0: ${stats.has_earned_prem} (${(stats.has_earned_prem/stats.total_records*100).toFixed(1)}%)`);
        console.log(`Records with wlfr_tot_charges_paid_amt > 0: ${stats.has_charges_paid} (${(stats.has_charges_paid/stats.total_records*100).toFixed(1)}%)`);
        console.log(`Records with pension_prem_paid_tot_amt > 0: ${stats.has_pension_prem} (${(stats.has_pension_prem/stats.total_records*100).toFixed(1)}%)`);
        console.log(`Records with both welfare fields > 0: ${stats.has_both_welfare_fields}`);
        console.log(`Records with only pension premiums: ${stats.pension_only}`);

        // Check records where earned premiums > 0 but charges paid = 0 (like Health Options)
        console.log('\n🔍 Records like Health Options (earned_prem > 0, charges_paid = 0):');
        console.log('================================================================================');

        const healthOptionsPattern = `
            SELECT 
                year,
                ins_carrier_name,
                wlfr_tot_earned_prem_amt,
                wlfr_tot_charges_paid_amt,
                COUNT(*) as record_count
            FROM schedule_a_records 
            WHERE wlfr_tot_earned_prem_amt > 0 
              AND wlfr_tot_charges_paid_amt = 0
              AND year >= 2022
            GROUP BY year, ins_carrier_name, wlfr_tot_earned_prem_amt, wlfr_tot_charges_paid_amt
            ORDER BY year DESC, wlfr_tot_earned_prem_amt DESC
            LIMIT 10;
        `;

        const healthOptionsResult = await client.query(healthOptionsPattern);
        
        if (healthOptionsResult.rows.length > 0) {
            healthOptionsResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.year} - ${row.ins_carrier_name}: $${row.wlfr_tot_earned_prem_amt} (${row.record_count} records)`);
            });
        } else {
            console.log('No records found with this pattern');
        }

        // Check pension-only records
        console.log('\n🏦 Records with only pension premiums (no welfare premiums):');
        console.log('================================================================================');

        const pensionOnlyQuery = `
            SELECT 
                year,
                ins_carrier_name,
                pension_prem_paid_tot_amt,
                COUNT(*) as record_count
            FROM schedule_a_records 
            WHERE pension_prem_paid_tot_amt > 0 
              AND wlfr_tot_earned_prem_amt = 0 
              AND wlfr_tot_charges_paid_amt = 0
              AND year >= 2022
            GROUP BY year, ins_carrier_name, pension_prem_paid_tot_amt
            ORDER BY year DESC, pension_prem_paid_tot_amt DESC
            LIMIT 5;
        `;

        const pensionResult = await client.query(pensionOnlyQuery);
        
        if (pensionResult.rows.length > 0) {
            pensionResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.year} - ${row.ins_carrier_name}: $${row.pension_prem_paid_tot_amt} (${row.record_count} records)`);
            });
        } else {
            console.log('No pension-only records found');
        }

    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await client.end();
        console.log('\n✅ Database connection closed');
    }
}

checkAlternativePremiumFields().catch(console.error);