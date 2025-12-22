# MongoDB Migration - Quick Reference Guide

This is a condensed quick reference for the MongoDB migration. For detailed instructions, see [MONGODB_MIGRATION_GUIDE.md](./MONGODB_MIGRATION_GUIDE.md).

## Pre-Migration

```bash
# SSH to VPS
ssh root@77.37.47.117

# Run pre-migration check
cd /var/www/shiv-agri/scripts
chmod +x *.sh
./pre-migration-check.sh
```

## Phase 1: Backup

```bash
# Create backup directory
mkdir -p /root/mongodb-backup-$(date +%Y%m%d)

# Backup MongoDB
docker exec shivagri-mongodb mongodump \
  -u admin -p 'shivagriadmin135*@' \
  --authenticationDatabase admin \
  --out /dump

# Copy to host
docker cp shivagri-mongodb:/dump /root/mongodb-backup-$(date +%Y%m%d)/

# Compress backup
cd /root/mongodb-backup-$(date +%Y%m%d)
tar -czf mongodb-backup-complete.tar.gz dump/
```

## Phase 2: Install MongoDB

```bash
# Import GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add repository (Ubuntu 22.04)
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
sudo systemctl status mongod
```

## Phase 3: Configure MongoDB

```bash
# Edit configuration
sudo nano /etc/mongod.conf
```

**Set:**
- `bindIp: 127.0.0.1`
- `authorization: enabled`

```bash
# Restart
sudo systemctl restart mongod

# Create admin user
mongosh
```

```javascript
use admin
db.createUser({
  user: "admin",
  pwd: "shivagriadmin135*@",
  roles: ["userAdminAnyDatabase", "dbAdminAnyDatabase", "readWriteAnyDatabase"]
})
exit
```

## Phase 4: Restore Data

```bash
# Restore database
cd /root/mongodb-backup-$(date +%Y%m%d)
mongorestore \
  -u admin -p 'shivagriadmin135*@' \
  --authenticationDatabase admin \
  ./dump/

# Create app user
mongosh -u admin -p 'shivagriadmin135*@' --authenticationDatabase admin
```

```javascript
use shiv-agri
db.createUser({
  user: "shivagri-app",
  pwd: "shivagri246*@",
  roles: [{ role: "readWrite", db: "shiv-agri" }]
})
exit
```

## Phase 4.5: Enable External Access (Optional)

**For debugging with MongoDB Compass, Atlas, etc.**

### Option 1: Direct Access (Less Secure)

```bash
# Edit config
sudo nano /etc/mongod.conf
# Set: bindIp: 0.0.0.0

# Restart MongoDB
sudo systemctl restart mongod

# Configure firewall
sudo ufw allow 27017/tcp
sudo ufw limit 27017/tcp
sudo ufw reload

# Create read-only debug user
mongosh -u admin -p 'shivagriadmin135*@' --authenticationDatabase admin
```

```javascript
use shiv-agri
db.createUser({
  user: "debug-user",
  pwd: "YOUR_SECURE_DEBUG_PASSWORD",
  roles: [{ role: "read", db: "shiv-agri" }]
})
exit
```

**Connection string:**
```
mongodb://debug-user:YOUR_PASSWORD@77.37.47.117:27017/shiv-agri?authSource=shiv-agri
```

### Option 2: SSH Tunnel (Most Secure - RECOMMENDED)

```bash
# From your local machine
ssh -L 27017:127.0.0.1:27017 root@77.37.47.117

# Connect to localhost:27017
mongodb://debug-user:YOUR_PASSWORD@localhost:27017/shiv-agri?authSource=shiv-agri
```

**Benefits:**
- No firewall changes needed
- MongoDB stays on localhost
- All traffic encrypted via SSH

### Disable External Access

```bash
# Edit config back to localhost
sudo nano /etc/mongod.conf
# Set: bindIp: 127.0.0.1

sudo systemctl restart mongod
sudo ufw delete allow 27017/tcp
sudo ufw reload
```

## Phase 5: Update Application

```bash
cd /var/www/shiv-agri

# Backup current config
cp .env .env.backup-docker

# Update .env
nano .env
```

**Change:**
```bash
MONGODB_URI=mongodb://shivagri-app:shivagri246*%40@127.0.0.1:27017/shiv-agri?authSource=shiv-agri
```

**Update docker-compose.prod.yml:**

```yaml
api:
  environment:
    MONGODB_URI: mongodb://${MONGO_USER}:${MONGO_PASSWORD_ENCODED}@host.docker.internal:27017/${MONGO_DB}?authSource=${MONGO_DB}
  extra_hosts:
    - "host.docker.internal:host-gateway"
  # Remove depends_on: mongodb

# Comment out or remove mongodb service
# Remove mongodb volumes
```

## Phase 6: Deploy

```bash
# Stop containers
docker compose -f docker-compose.prod.yml down

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check logs
docker logs -f shivagri-api

# Verify
curl https://shivagri.com/api/health
```

## Phase 7: Verify

```bash
# Run verification script
./scripts/verify-migration.sh native

# Monitor
./scripts/mongodb-monitor.sh
```

## Automated Backup Setup

```bash
# Copy backup script
sudo cp /var/www/shiv-agri/scripts/mongodb-backup.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/mongodb-backup.sh

# Add to crontab
sudo crontab -e
```

**Add:**
```
0 2 * * * /usr/local/bin/mongodb-backup.sh >> /var/log/mongodb-backup.log 2>&1
```

## Monitoring Commands

```bash
# Service status
sudo systemctl status mongod

# Logs
sudo tail -f /var/log/mongodb/mongod.log

# Monitor script
./scripts/mongodb-monitor.sh

# Connection test
mongosh -u shivagri-app -p 'shivagri246*@' --authenticationDatabase shiv-agri shiv-agri --eval "db.stats()"
```

## Rollback (If Needed)

```bash
# Stop native MongoDB
sudo systemctl stop mongod
sudo systemctl disable mongod

# Restore configs
cd /var/www/shiv-agri
cp .env.backup-docker .env
cp docker-compose.prod.yml.backup docker-compose.prod.yml

# Start Docker MongoDB
docker compose -f docker-compose.prod.yml up -d
```

## Cleanup (After 1-2 Weeks)

```bash
# Remove Docker MongoDB
docker stop shivagri-mongodb
docker rm shivagri-mongodb
docker volume rm shiv-agri_mongodb_data shiv-agri_mongodb_config

# Archive backups
mkdir -p /backup/mongodb-migration-archive
mv /root/mongodb-backup-* /backup/mongodb-migration-archive/
```

## Helper Scripts

All scripts are in `/var/www/shiv-agri/scripts/`:

- `pre-migration-check.sh` - Check system readiness
- `mongodb-backup.sh` - Create backup
- `mongodb-restore.sh` - Restore from backup
- `mongodb-monitor.sh` - Monitor MongoDB health
- `verify-migration.sh` - Verify data migration

## Troubleshooting

### MongoDB won't start
```bash
sudo tail -100 /var/log/mongodb/mongod.log
sudo chown -R mongodb:mongodb /var/lib/mongodb
sudo systemctl restart mongod
```

### Connection refused
```bash
sudo netstat -tulpn | grep 27017
sudo nano /etc/mongod.conf  # Check bindIp
```

### Authentication failed
```bash
mongosh -u admin -p 'shivagriadmin135*@' --authenticationDatabase admin
# Recreate users if needed
```

### API can't connect
```bash
docker exec shivagri-api ping host.docker.internal
docker exec shivagri-api printenv | grep MONGODB
docker logs shivagri-api | grep -i mongo
```

## Important Notes

- ✓ Always backup before making changes
- ✓ Test in low-traffic period
- ✓ Keep Docker MongoDB running for 1-2 weeks
- ✓ Monitor closely for 48 hours after migration
- ✓ Verify all CRUD operations work
- ✓ Document any deviations or issues

## Timeline

- Backup: 1-2 hours
- Installation: 1-2 hours
- Migration: 1-2 hours
- Testing: 1-2 hours
- **Total: 4-8 hours**

## Support

- Detailed guide: `/docs/MONGODB_MIGRATION_GUIDE.md`
- MongoDB docs: https://www.mongodb.com/docs/v7.0/
- Linear issue: SHI-19
