#!/bin/bash

# Smart Insurance - Delete All Pipeline Data Script
# This script will delete all pipelines from the database

echo "🗑️  Smart Insurance - Delete All Pipeline Data"
echo "=============================================="
echo ""
echo "⚠️  WARNING: This will permanently delete ALL pipeline data!"
echo "This action cannot be undone."
echo ""

# Prompt for confirmation
read -p "Are you sure you want to delete ALL pipelines? (type 'DELETE' to confirm): " confirmation

if [ "$confirmation" != "DELETE" ]; then
    echo "❌ Operation cancelled."
    exit 1
fi

echo ""
echo "🔥 Deleting all pipeline data..."

# Check if server is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ Server is not running on localhost:3000"
    echo "Please start the server first: npm start"
    exit 1
fi

echo "✅ Server is running"

# Login to get authentication session
echo "🔐 Logging in..."

# Get password from server/.env file
SCRIPT_DIR=$(dirname "$0")
ENV_FILE="$SCRIPT_DIR/server/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Cannot find server/.env file at $ENV_FILE"
    exit 1
fi

AUTH_PASSWORD=$(grep "^AUTH_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$AUTH_PASSWORD" ]; then
    echo "❌ AUTH_PASSWORD not found in $ENV_FILE"
    exit 1
fi

# Login and save session to cookies.txt
login_response=$(curl -s -X POST "http://localhost:3000/auth/login" \
    -H "Content-Type: application/json" \
    -c cookies.txt \
    -d "{\"password\": \"$AUTH_PASSWORD\"}")

if echo "$login_response" | grep -q '"success":true'; then
    echo "✅ Successfully logged in"
else
    echo "❌ Login failed"
    echo "Response: $login_response"
    exit 1
fi

# Get all pipelines first to see what we're deleting (using session cookies)
echo "📋 Fetching current pipelines..."
response=$(curl -s -b cookies.txt "http://localhost:3000/api/pipeline?limit=100")

# Check if we got a valid response
if echo "$response" | grep -q '"success":true'; then
    # Count pipelines
    pipeline_count=$(echo "$response" | grep -o '"pipeline_id":[0-9]*' | wc -l)
    echo "📊 Found $pipeline_count pipeline(s) to delete"
    
    if [ "$pipeline_count" -eq 0 ]; then
        echo "✅ No pipelines found. Database is already empty."
        exit 0
    fi
    
    # Extract pipeline IDs and delete each one
    pipeline_ids=$(echo "$response" | grep -o '"pipeline_id":[0-9]*' | grep -o '[0-9]*')
    
    deleted_count=0
    failed_count=0
    
    for pipeline_id in $pipeline_ids; do
        echo "🗑️  Deleting pipeline $pipeline_id..."
        
        delete_response=$(curl -s -X DELETE -b cookies.txt "http://localhost:3000/api/pipeline/$pipeline_id")
        
        if echo "$delete_response" | grep -q '"success":true'; then
            echo "   ✅ Pipeline $pipeline_id deleted successfully"
            ((deleted_count++))
        else
            echo "   ❌ Failed to delete pipeline $pipeline_id"
            ((failed_count++))
        fi
    done
    
    echo ""
    echo "🎯 Deletion Summary:"
    echo "   ✅ Successfully deleted: $deleted_count pipelines"
    echo "   ❌ Failed to delete: $failed_count pipelines"
    
    if [ "$failed_count" -eq 0 ]; then
        echo ""
        echo "🎉 All pipeline data has been successfully deleted!"
    else
        echo ""
        echo "⚠️  Some deletions failed. Check server logs for details."
        exit 1
    fi
    
else
    echo "❌ Failed to fetch pipelines from server"
    echo "Server response: $response"
    exit 1
fi

# Cleanup cookies file
if [ -f "cookies.txt" ]; then
    rm cookies.txt
    echo "🧹 Cleaned up session cookies"
fi

echo ""
echo "✨ Operation complete!"