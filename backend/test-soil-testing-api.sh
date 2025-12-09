#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="http://localhost:3000/api/soil-testing"

echo -e "${YELLOW}=== Soil Testing API Test ===${NC}\n"

# Test 1: Health check
echo -e "${YELLOW}Test 1: API Health Check${NC}"
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
if [ "$response" -eq 200 ]; then
    echo -e "${GREEN}✓ API is running${NC}\n"
else
    echo -e "${RED}✗ API is not responding (HTTP $response)${NC}\n"
    exit 1
fi

# Test 2: Get today's session count
echo -e "${YELLOW}Test 2: Get Today's Session Count${NC}"
curl -s -X GET "$API_URL/sessions/today/count" | json_pp
echo -e "\n"

# Test 3: Get all sessions
echo -e "${YELLOW}Test 3: Get All Sessions${NC}"
curl -s -X GET "$API_URL/sessions" | json_pp
echo -e "\n"

# Test 4: Create a new session
echo -e "${YELLOW}Test 4: Create New Session${NC}"
TODAY=$(date +%Y-%m-%d)
SESSION_DATA=$(cat <<EOF
{
  "date": "$TODAY",
  "version": 1,
  "startTime": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "data": [
    {
      "farmersName": "Test Farmer",
      "mobileNo": "1234567890",
      "location": "Test Location",
      "farmsName": "Test Farm",
      "taluka": "Test Taluka",
      "ph": 6.5,
      "ec": 0.45,
      "ocBlank": 15.5,
      "ocStart": 10.0,
      "ocEnd": 5.2,
      "p2o5R": 12.5,
      "k2oR": 180.0,
      "p2o5": 25.0,
      "k2o": 220.0,
      "cropName": "Cotton",
      "finalDeduction": "Test deduction"
    }
  ]
}
EOF
)

CREATED_SESSION=$(curl -s -X POST "$API_URL/sessions" \
  -H "Content-Type: application/json" \
  -d "$SESSION_DATA")

echo "$CREATED_SESSION" | json_pp

# Extract session ID for next test
SESSION_ID=$(echo "$CREATED_SESSION" | grep -o '"_id":"[^"]*' | cut -d'"' -f4)
echo -e "\n${GREEN}Session ID: $SESSION_ID${NC}\n"

# Test 5: Update session (end session)
if [ ! -z "$SESSION_ID" ]; then
    echo -e "${YELLOW}Test 5: Update Session (End Session)${NC}"
    UPDATE_DATA=$(cat <<EOF
{
  "endTime": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "data": [
    {
      "farmersName": "Test Farmer Updated",
      "mobileNo": "1234567890",
      "location": "Test Location",
      "farmsName": "Test Farm",
      "taluka": "Test Taluka",
      "ph": 7.0,
      "ec": 0.50,
      "ocBlank": 16.0,
      "ocStart": 11.0,
      "ocEnd": 6.0,
      "p2o5R": 13.0,
      "k2oR": 190.0,
      "p2o5": 26.0,
      "k2o": 230.0,
      "cropName": "Wheat",
      "finalDeduction": "Updated test deduction"
    }
  ]
}
EOF
    )

    curl -s -X PUT "$API_URL/sessions/$SESSION_ID" \
      -H "Content-Type: application/json" \
      -d "$UPDATE_DATA" | json_pp
    echo -e "\n"
fi

# Test 6: Get session by ID
if [ ! -z "$SESSION_ID" ]; then
    echo -e "${YELLOW}Test 6: Get Session by ID${NC}"
    curl -s -X GET "$API_URL/sessions/$SESSION_ID" | json_pp
    echo -e "\n"
fi

echo -e "${GREEN}=== All tests completed ===${NC}"
