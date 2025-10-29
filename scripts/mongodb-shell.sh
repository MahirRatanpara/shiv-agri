#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MongoDB Shell Access${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if MongoDB is running
if ! docker ps | grep -q shiv-agri-mongodb-local; then
    echo -e "${RED}Error: MongoDB container is not running${NC}"
    echo "Start it first: ./scripts/start-mongodb.sh"
    exit 1
fi

echo -e "${GREEN}Connecting to MongoDB...${NC}"
echo -e "${BLUE}Database: shiv-agri${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  show collections          - List all collections"
echo "  db.projects.find()        - Show all projects"
echo "  db.projects.countDocuments() - Count projects"
echo "  exit                      - Exit shell"
echo ""

# Connect to MongoDB shell
docker exec -it shiv-agri-mongodb-local mongosh mongodb://localhost:27017/shiv-agri
