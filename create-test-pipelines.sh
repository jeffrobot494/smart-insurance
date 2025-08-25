#!/bin/bash

# Script to create 10 test pipelines with fake data and various statuses
BASE_URL="http://localhost:3000/api/pipeline"

echo "Creating 10 test pipelines with different statuses..."

# Array of real database statuses
statuses=("pending" "research_running" "research_complete" "legal_resolution_running" "legal_resolution_complete" "data_extraction_running" "data_extraction_complete" "failed")

for i in {1..10}; do
    echo "Creating pipeline $i/10..."
    
    # Create pipeline with fake firm name
    firm_name="Test Firm $i"
    
    # Create the pipeline
    response=$(curl -s -X POST "$BASE_URL" \
        -H "Content-Type: application/json" \
        -d "{\"firm_name\": \"$firm_name\"}")
    
    # Extract pipeline_id
    pipeline_id=$(echo "$response" | grep -o '"pipeline_id":[0-9]*' | cut -d':' -f2)
    
    if [ -n "$pipeline_id" ]; then
        echo "  ✅ Created pipeline $pipeline_id"
        
        # Select status based on pipeline number (cycle through statuses)
        status_index=$(( (i - 1) % ${#statuses[@]} ))
        selected_status="${statuses[$status_index]}"
        
        # Add companies for pipelines that have progressed beyond pending
        if [ "$selected_status" != "pending" ]; then
            echo "  📝 Adding companies to pipeline $pipeline_id..."
            curl -s -X PUT "$BASE_URL/$pipeline_id/companies" \
                -H "Content-Type: application/json" \
                -d "{
                    \"companies\": [
                        {
                            \"name\": \"Portfolio Company A$i\",
                            \"legal_entity_name\": \"PORTFOLIO COMPANY A$i LLC\",
                            \"city\": \"New York\",
                            \"state\": \"NY\",
                            \"exited\": false,
                            \"confidence_level\": \"high\"
                        },
                        {
                            \"name\": \"Portfolio Company B$i\",
                            \"legal_entity_name\": \"PORTFOLIO COMPANY B$i INC\",
                            \"city\": \"San Francisco\",
                            \"state\": \"CA\",
                            \"exited\": true,
                            \"confidence_level\": \"medium\"
                        },
                        {
                            \"name\": \"Portfolio Company C$i\",
                            \"legal_entity_name\": \"PORTFOLIO COMPANY C$i CORP\",
                            \"city\": \"Austin\",
                            \"state\": \"TX\",
                            \"exited\": false,
                            \"confidence_level\": \"low\"
                        }
                    ]
                }" > /dev/null
            echo "  ✅ Added companies to pipeline $pipeline_id"
        fi
        
        # Add Form 5500 data for data_extraction_complete pipelines
        if [ "$selected_status" = "data_extraction_complete" ]; then
            echo "  📊 Adding Form 5500 data to companies..."
            # Update companies with Form 5500 data
            curl -s -X POST "$BASE_URL/$pipeline_id/update" \
                -H "Content-Type: application/json" \
                -d "{
                    \"updates\": {
                        \"companies\": [
                            {
                                \"name\": \"Portfolio Company A$i\",
                                \"legal_entity_name\": \"PORTFOLIO COMPANY A$i LLC\",
                                \"city\": \"New York\",
                                \"state\": \"NY\",
                                \"exited\": false,
                                \"confidence_level\": \"high\",
                                \"form5500_data\": {
                                    \"ein\": \"12-345678$i\",
                                    \"plan_year\": 2023,
                                    \"active_participants\": $((150 + i * 10)),
                                    \"total_charges\": $((50000 + i * 5000)),
                                    \"broker_commission\": $((2500 + i * 250)),
                                    \"insurance_carriers\": [
                                        {\"name\": \"Aetna\", \"type\": \"Health\"},
                                        {\"name\": \"Principal\", \"type\": \"Retirement\"}
                                    ]
                                }
                            },
                            {
                                \"name\": \"Portfolio Company B$i\",
                                \"legal_entity_name\": \"PORTFOLIO COMPANY B$i INC\",
                                \"city\": \"San Francisco\",
                                \"state\": \"CA\",
                                \"exited\": true,
                                \"confidence_level\": \"medium\",
                                \"form5500_data\": {
                                    \"ein\": \"98-765432$i\",
                                    \"plan_year\": 2023,
                                    \"active_participants\": $((200 + i * 15)),
                                    \"total_charges\": $((75000 + i * 7500)),
                                    \"broker_commission\": $((3750 + i * 375)),
                                    \"insurance_carriers\": [
                                        {\"name\": \"Blue Cross\", \"type\": \"Health\"},
                                        {\"name\": \"Fidelity\", \"type\": \"Retirement\"}
                                    ]
                                }
                            },
                            {
                                \"name\": \"Portfolio Company C$i\",
                                \"legal_entity_name\": \"PORTFOLIO COMPANY C$i CORP\",
                                \"city\": \"Austin\",
                                \"state\": \"TX\",
                                \"exited\": false,
                                \"confidence_level\": \"low\"
                            }
                        ]
                    }
                }" > /dev/null
        fi
        
        # Update pipeline status (unless it's pending, which is default)
        if [ "$selected_status" != "pending" ]; then
            echo "  🔄 Setting status to: $selected_status"
            curl -s -X POST "$BASE_URL/$pipeline_id/update" \
                -H "Content-Type: application/json" \
                -d "{
                    \"updates\": {
                        \"status\": \"$selected_status\"
                    }
                }" > /dev/null
            echo "  ✅ Updated pipeline $pipeline_id status to $selected_status"
        else
            echo "  ✅ Pipeline $pipeline_id left as pending"
        fi
        
    else
        echo "  ❌ Failed to create pipeline $i"
    fi
    
    sleep 0.2
done

echo ""
echo "🎉 Created 10 test pipelines with various statuses!"
echo ""
echo "Status distribution:"
echo "  • Pipeline 1: pending"
echo "  • Pipeline 2: research_running" 
echo "  • Pipeline 3: research_complete"
echo "  • Pipeline 4: legal_resolution_running"
echo "  • Pipeline 5: legal_resolution_complete"
echo "  • Pipeline 6: data_extraction_running"
echo "  • Pipeline 7: data_extraction_complete (with Form 5500 data)"
echo "  • Pipeline 8: failed"
echo "  • Pipeline 9: pending"
echo "  • Pipeline 10: research_running"
echo ""
echo "Test the API:"
echo "curl \"http://localhost:3000/api/pipeline?limit=10&offset=0\""