#!/bin/bash

# Simple script to create 50 test pipelines with fake data
BASE_URL="http://localhost:3000/api/pipeline"

echo "Creating 50 test pipelines..."

for i in {1..50}; do
    echo "Creating pipeline $i/50..."
    
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
        
        # Add fake companies using PUT method
        curl -s -X PUT "$BASE_URL/$pipeline_id/companies" \
            -H "Content-Type: application/json" \
            -d "{
                \"companies\": [
                    {
                        \"name\": \"Company A$i\",
                        \"legal_entity_name\": \"COMPANY A$i LLC\",
                        \"city\": \"New York\",
                        \"state\": \"NY\",
                        \"exited\": false
                    },
                    {
                        \"name\": \"Company B$i\",
                        \"legal_entity_name\": \"COMPANY B$i INC\",
                        \"city\": \"San Francisco\",
                        \"state\": \"CA\",
                        \"exited\": true
                    }
                ]
            }" > /dev/null
        
        echo "  ✅ Added companies to pipeline $pipeline_id"
    else
        echo "  ❌ Failed to create pipeline $i"
    fi
    
    sleep 0.1
done

echo ""
echo "🎉 Created 50 test pipelines!"
echo ""
echo "Test the pagination:"
echo "curl \"http://localhost:3000/api/pipeline?limit=10&offset=0\""