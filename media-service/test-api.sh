#!/bin/bash
# Media Service API Test Script (Two-Step Upload)
# Usage: ./test-api.sh [BASE_URL]

BASE_URL="${1:-http://localhost:8081}"
API="$BASE_URL/api/v1/media"
PASSED=0
FAILED=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
bold() { printf "\033[1m%s\033[0m\n" "$1"; }

check() {
  if [ "$1" -eq 0 ]; then
    green "  PASS: $2"
    PASSED=$((PASSED + 1))
  else
    red "  FAIL: $2"
    FAILED=$((FAILED + 1))
  fi
}

# Create a test image (1x1 red pixel PNG)
TEST_IMAGE="/tmp/test-media-upload.png"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$TEST_IMAGE"
TEST_IMAGE_SIZE=$(wc -c < "$TEST_IMAGE" | tr -d ' ')

bold "========================================="
bold "  Media Service API Tests (Two-Step)"
bold "  Base URL: $BASE_URL"
bold "========================================="
echo ""

# ----- Test 1: Health Check -----
bold "[Test 1] Health Check"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/actuator/health")
check $([[ "$HEALTH" == "200" ]] && echo 0 || echo 1) "GET /actuator/health -> $HEALTH"
echo ""

# ----- Test 2: Initiate Upload (Step 1) -----
bold "[Test 2] Initiate Upload (Step 1 - metadata only)"
INITIATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"filename\": \"test.png\", \"mimeType\": \"image/png\", \"sizeBytes\": $TEST_IMAGE_SIZE}")
INITIATE_STATUS=$(echo "$INITIATE_RESPONSE" | tail -1)
INITIATE_BODY=$(echo "$INITIATE_RESPONSE" | sed '$d')
check $([[ "$INITIATE_STATUS" == "201" ]] && echo 0 || echo 1) "POST /api/v1/media (initiate) -> $INITIATE_STATUS"

MEDIA_ID=$(echo "$INITIATE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
UPLOAD_URL=$(echo "$INITIATE_BODY" | grep -o '"uploadUrl":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Media ID: $MEDIA_ID"
echo "  Upload URL: $UPLOAD_URL"
echo ""

# ----- Test 3: Complete Upload (Step 2) -----
bold "[Test 3] Complete Upload (Step 2 - file upload)"
if [ -n "$MEDIA_ID" ] && [ -n "$UPLOAD_URL" ]; then
  UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$UPLOAD_URL" \
    -F "file=@$TEST_IMAGE")
  UPLOAD_STATUS=$(echo "$UPLOAD_RESPONSE" | tail -1)
  UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')
  check $([[ "$UPLOAD_STATUS" == "200" ]] && echo 0 || echo 1) "PUT $UPLOAD_URL -> $UPLOAD_STATUS"

  CONTENT_URL=$(echo "$UPLOAD_BODY" | grep -o '"contentUrl":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Content URL: $CONTENT_URL"
else
  red "  SKIP: No media ID or upload URL from step 1"
fi
echo ""

# ----- Test 4: Initiate + Complete with alt text and tags -----
bold "[Test 4] Two-Step Upload with alt text and tags"
INITIATE2_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"filename\": \"test2.png\", \"mimeType\": \"image/png\", \"sizeBytes\": $TEST_IMAGE_SIZE, \"altText\": \"Test image\", \"tags\": [\"test\", \"automation\"]}")
INITIATE2_STATUS=$(echo "$INITIATE2_RESPONSE" | tail -1)
INITIATE2_BODY=$(echo "$INITIATE2_RESPONSE" | sed '$d')
check $([[ "$INITIATE2_STATUS" == "201" ]] && echo 0 || echo 1) "POST /api/v1/media (with metadata) -> $INITIATE2_STATUS"

MEDIA_ID2=$(echo "$INITIATE2_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
UPLOAD_URL2=$(echo "$INITIATE2_BODY" | grep -o '"uploadUrl":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$MEDIA_ID2" ] && [ -n "$UPLOAD_URL2" ]; then
  UPLOAD2_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$UPLOAD_URL2" \
    -F "file=@$TEST_IMAGE")
  UPLOAD2_STATUS=$(echo "$UPLOAD2_RESPONSE" | tail -1)
  check $([[ "$UPLOAD2_STATUS" == "200" ]] && echo 0 || echo 1) "PUT $UPLOAD_URL2 -> $UPLOAD2_STATUS"
fi
echo ""

# ----- Test 5: Get Metadata (should include contentUrl) -----
bold "[Test 5] Get Metadata"
if [ -n "$MEDIA_ID" ]; then
  META_RESPONSE=$(curl -s -w "\n%{http_code}" "$API/$MEDIA_ID")
  META_STATUS=$(echo "$META_RESPONSE" | tail -1)
  META_BODY=$(echo "$META_RESPONSE" | sed '$d')
  check $([[ "$META_STATUS" == "200" ]] && echo 0 || echo 1) "GET /api/v1/media/$MEDIA_ID -> $META_STATUS"

  HAS_CONTENT_URL=$(echo "$META_BODY" | grep -c '"contentUrl"')
  check $([[ "$HAS_CONTENT_URL" -gt 0 ]] && echo 0 || echo 1) "Response contains contentUrl"
else
  red "  SKIP: No media ID"
fi
echo ""

# ----- Test 6: Get Content (download via contentUrl) -----
bold "[Test 6] Get Content (Download)"
if [ -n "$MEDIA_ID" ]; then
  CONTENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/$MEDIA_ID/content")
  check $([[ "$CONTENT_STATUS" == "200" ]] && echo 0 || echo 1) "GET /api/v1/media/$MEDIA_ID/content -> $CONTENT_STATUS"
else
  red "  SKIP: No media ID"
fi
echo ""

# ----- Test 7: Batch Resolve -----
bold "[Test 7] Batch Resolve"
if [ -n "$MEDIA_ID" ] && [ -n "$MEDIA_ID2" ]; then
  BATCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API/batch-resolve" \
    -H "Content-Type: application/json" \
    -d "{\"ids\": [\"$MEDIA_ID\", \"$MEDIA_ID2\", \"nonexistent-id\"]}")
  BATCH_STATUS=$(echo "$BATCH_RESPONSE" | tail -1)
  BATCH_BODY=$(echo "$BATCH_RESPONSE" | sed '$d')
  check $([[ "$BATCH_STATUS" == "200" ]] && echo 0 || echo 1) "POST /api/v1/media/batch-resolve -> $BATCH_STATUS"

  HAS_CONTENT_URL=$(echo "$BATCH_BODY" | grep -c '"contentUrl"')
  check $([[ "$HAS_CONTENT_URL" -gt 0 ]] && echo 0 || echo 1) "Batch response contains contentUrl"
else
  red "  SKIP: No media IDs"
fi
echo ""

# ----- Test 8: Status Update -----
bold "[Test 8] Status Update (ACTIVE -> DELETED)"
if [ -n "$MEDIA_ID" ]; then
  STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "$API/$MEDIA_ID/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "DELETED", "reason": "test cleanup"}')
  STATUS_CODE=$(echo "$STATUS_RESPONSE" | tail -1)
  STATUS_BODY=$(echo "$STATUS_RESPONSE" | sed '$d')
  check $([[ "$STATUS_CODE" == "200" ]] && echo 0 || echo 1) "PATCH /api/v1/media/$MEDIA_ID/status -> $STATUS_CODE"
else
  red "  SKIP: No media ID"
fi
echo ""

# ----- Test 9: Get Deleted Media (expect 404) -----
bold "[Test 9] Get Deleted Media (expect 404)"
if [ -n "$MEDIA_ID" ]; then
  GONE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/$MEDIA_ID")
  check $([[ "$GONE_STATUS" == "404" ]] && echo 0 || echo 1) "GET /api/v1/media/$MEDIA_ID (deleted) -> $GONE_STATUS"
else
  red "  SKIP: No media ID"
fi
echo ""

# ----- Test 10: Invalid Status Transition (expect 409) -----
bold "[Test 10] Invalid Status Transition (expect 409)"
if [ -n "$MEDIA_ID2" ]; then
  INVALID_TRANS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/$MEDIA_ID2/status" \
    -H "Content-Type: application/json" \
    -d '{"status": "UPLOADING"}')
  check $([[ "$INVALID_TRANS" == "409" ]] && echo 0 || echo 1) "PATCH status ACTIVE->UPLOADING -> $INVALID_TRANS"
else
  red "  SKIP: No media ID"
fi
echo ""

# ----- Test 11: Upload to non-UPLOADING media (expect 409) -----
bold "[Test 11] Upload to ACTIVE media (expect 409)"
if [ -n "$MEDIA_ID2" ]; then
  DUP_UPLOAD=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/$MEDIA_ID2/upload" \
    -F "file=@$TEST_IMAGE")
  check $([[ "$DUP_UPLOAD" == "409" ]] && echo 0 || echo 1) "PUT upload to ACTIVE media -> $DUP_UPLOAD"
else
  red "  SKIP: No media ID"
fi
echo ""

# ----- Test 12: Initiate with invalid MIME type (expect 400) -----
bold "[Test 12] Initiate Upload - Invalid MIME type (expect 400)"
INVALID_MIME=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API" \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.txt", "mimeType": "text/plain", "sizeBytes": 100}')
check $([[ "$INVALID_MIME" == "400" || "$INVALID_MIME" == "415" ]] && echo 0 || echo 1) "POST /api/v1/media (txt) -> $INVALID_MIME"
echo ""

# ----- Test 13: Get Non-existent Media (expect 404) -----
bold "[Test 13] Get Non-existent Media (expect 404)"
NOT_FOUND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/nonexistent-id-12345")
check $([[ "$NOT_FOUND_STATUS" == "404" ]] && echo 0 || echo 1) "GET /api/v1/media/nonexistent-id -> $NOT_FOUND_STATUS"
echo ""

# ----- Test 14: Batch Resolve - Empty list (expect 400) -----
bold "[Test 14] Batch Resolve - Empty list (expect 400)"
EMPTY_BATCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/batch-resolve" \
  -H "Content-Type: application/json" \
  -d '{"ids": []}')
check $([[ "$EMPTY_BATCH_STATUS" == "400" ]] && echo 0 || echo 1) "POST /api/v1/media/batch-resolve (empty) -> $EMPTY_BATCH_STATUS"
echo ""

# ----- Cleanup -----
if [ -n "$MEDIA_ID2" ]; then
  curl -s -o /dev/null -X DELETE "$API/$MEDIA_ID2"
fi
rm -f "$TEST_IMAGE"

# ----- Summary -----
bold "========================================="
bold "  Results: $(green "$PASSED passed"), $(red "$FAILED failed")"
bold "========================================="

exit $FAILED
