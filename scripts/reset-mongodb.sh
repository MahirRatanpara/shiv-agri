#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Reset MongoDB Database${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${RED}WARNING: This will delete all data in the database!${NC}"
echo -e "${YELLOW}Sample projects will be reloaded.${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Operation cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}Step 1: Stopping MongoDB...${NC}"
docker-compose -f docker-compose.local.yml down

echo ""
echo -e "${YELLOW}Step 2: Removing data volume...${NC}"
docker volume rm shiv-agri_mongodb_data_local 2>/dev/null || echo "Volume already removed or doesn't exist"

echo ""
echo -e "${YELLOW}Step 3: Starting fresh MongoDB with sample data...${NC}"
docker-compose -f docker-compose.local.yml up -d

echo ""
echo -e "${YELLOW}Step 4: Waiting for MongoDB to initialize...${NC}"
sleep 8

# Check if container is running and healthy
if docker ps | grep -q shiv-agri-mongodb-local; then
    echo ""
    echo -e "${GREEN}✓ MongoDB reset complete!${NC}"
    echo ""
    echo -e "${BLUE}Sample Projects Loaded:${NC}"
    echo "  1. Green Valley Landscaping (Ahmedabad) - RUNNING"
    echo "  2. Rose Garden Development (Surat) - COMPLETED"
    echo "  3. Urban Terrace Garden (Vadodara) - UPCOMING"
    echo ""
    echo -e "${GREEN}Database is ready! 🚀${NC}"
else
    echo ""
    echo -e "${RED}✗ Failed to reset MongoDB${NC}"
    echo "Check logs with: docker-compose -f docker-compose.local.yml logs"
    exit 1
fi
