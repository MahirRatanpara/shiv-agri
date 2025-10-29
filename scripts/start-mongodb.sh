#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Shiv Agri - MongoDB Local Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo -e "${YELLOW}Starting MongoDB container...${NC}"
echo ""

# Start MongoDB using docker-compose
docker-compose -f docker-compose.local.yml up -d

# Wait for MongoDB to be ready
echo ""
echo -e "${YELLOW}Waiting for MongoDB to be ready...${NC}"
sleep 5

# Check if container is running
if docker ps | grep -q shiv-agri-mongodb-local; then
    echo ""
    echo -e "${GREEN}✓ MongoDB is running successfully!${NC}"
    echo ""
    echo -e "${BLUE}Connection Details:${NC}"
    echo "  Host: localhost"
    echo "  Port: 27017"
    echo "  Database: shiv-agri"
    echo "  Connection String: mongodb://localhost:27017/shiv-agri"
    echo ""
    echo -e "${BLUE}Sample Projects Loaded:${NC}"
    echo "  1. Green Valley Landscaping (Ahmedabad) - RUNNING"
    echo "  2. Rose Garden Development (Surat) - COMPLETED"
    echo "  3. Urban Terrace Garden (Vadodara) - UPCOMING"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  View logs:        docker logs -f shiv-agri-mongodb-local"
    echo "  Stop MongoDB:     ./scripts/stop-mongodb.sh"
    echo "  Connect CLI:      mongosh mongodb://localhost:27017/shiv-agri"
    echo "  View containers:  docker ps"
    echo ""
    echo -e "${GREEN}Ready for development! 🚀${NC}"
else
    echo ""
    echo -e "${RED}✗ Failed to start MongoDB${NC}"
    echo "Check logs with: docker-compose -f docker-compose.local.yml logs"
    exit 1
fi
