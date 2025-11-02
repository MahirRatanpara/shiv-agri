#!/bin/bash

#########################################################
# Shiv-Agri VPS Initial Setup Script
#
# This script automates the initial setup of a fresh
# Hostinger VPS for deploying Shiv-Agri application
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/USERNAME/shiv-agri/main/scripts/vps-setup.sh | bash
#   or
#   wget -O - https://raw.githubusercontent.com/USERNAME/shiv-agri/main/scripts/vps-setup.sh | bash
#
#########################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/var/www/shiv-agri"
BACKUP_DIR="/backups/shivagri"

# Functions
print_header() {
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================${NC}\n"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (use sudo)"
    exit 1
fi

print_header "Shiv-Agri VPS Setup - Starting Installation"

# Update system
print_header "Step 1: Updating System"
log_info "Updating package lists..."
apt update -y
log_info "Upgrading installed packages..."
apt upgrade -y
log_success "System updated successfully"

# Install essential packages
print_header "Step 2: Installing Essential Packages"
log_info "Installing curl, wget, git, ufw..."
apt install -y curl wget git ufw net-tools
log_success "Essential packages installed"

# Install Docker
print_header "Step 3: Installing Docker"
if command -v docker &> /dev/null; then
    log_warning "Docker is already installed"
    docker --version
else
    log_info "Downloading Docker installation script..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    log_info "Installing Docker..."
    sh get-docker.sh
    rm get-docker.sh
    log_success "Docker installed successfully"
fi

# Install Docker Compose plugin
print_header "Step 4: Installing Docker Compose"
if docker compose version &> /dev/null; then
    log_warning "Docker Compose is already installed"
    docker compose version
else
    log_info "Installing Docker Compose plugin..."
    apt install -y docker-compose-plugin
    log_success "Docker Compose installed successfully"
fi

# Start and enable Docker
log_info "Starting Docker service..."
systemctl start docker
systemctl enable docker
log_success "Docker service started and enabled"

# Configure Firewall
print_header "Step 5: Configuring Firewall (UFW)"
log_info "Setting up firewall rules..."

# Reset UFW to default
ufw --force reset

# Set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (critical - do this first!)
ufw allow 22/tcp
log_info "✓ SSH (22) allowed"

# Allow HTTP and HTTPS
ufw allow 80/tcp
log_info "✓ HTTP (80) allowed"

ufw allow 443/tcp
log_info "✓ HTTPS (443) allowed"

# Enable firewall
echo "y" | ufw enable

log_success "Firewall configured successfully"
ufw status

# Create directory structure
print_header "Step 6: Creating Directory Structure"
log_info "Creating application directory: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"

log_info "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

log_success "Directory structure created"

# Prompt for Docker Hub credentials
print_header "Step 7: Docker Hub Configuration"
echo -n "Enter your Docker Hub username: "
read DOCKERHUB_USERNAME

echo -n "Enter your Docker Hub password or access token: "
read -s DOCKERHUB_TOKEN
echo

log_info "Logging into Docker Hub..."
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin

if [ $? -eq 0 ]; then
    log_success "Successfully logged into Docker Hub"
else
    log_error "Failed to login to Docker Hub. Please check your credentials."
    exit 1
fi

# Create .env file
print_header "Step 8: Creating Environment File"
log_warning "You will need to edit this file with your actual values!"

cat > "$PROJECT_DIR/.env" << EOF
# Docker Hub Configuration
DOCKERHUB_USERNAME=$DOCKERHUB_USERNAME

# MongoDB Configuration (CHANGE THESE!)
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=CHANGE_THIS_PASSWORD
MONGO_DB=shiv-agri
MONGO_USER=shivagri-app
MONGO_PASSWORD=CHANGE_THIS_PASSWORD

# API Configuration (CHANGE THESE!)
NODE_ENV=production
PORT=3000
JWT_SECRET=CHANGE_THIS_TO_LONG_RANDOM_STRING_MIN_32_CHARS

# Domain Configuration (CHANGE THESE!)
DOMAIN=yourdomain.com
API_DOMAIN=api.yourdomain.com
EOF

chmod 600 "$PROJECT_DIR/.env"
log_success ".env file created at $PROJECT_DIR/.env"
log_warning "IMPORTANT: Edit $PROJECT_DIR/.env and update all passwords and domain!"

# Create docker-compose.prod.yml
print_header "Step 9: Creating Docker Compose File"
cat > "$PROJECT_DIR/docker-compose.prod.yml" << 'EOF'
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    container_name: shivagri-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: ${MONGO_DB}
    volumes:
      - mongodb_data:/data/db
      - mongodb_config:/data/configdb
    networks:
      - app-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 30s
      timeout: 10s
      retries: 3

  api:
    image: ${DOCKERHUB_USERNAME}/shiv-agri-api:latest
    container_name: shivagri-api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      MONGODB_URI: mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongodb:27017/${MONGO_DB}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - api_uploads:/app/uploads
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - app-network

  frontend:
    image: ${DOCKERHUB_USERNAME}/shiv-agri-frontend:latest
    container_name: shivagri-frontend
    restart: unless-stopped
    networks:
      - app-network

  nginx:
    image: ${DOCKERHUB_USERNAME}/shiv-agri-nginx:latest
    container_name: shivagri-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - certbot_www:/var/www/certbot:ro
      - certbot_conf:/etc/letsencrypt:ro
    depends_on:
      - api
      - frontend
    networks:
      - app-network

  certbot:
    image: certbot/certbot
    container_name: shivagri-certbot
    volumes:
      - certbot_www:/var/www/certbot
      - certbot_conf:/etc/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  mongodb_data:
  mongodb_config:
  api_uploads:
  certbot_www:
  certbot_conf:

networks:
  app-network:
    driver: bridge
EOF

log_success "docker-compose.prod.yml created at $PROJECT_DIR/docker-compose.prod.yml"

# Create backup script
print_header "Step 10: Creating Backup Script"
cat > /root/backup-shivagri.sh << 'BACKUP_SCRIPT'
#!/bin/bash
set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/shivagri"
PROJECT_DIR="/var/www/shiv-agri"

mkdir -p $BACKUP_DIR

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
fi

echo "[$(date)] Starting MongoDB backup..."

cd $PROJECT_DIR
docker compose -f docker-compose.prod.yml exec -T mongodb mongodump \
    --uri="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@localhost:27017" \
    --archive | gzip > $BACKUP_DIR/mongo-$DATE.gz

echo "[$(date)] Backup created: mongo-$DATE.gz"

# Keep last 7 days
find $BACKUP_DIR -name "mongo-*.gz" -mtime +7 -delete
echo "[$(date)] Backup completed"
BACKUP_SCRIPT

chmod +x /root/backup-shivagri.sh
log_success "Backup script created at /root/backup-shivagri.sh"

# Setup cron job for backups
log_info "Setting up daily backup cron job (2 AM)..."
(crontab -l 2>/dev/null; echo "0 2 * * * /root/backup-shivagri.sh >> /var/log/shivagri-backup.log 2>&1") | crontab -
log_success "Cron job configured"

# Print summary
print_header "Setup Complete!"

cat << SUMMARY

${GREEN}✓ System updated
✓ Docker and Docker Compose installed
✓ Firewall configured (ports 22, 80, 443)
✓ Application directory created: $PROJECT_DIR
✓ Backup directory created: $BACKUP_DIR
✓ GHCR login successful
✓ Environment file created
✓ Docker Compose file created
✓ Backup script configured${NC}

${YELLOW}NEXT STEPS:${NC}

1. Edit the environment file:
   ${BLUE}nano $PROJECT_DIR/.env${NC}

   Update the following:
   - MONGO_ROOT_PASSWORD
   - MONGO_PASSWORD
   - JWT_SECRET
   - DOMAIN
   - API_DOMAIN

2. Configure DNS records to point to this server's IP

3. Deploy the application:
   ${BLUE}cd $PROJECT_DIR
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d${NC}

4. Setup SSL certificate (after DNS propagation):
   ${BLUE}docker compose -f docker-compose.prod.yml run --rm certbot certonly \\
     --webroot --webroot-path=/var/www/certbot \\
     -d yourdomain.com -d www.yourdomain.com \\
     --email your@email.com --agree-tos${NC}

5. Add GitHub Actions SSH key:
   ${BLUE}nano ~/.ssh/authorized_keys${NC}
   (Paste the public key from your GitHub Actions setup)

${GREEN}For detailed instructions, see DEPLOYMENT.md in the repository.${NC}

SUMMARY

log_success "VPS setup completed successfully!"

exit 0
