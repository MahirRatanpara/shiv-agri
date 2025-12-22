# MongoDB Migration Guide: Docker to Native Installation

## Overview

This guide provides step-by-step instructions to migrate MongoDB from Docker-based deployment to a native installation on Hostinger VPS for the Shiv-Agri application. This migration will improve performance, simplify management, and optimize resource utilization.

**Current Setup:**
- MongoDB Version: 7.0
- Database Name: `shiv-agri`
- Root User: `admin`
- App User: `shivagri-app`
- Container Name: `shivagri-mongodb`

**Target Setup:**
- Native MongoDB 7.0 installation
- Same database and user configuration
- Enhanced security with authentication
- Automated backup system
- Optional: External access for debugging (MongoDB Compass, Atlas, etc.)

---

## Prerequisites

- [ ] Root/sudo access to Hostinger VPS (77.37.47.117)
- [ ] Minimum 2GB RAM available
- [ ] Sufficient disk space (check current usage + 50% buffer)
- [ ] Backup storage location identified
- [ ] Maintenance window scheduled (recommended: low-traffic period)

---

## Phase 1: Preparation & Current State Assessment

### 1.1 Check Current MongoDB Setup

```bash
# SSH into the VPS
ssh root@77.37.47.117

# Check MongoDB container status
docker ps --filter name=shivagri-mongodb

# Check MongoDB version
docker exec shivagri-mongodb mongosh --version

# Check database size and statistics
docker exec shivagri-mongodb mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "db.stats()" shiv-agri

# List all databases
docker exec shivagri-mongodb mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "show dbs"

# Check collections in shiv-agri database
docker exec shivagri-mongodb mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "db.getCollectionNames()" shiv-agri

# Check current Docker volume location
docker volume inspect shiv-agri_mongodb_data

# Check disk space
df -h
```

### 1.2 Document Current Configuration

```bash
# View current environment variables
cat /var/www/shiv-agri/.env

# Check docker-compose configuration
cat /var/www/shiv-agri/docker-compose.prod.yml

# Document current connection string (from API container)
docker exec shivagri-api printenv MONGODB_URI
```

**Expected Output:**
```
MONGODB_URI=mongodb://shivagri-app:shivagri246*%40@mongodb:27017/shiv-agri
```

---

## Phase 2: Backup Current Data

### 2.1 Create Backup Directory

```bash
# Create backup directory on VPS
mkdir -p /root/mongodb-backup-$(date +%Y%m%d)
cd /root/mongodb-backup-$(date +%Y%m%d)
```

### 2.2 Perform Full Database Backup

```bash
# Dump all databases with authentication
docker exec shivagri-mongodb mongodump \
  --username admin \
  --password 'MONGO_ROOT_PASSWORD' \
  --authenticationDatabase admin \
  --out /dump

# Copy backup from container to host
docker cp shivagri-mongodb:/dump ./mongodb-dump-$(date +%Y%m%d_%H%M%S)

# Verify backup files
ls -lh ./mongodb-dump-*/
ls -lh ./mongodb-dump-*/shiv-agri/

# Check backup size
du -sh ./mongodb-dump-*/
```

### 2.3 Create Additional Safety Backup (Recommended)

```bash
# Export specific database as archive
docker exec shivagri-mongodb mongodump \
  --username admin \
  --password 'MONGO_ROOT_PASSWORD' \
  --authenticationDatabase admin \
  --db shiv-agri \
  --archive=/backup/shiv-agri-$(date +%Y%m%d).archive

# Copy archive to host
docker cp shivagri-mongodb:/backup/shiv-agri-$(date +%Y%m%d).archive ./

# Compress backup for long-term storage
tar -czf mongodb-backup-complete-$(date +%Y%m%d).tar.gz ./mongodb-dump-*
```

### 2.4 Verify Backup Integrity

```bash
# List all collections in backup
ls -R ./mongodb-dump-*/shiv-agri/

# Verify JSON/BSON files exist
find ./mongodb-dump-* -name "*.bson" -o -name "*.json"
```

---

## Phase 3: Install Native MongoDB

### 3.1 Install MongoDB 7.0 on Ubuntu

```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add MongoDB repository (for Ubuntu 22.04)
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# If using Ubuntu 20.04, use this instead:
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Update package database
sudo apt-get update

# Install MongoDB
sudo apt-get install -y mongodb-org

# Pin MongoDB version to prevent accidental upgrades
echo "mongodb-org hold" | sudo dpkg --set-selections
echo "mongodb-org-database hold" | sudo dpkg --set-selections
echo "mongodb-org-server hold" | sudo dpkg --set-selections
echo "mongodb-org-mongos hold" | sudo dpkg --set-selections
echo "mongodb-org-tools hold" | sudo dpkg --set-selections
```

### 3.2 Verify Installation

```bash
# Check MongoDB version
mongod --version

# Check MongoDB service status (should be inactive initially)
sudo systemctl status mongod
```

---

## Phase 4: Configure Native MongoDB

### 4.1 Configure MongoDB Settings

```bash
# Backup default configuration
sudo cp /etc/mongod.conf /etc/mongod.conf.backup

# Edit MongoDB configuration
sudo nano /etc/mongod.conf
```

**Update `/etc/mongod.conf` with the following settings:**

```yaml
# mongod.conf

# Storage settings
storage:
  dbPath: /var/lib/mongodb
  # Note: journal is enabled by default in MongoDB 7.0, no need to specify

# Network settings
net:
  port: 27017
  bindIp: 127.0.0.1  # Only localhost for security (API runs on same server)
  # For external access (debugging), use: bindIp: 0.0.0.0 (see Phase 4.4 for security setup)

# Security settings
security:
  authorization: enabled

# Process management
processManagement:
  timeZoneInfo: /usr/share/zoneinfo

# Logging
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
```

**Important:** Do NOT use `journal.enabled: true` as it's not supported in MongoDB 7.0. Journaling is enabled by default.

### 4.2 Start MongoDB Service

```bash
# Start MongoDB
sudo systemctl start mongod

# Enable MongoDB to start on boot
sudo systemctl enable mongod

# Verify MongoDB is running
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

### 4.3 Configure Users and Authentication

```bash
# Connect to MongoDB (no authentication needed initially)
mongosh

# In mongosh, create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "MONGO_ROOT_PASSWORD",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "dbAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" }
  ]
})

# Exit mongosh
exit
```

**Now restart MongoDB to enable authentication:**

```bash
# Restart MongoDB service
sudo systemctl restart mongod

# Verify authentication works
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin
```

### 4.4 Enable External Access (Optional - For Debugging)

**This section is OPTIONAL and should only be enabled if you need to access MongoDB from external tools like MongoDB Compass, MongoDB Atlas Data Explorer, or other database management tools for debugging purposes.**

#### 4.4.1 Configure MongoDB for External Access

```bash
# Edit MongoDB configuration
sudo nano /etc/mongod.conf
```

**Update the network settings:**

```yaml
# Network settings
net:
  port: 27017
  bindIp: 0.0.0.0  # Allow connections from any IP
  # For more security, specify: bindIp: 127.0.0.1,YOUR_IP_ADDRESS
```

**Restart MongoDB to apply changes:**

```bash
sudo systemctl restart mongod
sudo systemctl status mongod
```

#### 4.4.2 Configure Firewall (UFW)

**Allow MongoDB port with rate limiting to prevent brute force attacks:**

```bash
# Check if UFW is active
sudo ufw status

# Allow MongoDB port 27017 (with rate limiting)
sudo ufw allow from any to any port 27017 proto tcp

# For better security, allow only specific IP addresses:
# sudo ufw allow from YOUR_IP_ADDRESS to any port 27017 proto tcp
# Example: sudo ufw allow from 203.0.113.0/24 to any port 27017 proto tcp

# Enable rate limiting to prevent brute force attacks
sudo ufw limit 27017/tcp

# Reload firewall
sudo ufw reload

# Verify rule is added
sudo ufw status numbered
```

#### 4.4.3 Create Read-Only User for Debugging (Recommended)

**For security, create a separate read-only user for external debugging instead of using admin credentials:**

```bash
# Connect as admin
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin
```

**In mongosh:**

```javascript
// Switch to shiv-agri database
use shiv-agri

// Create read-only debug user
db.createUser({
  user: "shivagri.dev",
  pwd: "MONGO_RO_PASSWORD",  // Use a strong password
  roles: [
    { role: "read", db: "shiv-agri" }
  ]
})

// Verify user creation
db.getUsers()

// Exit
exit
```

**Test external connection:**

```bash
# Test from your local machine (replace with your VPS IP)
mongosh "mongodb://debug-user:YOUR_SECURE_DEBUG_PASSWORD@77.37.47.117:27017/shiv-agri?authSource=shiv-agri"
```

#### 4.4.4 Connection Strings for External Tools

**For MongoDB Compass:**
```
mongodb://debug-user:YOUR_SECURE_DEBUG_PASSWORD@77.37.47.117:27017/shiv-agri?authSource=shiv-agri
```

**For Admin Access (use with caution):**
```
mongodb://admin:MONGO_ROOT_PASSWORD77.37.47.117:27017/shiv-agri?authSource=admin
```

**For Application User:**
```
mongodb://shivagri-app:shivagri246*@77.37.47.117:27017/shiv-agri?authSource=shiv-agri
```

#### 4.4.5 Security Best Practices for External Access

- [ ] **Use read-only users** for debugging when possible
- [ ] **Enable UFW rate limiting** to prevent brute force attacks
- [ ] **Use strong passwords** for all users
- [ ] **Whitelist specific IPs** instead of allowing 0.0.0.0 when possible
- [ ] **Monitor connection logs** regularly
- [ ] **Disable external access** when not actively debugging
- [ ] **Consider using SSH tunnel** for even better security (see below)

#### 4.4.6 Alternative: SSH Tunnel (Most Secure)

**Instead of opening port 27017 to the internet, use an SSH tunnel for secure access:**

```bash
# From your local machine, create SSH tunnel
ssh -L 27017:127.0.0.1:27017 root@77.37.47.117

# Keep this terminal open, then connect to localhost:27017
# MongoDB connection string (in another terminal):
mongosh "mongodb://debug-user:YOUR_SECURE_DEBUG_PASSWORD@localhost:27017/shiv-agri?authSource=shiv-agri"
```

**With this method:**
- Keep MongoDB `bindIp: 127.0.0.1` (localhost only)
- No firewall rules needed for MongoDB
- All traffic encrypted through SSH
- **This is the RECOMMENDED approach for security**

#### 4.4.7 Monitoring External Connections

```bash
# View current MongoDB connections
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "db.currentOp()" --quiet

# Check who's connected
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "db.serverStatus().connections" --quiet

# Monitor MongoDB logs for external connections
sudo tail -f /var/log/mongodb/mongod.log | grep "connection accepted"
```

#### 4.4.8 Disable External Access (When Not Needed)

**When you're done debugging, restore security:**

```bash
# Edit MongoDB configuration
sudo nano /etc/mongod.conf

# Change back to localhost only
# bindIp: 127.0.0.1

# Restart MongoDB
sudo systemctl restart mongod

# Remove firewall rule (if you added it)
sudo ufw delete allow 27017/tcp
sudo ufw reload
```

---

## Phase 5: Restore Data to Native MongoDB

### 5.1 Restore Database from Backup

```bash
# Navigate to backup directory
cd /root/mongodb-backup-$(date +%Y%m%d)

# Restore all databases
mongorestore \
  --username admin \
  --password 'MONGO_ROOT_PASSWORD' \
  --authenticationDatabase admin \
  ./mongodb-dump-*/

# Verify restoration
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin
```

**In mongosh, verify data:**

```javascript
// Show all databases
show dbs

// Switch to shiv-agri database
use shiv-agri

// List all collections
db.getCollectionNames()

// Count documents in each collection (example)
db.users.countDocuments()
db.farms.countDocuments()
db.soil_samples.countDocuments()

// Exit
exit
```

### 5.2 Create Application User

```bash
# Connect as admin
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin
```

**In mongosh:**

```javascript
// Switch to shiv-agri database
use shiv-agri

// Create application user with readWrite permissions
db.createUser({
  user: "shivagri-app",
  pwd: "shivagri246*@",
  roles: [
    { role: "readWrite", db: "shiv-agri" }
  ]
})

// Verify user creation
db.getUsers()

// Test user authentication
exit
```

**Test application user:**

```bash
# Test connection with app user
mongosh -u shivagri-app -p 'shivagri246*@' --authenticationDatabase shiv-agri shiv-agri

# In mongosh, test read/write
db.users.findOne()
exit
```

### 5.3 Verify Data Integrity

```bash
# Create verification script
cat > /root/verify-migration.js << 'EOF'
// Connect to database
db = connect('mongodb://shivagri-app:shivagri246*@127.0.0.1:27017/shiv-agri?authSource=shiv-agri');

print("=== Database Verification ===");
print("Database: " + db.getName());
print("");

print("Collections:");
db.getCollectionNames().forEach(function(collection) {
    var count = db[collection].countDocuments();
    print("  - " + collection + ": " + count + " documents");
});

print("");
print("Sample Data Check:");
print("  - First user: " + JSON.stringify(db.users.findOne()));
print("  - Total farms: " + db.farms.countDocuments());
EOF

# Run verification
mongosh -u shivagri-app -p 'shivagri246*@' --authenticationDatabase shiv-agri shiv-agri /root/verify-migration.js
```

---

## Phase 6: Update Application Configuration

### 6.1 Update Environment Variables

```bash
# Navigate to application directory
cd /var/www/shiv-agri

# Backup current .env file
cp .env .env.backup-docker-$(date +%Y%m%d)

# Edit .env file
nano .env
```

**Update the MongoDB connection string in `.env`:**

```bash
# OLD (Docker):
# MONGODB_URI=mongodb://shivagri-app:shivagri246*%40@mongodb:27017/shiv-agri

# NEW (Native - localhost):
MONGODB_URI=mongodb://shivagri-app:shivagri246*%40@127.0.0.1:27017/shiv-agri?authSource=shiv-agri

# Keep other variables the same
```

### 6.2 Update Docker Compose Configuration

```bash
# Edit docker-compose.prod.yml
nano docker-compose.prod.yml
```

**Update `docker-compose.prod.yml` to remove MongoDB container and update API configuration:**

```yaml
version: '3.8'

services:
  # Remove or comment out the mongodb service
  # mongodb:
  #   ...

  api:
    image: ${DOCKERHUB_USERNAME}/shiv-agri-api:latest
    container_name: shivagri-api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      # Use localhost MongoDB instead of container
      MONGODB_URI: ${MONGODB_URI}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - api_uploads:/app/uploads
    # Remove MongoDB dependency
    # depends_on:
    #   mongodb:
    #     condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - app-network

  # ... rest of services remain the same

volumes:
  # Remove MongoDB volumes
  # mongodb_data:
  # mongodb_config:
  api_uploads:
  certbot_www:
  certbot_conf:

networks:
  app-network:
    driver: bridge
```

**Note:** The API container needs to connect to MongoDB on the host machine using `host.docker.internal`.

---

## Phase 7: Testing and Validation

### 7.1 Test Application Locally

```bash
# Stop current containers
cd /var/www/shiv-agri
docker compose -f docker-compose.prod.yml down

# Start only API (without MongoDB)
docker compose -f docker-compose.prod.yml up -d api

# Check API logs
docker logs -f shivagri-api

# Look for successful MongoDB connection
# Expected: "MongoDB connected successfully" or similar
```

### 7.2 Test Database Connectivity

```bash
# Test from host
curl http://localhost:3000/api/health

# Test from outside (if health endpoint exists)
curl http://77.37.47.117:3000/api/health
```

### 7.3 Test CRUD Operations

```bash
# If you have API endpoints, test them:
# Example: List users (adjust based on your API)
curl http://localhost:3000/api/users

# Check logs for any database errors
docker logs shivagri-api | grep -i mongo
docker logs shivagri-api | grep -i error
```

### 7.4 Monitor MongoDB Performance

```bash
# Monitor MongoDB in real-time
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin

# In mongosh:
use shiv-agri
db.currentOp()  // Show current operations
db.serverStatus()  // Show server statistics
exit

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Monitor system resources
htop  # or top
```

---

## Phase 8: Full Deployment and Cutover

### 8.1 Schedule Maintenance Window

**Recommended Steps:**

1. Notify users about maintenance (if applicable)
2. Set maintenance window during low-traffic hours
3. Put application in maintenance mode (optional)

### 8.2 Final Deployment

```bash
# Ensure MongoDB is running
sudo systemctl status mongod

# Stop all Docker containers
cd /var/www/shiv-agri
docker compose -f docker-compose.prod.yml down

# Start services with new configuration
docker compose -f docker-compose.prod.yml up -d

# Verify all containers are running
docker ps --filter name=shivagri

# Check all logs
docker logs shivagri-api
docker logs shivagri-frontend
docker logs shivagri-nginx
```

### 8.3 Post-Deployment Validation

```bash
# Test website
curl -I https://shivagri.com

# Test API endpoint
curl https://shivagri.com/api/health

# Monitor logs for 15-30 minutes
docker logs -f shivagri-api

# Check MongoDB connections
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "db.serverStatus().connections"
```

---

## Phase 9: Cleanup (After 1-2 Weeks of Successful Operation)

### 9.1 Remove Docker MongoDB Resources

```bash
# Stop MongoDB container if still running
docker stop shivagri-mongodb 2>/dev/null || true

# Remove MongoDB container
docker rm shivagri-mongodb 2>/dev/null || true

# List Docker volumes
docker volume ls | grep mongodb

# Remove MongoDB Docker volumes (ONLY after confirming native MongoDB works)
docker volume rm shiv-agri_mongodb_data 2>/dev/null || true
docker volume rm shiv-agri_mongodb_config 2>/dev/null || true
```

### 9.2 Archive Backups

```bash
# Move backups to archive location
mkdir -p /backup/mongodb-migration-archive
mv /root/mongodb-backup-* /backup/mongodb-migration-archive/

# Keep backups for at least 3-6 months
```

---

## Phase 10: Automated Backup Setup

### 10.1 Create Backup Script

```bash
# Create backup directory
sudo mkdir -p /backup/mongodb
sudo mkdir -p /usr/local/bin

# Create backup script
sudo nano /usr/local/bin/mongodb-backup.sh
```

**Add the following content:**

```bash
#!/bin/bash

# MongoDB Backup Script for Shiv-Agri
# Usage: ./mongodb-backup.sh

BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# MongoDB credentials
MONGO_USER="admin"
MONGO_PASSWORD="MONGO_ROOT_PASSWORD"
MONGO_DB="shiv-agri"

# Create backup
echo "Starting MongoDB backup at $DATE"

mongodump \
  --username "$MONGO_USER" \
  --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin \
  --db "$MONGO_DB" \
  --out "$BACKUP_DIR/$DATE"

# Compress backup
echo "Compressing backup..."
cd "$BACKUP_DIR"
tar -czf "$MONGO_DB-$DATE.tar.gz" "$DATE"
rm -rf "$DATE"

# Remove old backups
echo "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_DIR/$MONGO_DB-$DATE.tar.gz"

# List current backups
echo "Current backups:"
ls -lh "$BACKUP_DIR"/*.tar.gz
```

```bash
# Make script executable
sudo chmod +x /usr/local/bin/mongodb-backup.sh

# Test backup script
sudo /usr/local/bin/mongodb-backup.sh
```

### 10.2 Schedule Automated Backups

```bash
# Edit crontab
sudo crontab -e

# Add daily backup at 2 AM
0 2 * * * /usr/local/bin/mongodb-backup.sh >> /var/log/mongodb-backup.log 2>&1

# Add weekly backup on Sunday at 3 AM (keep longer)
0 3 * * 0 /usr/local/bin/mongodb-backup.sh && cp /backup/mongodb/shiv-agri-*.tar.gz /backup/mongodb/weekly/

# Save and exit
```

### 10.3 Verify Backup System

```bash
# Check cron jobs
sudo crontab -l

# Run manual backup test
sudo /usr/local/bin/mongodb-backup.sh

# Verify backup file
ls -lh /backup/mongodb/

# Test restore from backup (on test database)
cd /backup/mongodb
tar -xzf shiv-agri-*.tar.gz
mongorestore --username admin --password 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --nsInclude="shiv-agri.*" --nsFrom="shiv-agri.*" --nsTo="shiv-agri-test.*" ./
```

---

## Phase 11: Monitoring and Maintenance

### 11.1 Set Up MongoDB Monitoring

```bash
# Create monitoring script
sudo nano /usr/local/bin/mongodb-monitor.sh
```

**Add the following:**

```bash
#!/bin/bash

echo "=== MongoDB Status ==="
sudo systemctl status mongod --no-pager

echo ""
echo "=== MongoDB Connections ==="
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --quiet --eval "db.serverStatus().connections"

echo ""
echo "=== Database Size ==="
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --quiet --eval "db.adminCommand({ listDatabases: 1 })"

echo ""
echo "=== Disk Usage ==="
df -h | grep -E "Filesystem|/var/lib/mongodb|/$"

echo ""
echo "=== Recent Errors (Last 20 lines) ==="
sudo tail -20 /var/log/mongodb/mongod.log | grep -i error || echo "No recent errors"
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/mongodb-monitor.sh

# Run monitoring
sudo /usr/local/bin/mongodb-monitor.sh
```

### 11.2 Configure Log Rotation

```bash
# MongoDB should already have logrotate configured, verify:
cat /etc/logrotate.d/mongodb

# If not exists, create it:
sudo nano /etc/logrotate.d/mongodb
```

**Add:**

```
/var/log/mongodb/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    create 0600 mongodb mongodb
    sharedscripts
    postrotate
        /bin/kill -SIGUSR1 `cat /var/run/mongodb/mongod.pid 2>/dev/null` 2>/dev/null || true
    endscript
}
```

---

## Rollback Plan

If you encounter issues during migration, follow these steps to rollback:

### Rollback Steps

```bash
# 1. Stop native MongoDB
sudo systemctl stop mongod
sudo systemctl disable mongod

# 2. Restore docker-compose.prod.yml from backup
cd /var/www/shiv-agri
cp docker-compose.prod.yml.backup docker-compose.prod.yml

# 3. Restore .env from backup
cp .env.backup-docker-* .env

# 4. Restore Docker MongoDB volumes if deleted
# (Only if you haven't deleted them yet)

# 5. Start Docker containers
docker compose -f docker-compose.prod.yml up -d

# 6. Verify application works
docker logs -f shivagri-api
curl https://shivagri.com/api/health

# 7. Document issues encountered for future retry
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: MongoDB Service Won't Start

```bash
# Check MongoDB logs
sudo tail -100 /var/log/mongodb/mongod.log

# Check for port conflicts
sudo netstat -tulpn | grep 27017

# Check MongoDB configuration
sudo mongod --config /etc/mongod.conf --fork

# Verify permissions
sudo chown -R mongodb:mongodb /var/lib/mongodb
sudo chown -R mongodb:mongodb /var/log/mongodb
```

#### Issue 2: Authentication Failures

```bash
# Verify users exist
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin --eval "db.getUsers()" admin

# Recreate application user if needed
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin
use shiv-agri
db.dropUser("shivagri-app")
db.createUser({
  user: "shivagri-app",
  pwd: "shivagri246*@",
  roles: [{ role: "readWrite", db: "shiv-agri" }]
})
```

#### Issue 3: API Can't Connect to MongoDB

```bash
# Check if MongoDB is listening on correct port
sudo netstat -tulpn | grep 27017

# Test connection from Docker container
docker exec shivagri-api ping host.docker.internal

# Check firewall rules
sudo ufw status

# Verify connection string in API
docker exec shivagri-api printenv | grep MONGODB
```

#### Issue 4: Performance Issues

```bash
# Check indexes
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin shiv-agri --eval "db.getCollectionNames().forEach(function(col) { print(col); printjson(db[col].getIndexes()); })"

# Enable profiling for slow queries
mongosh -u admin -p 'MONGO_ROOT_PASSWORD' --authenticationDatabase admin shiv-agri
db.setProfilingLevel(1, { slowms: 100 })

# Check slow queries
db.system.profile.find().sort({ ts: -1 }).limit(10).pretty()
```

---

## Security Checklist

- [ ] MongoDB authentication enabled
- [ ] Strong passwords used for all users
- [ ] MongoDB bound to localhost only (127.0.0.1)
- [ ] Firewall configured (if external access needed)
- [ ] Regular backups configured and tested
- [ ] Log rotation configured
- [ ] File permissions set correctly on MongoDB directories
- [ ] Unnecessary users removed
- [ ] Admin password changed from default

---

## Performance Optimization Tips

### Index Optimization

```bash
# Review current indexes
mongosh -u shivagri-app -p 'shivagri246*@' --authenticationDatabase shiv-agri shiv-agri

# Analyze slow queries
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 })

# Create indexes based on query patterns
# Example:
db.users.createIndex({ email: 1 })
db.farms.createIndex({ userId: 1 })
db.soil_samples.createIndex({ farmId: 1, createdAt: -1 })
```

### Memory Configuration

Edit `/etc/mongod.conf`:

```yaml
# WiredTiger cache size (50-80% of available RAM for MongoDB)
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 1  # Adjust based on available RAM
```

---

## Success Criteria

- [ ] Native MongoDB 7.0 installed and running
- [ ] All data migrated successfully (verified counts match)
- [ ] Application connects to native MongoDB without errors
- [ ] All CRUD operations work correctly
- [ ] Performance metrics meet or exceed Docker setup
- [ ] Automated backups configured and tested
- [ ] Monitoring in place
- [ ] Docker MongoDB container and volumes removed (after stability period)
- [ ] Documentation updated
- [ ] Team notified of new MongoDB configuration

---

## Estimated Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1-2 | 2-3 hours | Preparation and backup |
| Phase 3-4 | 2-3 hours | Installation and configuration |
| Phase 5 | 1-2 hours | Data restoration |
| Phase 6-7 | 2-3 hours | Application update and testing |
| Phase 8 | 1 hour | Production deployment |
| Phase 9 | 15 mins | Cleanup (after 1-2 weeks) |
| Phase 10-11 | 1-2 hours | Automation and monitoring |
| **Total** | **9-14 hours** | Spread over 1-2 days + monitoring |

---

## Notes

- Always perform migration during low-traffic periods
- Keep Docker MongoDB running in parallel for 1-2 weeks before cleanup
- Document any unexpected issues or deviations
- Test backup restoration before removing Docker volumes
- Monitor application closely for first 48 hours after migration

---

## Support and References

- MongoDB 7.0 Documentation: https://www.mongodb.com/docs/v7.0/
- MongoDB Production Notes: https://www.mongodb.com/docs/manual/administration/production-notes/
- MongoDB Security Checklist: https://www.mongodb.com/docs/manual/administration/security-checklist/

---

**Migration Date:** _______________
**Performed By:** _______________
**Completion Status:** _______________
