#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Stopping MongoDB${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Stopping MongoDB container...${NC}"
docker-compose -f docker-compose.local.yml down

echo ""
echo -e "${GREEN}✓ MongoDB stopped${NC}"
echo ""
echo -e "${BLUE}To start again:${NC} ./scripts/start-mongodb.sh"
echo -e "${BLUE}To remove data:${NC} docker volume rm shiv-agri_mongodb_data_local"
echo ""
