#!/bin/bash

# MongoDB Backup Script for Shiv-Agri
# This script creates automated backups of MongoDB database
# Usage: ./mongodb-backup.sh

set -e

# Configuration
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# MongoDB credentials
MONGO_USER="admin"
MONGO_PASSWORD=$MONGO_ROOT_PASSWORD
MONGO_DB="shiv-agri"
MONGO_HOST="127.0.0.1"
MONGO_PORT="27017"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    log_info "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
fi

# Create backup
log_info "Starting MongoDB backup at $DATE"
log_info "Database: $MONGO_DB"
log_info "Backup location: $BACKUP_DIR"

# Perform mongodump
if mongodump \
    --host "$MONGO_HOST" \
    --port "$MONGO_PORT" \
    --username "$MONGO_USER" \
    --password "$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --db "$MONGO_DB" \
    --out "$BACKUP_DIR/$DATE" > /dev/null 2>&1; then
    log_info "Database dump completed successfully"
else
    log_error "Database dump failed"
    exit 1
fi

# Compress backup
log_info "Compressing backup..."
cd "$BACKUP_DIR"

if tar -czf "$MONGO_DB-$DATE.tar.gz" "$DATE" 2>/dev/null; then
    log_info "Backup compressed successfully"
    rm -rf "$DATE"
else
    log_error "Backup compression failed"
    exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$MONGO_DB-$DATE.tar.gz" | cut -f1)
log_info "Backup size: $BACKUP_SIZE"

# Remove old backups
log_info "Removing backups older than $RETENTION_DAYS days..."
OLD_BACKUPS=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS)

if [ -n "$OLD_BACKUPS" ]; then
    echo "$OLD_BACKUPS" | while read -r backup; do
        log_warn "Removing old backup: $(basename "$backup")"
        rm -f "$backup"
    done
else
    log_info "No old backups to remove"
fi

# Summary
log_info "========================================="
log_info "Backup completed successfully!"
log_info "File: $MONGO_DB-$DATE.tar.gz"
log_info "Location: $BACKUP_DIR"
log_info "========================================="

# List current backups
log_info "Current backups:"
ls -lh "$BACKUP_DIR"/*.tar.gz 2>/dev/null | awk '{print "  - " $9 " (" $5 ")"}'

exit 0
