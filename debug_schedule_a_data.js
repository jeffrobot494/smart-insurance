#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config({ path: './server/.env' });

async function checkScheduleAData() {
    const client = new Client({
        connectionString: process.env.DATABASE_PUBLIC_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        const ein = '300955527'; // ClareMedica EIN
        console.log(`\n🔍 Checking Schedule A data for EIN: ${ein}`);

        // Query to get all Schedule A records for this EIN
        const query = `
            SELECT 
                year,
                ack_id,
                form_id,
                ins_carrier_name,
                ins_prsn_covered_eoy_cnt,
                ins_broker_comm_tot_amt,
                ins_broker_fees_tot_amt,
                wlfr_tot_earned_prem_amt,
                wlfr_tot_charges_paid_amt,
                wlfr_type_bnft_oth_text,
                created_at
            FROM schedule_a_records 
            WHERE sch_a_ein = $1 
            ORDER BY year DESC, ins_carrier_name;
        `;

        const result = await client.query(query, [ein]);

        if (result.rows.length === 0) {
            console.log('❌ No Schedule A records found for this EIN');
            return;
        }

        console.log(`\n📊 Found ${result.rows.length} Schedule A records:`);
        console.log('================================================================================');

        result.rows.forEach((row, index) => {
            console.log(`\n📋 Record ${index + 1}:`);
            console.log(`   Year: ${row.year}`);
            console.log(`   ACK_ID: ${row.ack_id}`);
            console.log(`   Form ID: ${row.form_id}`);
            console.log(`   Carrier: ${row.ins_carrier_name}`);
            console.log(`   People Covered: ${row.ins_prsn_covered_eoy_cnt}`);
            console.log(`   Broker Commission: $${row.ins_broker_comm_tot_amt || '0'}`);
            console.log(`   Broker Fees: $${row.ins_broker_fees_tot_amt || '0'}`);
            console.log(`   🔑 EARNED PREMIUMS (Field 66): $${row.wlfr_tot_earned_prem_amt || '0'}`);
            console.log(`   🔑 CHARGES PAID (Field 86): $${row.wlfr_tot_charges_paid_amt || '0'}`);
            console.log(`   Benefit Type: ${row.wlfr_type_bnft_oth_text || 'Standard Benefits'}`);
            console.log(`   Import Date: ${row.created_at}`);
        });

        // Also check what the current get_schedule_a_by_ein function returns
        console.log('\n\n🔧 Testing current get_schedule_a_by_ein function:');
        console.log('================================================================================');

        const functionQuery = `SELECT * FROM get_schedule_a_by_ein($1)`;
        const functionResult = await client.query(functionQuery, [ein]);

        functionResult.rows.forEach((row, index) => {
            console.log(`\n📋 Function Result ${index + 1}:`);
            console.log(`   Year: ${row.year}`);
            console.log(`   Carrier: ${row.carrier_name}`);
            console.log(`   People Covered: ${row.persons_covered}`);
            console.log(`   Broker Commission: $${row.broker_commission || '0'}`);
            console.log(`   🔑 TOTAL CHARGES (current function): $${row.total_charges || '0'}`);
            console.log(`   Benefit Type: ${row.benefit_types}`);
        });

    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await client.end();
        console.log('\n✅ Database connection closed');
    }
}

// Run the script
checkScheduleAData().catch(console.error);