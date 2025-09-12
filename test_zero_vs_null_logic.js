#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config({ path: './server/.env' });

async function testZeroVsNullLogic() {
    const client = new Client({
        connectionString: process.env.DATABASE_PUBLIC_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        console.log('\n🧪 Testing zero vs null logic differences...\n');

        // Find records where field 66 = 0 (explicit zero) and field 86 > 0 (has value)
        const edgeCaseQuery = `
            SELECT 
                year,
                ins_carrier_name,
                wlfr_tot_earned_prem_amt as field_66_earned,
                wlfr_tot_charges_paid_amt as field_86_charges,
                -- Old COALESCE logic (first non-null)
                COALESCE(wlfr_tot_earned_prem_amt, wlfr_tot_charges_paid_amt, 0) as old_logic,
                -- New CASE logic (first non-zero)  
                CASE 
                    WHEN wlfr_tot_earned_prem_amt > 0 THEN wlfr_tot_earned_prem_amt
                    WHEN wlfr_tot_charges_paid_amt > 0 THEN wlfr_tot_charges_paid_amt
                    ELSE 0
                END as new_logic
            FROM schedule_a_records 
            WHERE year >= 2022
              AND wlfr_tot_earned_prem_amt = 0  -- Field 66 is explicitly 0
              AND wlfr_tot_charges_paid_amt > 0  -- Field 86 has value
            ORDER BY wlfr_tot_charges_paid_amt DESC
            LIMIT 5;
        `;

        console.log('📊 Records where old vs new logic would differ:');
        console.log('(Field 66 = 0, Field 86 > 0)');
        console.log('================================================================================');

        const result = await client.query(edgeCaseQuery);
        
        if (result.rows.length > 0) {
            console.log(`Found ${result.rows.length} edge cases:\n`);
            
            result.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.year} - ${row.ins_carrier_name}`);
                console.log(`   Field 66 (earned): $${row.field_66_earned}`);
                console.log(`   Field 86 (charges): $${row.field_86_charges}`);
                console.log(`   Old COALESCE logic: $${row.old_logic} ❌`);
                console.log(`   New CASE logic: $${row.new_logic} ✅`);
                console.log(`   Difference: $${row.new_logic - row.old_logic}\n`);
            });
        } else {
            console.log('✅ No edge cases found - both logics would produce same results');
        }

        // Check total impact 
        const impactQuery = `
            SELECT 
                COUNT(*) as total_affected_records,
                SUM(wlfr_tot_charges_paid_amt) as total_recovered_premiums
            FROM schedule_a_records 
            WHERE year >= 2022
              AND wlfr_tot_earned_prem_amt = 0  
              AND wlfr_tot_charges_paid_amt > 0;
        `;

        const impactResult = await client.query(impactQuery);
        const impact = impactResult.rows[0];

        if (impact.total_affected_records > 0) {
            console.log('💰 Impact of the fix:');
            console.log('================================================================================');
            console.log(`Records that benefit from new logic: ${impact.total_affected_records}`);
            console.log(`Total premium data recovered: $${impact.total_recovered_premiums}`);
        }

    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await client.end();
        console.log('\n✅ Database connection closed');
    }
}

testZeroVsNullLogic().catch(console.error);