#!/bin/bash

#########################################################
# MongoDB Backup Script for Shiv-Agri Production
#
# This script backs up the MongoDB database and keeps
# backups for the last 7 days
#
# Usage: ./backup-mongodb.sh
#########################################################

set -e

# Configuration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/shivagri"
PROJECT_DIR="/var/www/shiv-agri"
RETENTION_DAYS=7

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log_info "Starting MongoDB backup at $(date)"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
else
    log_error ".env file not found at $PROJECT_DIR/.env"
    exit 1
fi

# Navigate to project directory
cd "$PROJECT_DIR"

# Create backup
log_info "Creating backup: mongo-$DATE.gz"

if docker compose -f docker-compose.prod.yml exec -T mongodb mongodump \
    --uri="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@localhost:27017" \
    --archive | gzip > "$BACKUP_DIR/mongo-$DATE.gz"; then

    log_info "Backup created successfully"

    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/mongo-$DATE.gz" | cut -f1)
    log_info "Backup size: $BACKUP_SIZE"
else
    log_error "Backup failed!"
    exit 1
fi

# Clean up old backups
log_info "Cleaning up backups older than $RETENTION_DAYS days"
DELETED_COUNT=$(find "$BACKUP_DIR" -name "mongo-*.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
log_info "Deleted $DELETED_COUNT old backup(s)"

# List current backups
log_info "Current backups:"
ls -lh "$BACKUP_DIR"/mongo-*.gz 2>/dev/null || log_warning "No backups found"

# Optional: Upload to external storage (uncomment if using rclone)
# log_info "Uploading backup to remote storage"
# if rclone copy "$BACKUP_DIR/mongo-$DATE.gz" remote:shivagri-backups/; then
#     log_info "Backup uploaded to remote storage"
# else
#     log_warning "Failed to upload backup to remote storage"
# fi

log_info "Backup process completed at $(date)"

# Optional: Send notification (uncomment if needed)
# curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
#     -d chat_id=<YOUR_CHAT_ID> \
#     -d text="MongoDB backup completed successfully: $BACKUP_SIZE"

exit 0
