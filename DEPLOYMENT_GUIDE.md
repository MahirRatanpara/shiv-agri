# 🚀 Shiv-Agri Complete Deployment Guide

**Production Infrastructure with Docker & CI/CD on Hostinger VPS**

Complete guide for deploying Shiv-Agri application with automated CI/CD using Docker Hub and GitHub Actions.

---

## 📋 Table of Contents

1. [Quick Start](#-quick-start)
2. [Overview](#-overview)
3. [Prerequisites](#-prerequisites)
4. [Docker Hub Setup](#-docker-hub-setup)
5. [GitHub Configuration](#-github-configuration)
6. [VPS Server Setup](#-vps-server-setup)
7. [Domain & DNS Configuration](#-domain--dns-configuration)
8. [Deployment](#-deployment)
9. [SSL Certificate Setup](#-ssl-certificate-setup)
10. [Monitoring & Maintenance](#-monitoring--maintenance)
11. [Troubleshooting](#-troubleshooting)
12. [Technical Architecture](#-technical-architecture)
13. [Common Operations](#-common-operations)
14. [Security Best Practices](#-security-best-practices)
15. [Appendix](#-appendix)

---

## ⚡ Quick Start

### For the Impatient

**Time Required: 30-40 minutes** (excluding DNS propagation)

```bash
# 1. Create Docker Hub access token (5 mins)
# → hub.docker.com → Settings → Security → New Token

# 2. Add GitHub Secrets (2 mins)
# → Repo Settings → Secrets → Add:
#    - DOCKERHUB_USERNAME
#    - DOCKERHUB_TOKEN
#    - SERVER_HOST
#    - SERVER_USER
#    - SERVER_SSH_KEY

# 3. Setup VPS (10 mins)
ssh root@YOUR_VPS_IP
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/shiv-agri/main/scripts/vps-setup.sh | bash

# 4. Configure DNS (wait 15-60 mins for propagation)
# Point your domain A record to VPS IP

# 5. Deploy! (automatic)
git push origin main

# 6. Setup SSL (5 mins)
# On VPS:
cd /var/www/shiv-agri
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d yourdomain.com -d www.yourdomain.com \
  --email your@email.com --agree-tos
```

**Done!** Your application is live at `https://yourdomain.com`

For detailed instructions, continue reading below.

---

## 🎯 Overview

### What This Guide Covers

This deployment guide implements a **production-ready infrastructure** with:

- **Containerized Services**: Docker containers for frontend, backend, database, and reverse proxy
- **Automated CI/CD**: GitHub Actions for build, push, and deploy
- **Zero-Downtime Deploys**: Health checks and rolling updates
- **SSL/TLS Encryption**: Automated certificate management with Let's Encrypt
- **Automated Backups**: Daily MongoDB backups with retention policy
- **Scalable Architecture**: Easy to scale and maintain

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet (HTTPS/HTTP)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Port 443 (HTTPS) / 80 (HTTP)
                     │
            ┌────────▼────────┐
            │  Nginx Proxy    │  ← SSL/TLS Termination
            │  (Reverse Proxy)│  ← Rate Limiting
            └────────┬────────┘  ← Gzip Compression
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌───▼────┐ ┌────▼─────┐
    │Frontend │ │  API   │ │ MongoDB  │
    │(Angular)│ │(Node.js)│ │ (Mongo7) │
    │  :80    │ │ :3000  │ │ :27017   │
    └─────────┘ └────────┘ └──────────┘
         │           │           │
         └───────────┴───────────┘
              Docker Network

    ┌─────────────┐
    │   Certbot   │  ← SSL Auto-renewal
    │ (Let's Encrypt)│
    └─────────────┘
```

### Services

1. **Frontend**: Angular SPA served via Nginx
2. **API**: Node.js/Express REST API
3. **MongoDB**: Database (v7.0)
4. **Nginx**: Reverse proxy with SSL termination
5. **Certbot**: Automatic SSL certificate management

### CI/CD Flow

```
Developer → git push → GitHub Actions → Docker Hub → VPS → Production
```

---

## 📋 Prerequisites

### Required Accounts & Access

- [ ] **Docker Hub Account** (Free or Pro)
- [ ] **GitHub Account** with repository access
- [ ] **Hostinger VPS** (KVM 4 or higher recommended)
- [ ] **Domain Name** configured with DNS access
- [ ] **SSH Access** to VPS (root or sudo user)

### Local Requirements (for testing)

- Docker and Docker Compose
- Git
- SSH client
- Text editor

### VPS Requirements

- **Minimum**: 2 CPU cores, 2GB RAM, 20GB storage
- **Recommended**: 4 CPU cores, 4GB RAM, 40GB storage
- **OS**: Ubuntu 20.04+ or Debian 11+
- **Ports**: 22, 80, 443 accessible

---

## 🐳 Docker Hub Setup

### Why Docker Hub?

This project uses **Docker Hub** for storing private Docker images. Benefits:

- Industry-standard Docker registry
- Reliable and widely supported
- Good integration with CI/CD tools
- Team collaboration features

### Pricing Consideration

⚠️ **Important**: This project needs **3 private repositories**

| Plan | Private Repos | Cost | Recommendation |
|------|---------------|------|----------------|
| **Free** | 1 | $0/month | ❌ Not enough |
| **Pro** | Unlimited | $5/month | ✅ **RECOMMENDED** |

**Alternative**: Use public repositories (⚠️ not secure for production)

### Step 1: Create Docker Hub Account

1. Go to [https://hub.docker.com](https://hub.docker.com)
2. Sign up for a new account (or login)
3. **(Recommended)** Upgrade to Pro plan for unlimited private repos

### Step 2: Generate Access Token

1. Login to Docker Hub
2. Click on your username (top right) → **Account Settings**
3. Go to **Security** tab
4. Click **New Access Token**
5. Configure token:
   - **Description**: `shiv-agri-ci-cd`
   - **Permissions**: Read, Write, Delete
6. Click **Generate**
7. **COPY THE TOKEN** (you won't see it again!)
   - Format: `dckr_pat_xxxxxxxxxxxxxxxxxxxxx`

### Step 3: Verify Docker Hub

```bash
# Test login (local machine)
docker login -u YOUR_DOCKERHUB_USERNAME
# Paste your access token when prompted

# Verify
docker info | grep Username
# Should show: Username: YOUR_DOCKERHUB_USERNAME
```

### Docker Hub Image Names

Your private images will be:
```
YOUR_USERNAME/shiv-agri-api:latest
YOUR_USERNAME/shiv-agri-frontend:latest
YOUR_USERNAME/shiv-agri-nginx:latest
```

---

## 🔧 GitHub Configuration

### Step 1: Generate SSH Key for GitHub Actions

On your **local machine**:

```bash
# Generate new SSH key pair
ssh-keygen -t ed25519 -C "github-actions-shiv-agri" -f ~/.ssh/shiv-agri-deploy

# Display private key (copy this for GitHub secret)
cat ~/.ssh/shiv-agri-deploy

# Display public key (add this to VPS later)
cat ~/.ssh/shiv-agri-deploy.pub
```

### Step 2: Configure Repository Secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions**

Click **New repository secret** and add each of these:

| Secret Name | Description | Value | Example |
|-------------|-------------|-------|---------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username | Your username | `johndoe` |
| `DOCKERHUB_TOKEN` | Docker Hub access token | Token from Docker Hub | `dckr_pat_xxxx` |
| `SERVER_HOST` | VPS IP address | IPv4 address | `123.45.67.89` |
| `SERVER_USER` | SSH username on VPS | Usually `root` | `root` or `ubuntu` |
| `SERVER_SSH_KEY` | Private SSH key | Entire private key | Paste key from above |

### How to Add Secrets

```bash
# For SERVER_SSH_KEY, paste the ENTIRE output including:
-----BEGIN OPENSSH PRIVATE KEY-----
...entire key content...
-----END OPENSSH PRIVATE KEY-----
```

### Step 3: Verify GitHub Actions

After adding secrets:

1. Go to **Actions** tab in your repository
2. You should see three workflows:
   - Deploy API
   - Deploy Frontend
   - Deploy Nginx
3. These will trigger automatically on push to `main`

---

## 🖥️ VPS Server Setup

### Option 1: Automated Setup (Recommended)

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Run automated setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/shiv-agri/main/scripts/vps-setup.sh | bash

# Follow the prompts:
# - Enter Docker Hub username
# - Enter Docker Hub token
# - Script will setup everything automatically
```

The script will:
- ✅ Update system packages
- ✅ Install Docker and Docker Compose
- ✅ Configure firewall (UFW)
- ✅ Create directory structure
- ✅ Login to Docker Hub
- ✅ Create environment file
- ✅ Setup backup script
- ✅ Configure cron jobs

### Option 2: Manual Setup

If you prefer manual setup:

#### 1. Connect to VPS

```bash
ssh root@YOUR_VPS_IP
```

#### 2. Update System

```bash
apt update && apt upgrade -y
apt install -y curl wget git ufw
```

#### 3. Install Docker

```bash
# Download Docker installation script
curl -fsSL https://get.docker.com -o get-docker.sh

# Install Docker
sh get-docker.sh

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Verify installation
docker --version
docker compose version
```

#### 4. Configure Firewall

```bash
# Enable UFW
ufw enable

# Allow SSH (CRITICAL - do this first!)
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Reload and check status
ufw reload
ufw status
```

#### 5. Create Directory Structure

```bash
# Create application directory
mkdir -p /var/www/shiv-agri

# Create backup directory
mkdir -p /backups/shivagri

# Navigate to project directory
cd /var/www/shiv-agri
```

#### 6. Add GitHub Actions SSH Key

```bash
# Create .ssh directory if needed
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add public key to authorized_keys
echo "YOUR_PUBLIC_KEY_FROM_EARLIER" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Test connection from local machine
# ssh -i ~/.ssh/shiv-agri-deploy root@YOUR_VPS_IP
```

#### 7. Login to Docker Hub

```bash
# Login to Docker Hub
docker login -u YOUR_DOCKERHUB_USERNAME
# Enter your access token when prompted

# Verify login
docker info | grep Username
```

#### 8. Create Environment File

```bash
# Create .env file
nano /var/www/shiv-agri/.env
```

Paste this content and **replace all values**:

```env
# Docker Hub Configuration
DOCKERHUB_USERNAME=your-dockerhub-username

# MongoDB Configuration
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=CHANGE_TO_STRONG_PASSWORD_HERE
MONGO_DB=shiv-agri
MONGO_USER=shivagri-app
MONGO_PASSWORD=CHANGE_TO_STRONG_PASSWORD_HERE

# API Configuration
NODE_ENV=production
PORT=3000
JWT_SECRET=CHANGE_TO_RANDOM_STRING_MIN_32_CHARS_LONG

# Domain Configuration
DOMAIN=yourdomain.com
API_DOMAIN=api.yourdomain.com
```

Save and set permissions:

```bash
chmod 600 /var/www/shiv-agri/.env
```

#### 9. Create Production Docker Compose File

```bash
nano /var/www/shiv-agri/docker-compose.prod.yml
```

Copy the content from `docker-compose.prod.yml` in the repository.

#### 10. Setup Backup Script

```bash
# Copy backup script
nano /root/backup-shivagri.sh
```

Copy content from `scripts/backup-mongodb.sh` in repository.

```bash
# Make executable
chmod +x /root/backup-shivagri.sh

# Test backup
/root/backup-shivagri.sh

# Setup cron job for daily backups at 2 AM
crontab -e
# Add this line:
0 2 * * * /root/backup-shivagri.sh >> /var/log/shivagri-backup.log 2>&1
```

---

## 🌐 Domain & DNS Configuration

### Configure DNS Records

In your domain DNS management panel (Hostinger, Cloudflare, etc.):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_VPS_IP | 14400 |
| A | www | YOUR_VPS_IP | 14400 |
| CNAME | api | yourdomain.com | 14400 (optional) |

### Verify DNS Propagation

**Wait 15-60 minutes** for DNS to propagate globally.

```bash
# Check DNS resolution
dig yourdomain.com +short
dig www.yourdomain.com +short

# Both should return your VPS IP address

# Online checker
# Visit: https://www.whatsmydns.net
```

---

## 🚀 Deployment

### First Deployment

#### 1. Initial HTTP Deployment

Start with HTTP only (we'll add SSL after):

```bash
# SSH to VPS
ssh root@YOUR_VPS_IP

# Navigate to project directory
cd /var/www/shiv-agri

# Pull images from Docker Hub
docker compose -f docker-compose.prod.yml pull

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

All containers should show "Up" status.

#### 2. View Logs

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f frontend
```

#### 3. Test HTTP Access

```bash
# Test from VPS
curl http://localhost

# Test from browser
http://yourdomain.com
```

### Automated Deployment (CI/CD)

After initial setup, deployments are automatic:

```bash
# Make changes to your code
git add .
git commit -m "Your changes"
git push origin main

# GitHub Actions will automatically:
# 1. Build Docker images
# 2. Push to Docker Hub
# 3. SSH into VPS
# 4. Pull latest images
# 5. Restart containers
```

**Monitor deployment:**
- Go to GitHub → Actions tab
- Watch workflow progress
- Check for any errors

### Manual Deployment

If needed, deploy manually:

```bash
# SSH to VPS
cd /var/www/shiv-agri

# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Restart all services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

---

## 🔒 SSL Certificate Setup

### Step 1: Verify HTTP is Working

Before setting up SSL, ensure:
- ✅ DNS is propagated (domain points to VPS)
- ✅ Application is running on HTTP
- ✅ Can access via `http://yourdomain.com`

### Step 2: Obtain SSL Certificate

```bash
# SSH to VPS
cd /var/www/shiv-agri

# Obtain certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# You should see: "Successfully received certificate"
```

### Step 3: Enable HTTPS in Nginx

The nginx configuration file already has HTTPS setup (commented out).

**On your local machine**, edit `nginx/nginx.conf`:

1. **Uncomment the HTTPS server block** (around line 80)
2. **Replace `shivagri.com`** with your actual domain
3. **Uncomment the HTTP to HTTPS redirect** (around line 140)

Then push to trigger deployment:

```bash
git add nginx/nginx.conf
git commit -m "Enable HTTPS"
git push origin main
```

**Or manually on VPS** (if you don't want to commit):

```bash
# Edit nginx config
nano /var/www/shiv-agri/nginx/nginx.conf

# Uncomment HTTPS blocks and update domain
# Save and exit

# Restart nginx
docker compose -f docker-compose.prod.yml restart nginx
```

### Step 4: Verify HTTPS

```bash
# Test HTTPS
curl -I https://yourdomain.com

# Should return: HTTP/2 200

# Check certificate
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Step 5: Auto-Renewal

Certbot container automatically renews certificates. Verify:

```bash
# Check certbot container
docker compose -f docker-compose.prod.yml ps certbot

# Should be "Up"

# Test renewal (dry run)
docker compose -f docker-compose.prod.yml exec certbot certbot renew --dry-run
```

---

## 📊 Monitoring & Maintenance

### Container Status

```bash
# View running containers
docker compose -f docker-compose.prod.yml ps

# All containers
docker ps -a

# Resource usage
docker stats
```

### Viewing Logs

```bash
# All services (follow mode)
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f mongodb
docker compose -f docker-compose.prod.yml logs -f nginx

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 api

# Since specific time
docker compose -f docker-compose.prod.yml logs --since 1h api
```

### Resource Monitoring

```bash
# Real-time stats
docker stats

# Disk usage
df -h
docker system df

# Container details
docker compose -f docker-compose.prod.yml top
```

### Database Backups

#### Automated Backups

Already configured in setup! Daily backups run at 2 AM.

```bash
# Check cron job
crontab -l

# View backup logs
tail -f /var/log/shivagri-backup.log

# List backups
ls -lh /backups/shivagri/
```

#### Manual Backup

```bash
# Run backup script
/root/backup-shivagri.sh

# Or manual backup
cd /var/www/shiv-agri
docker compose -f docker-compose.prod.yml exec -T mongodb mongodump \
  --uri="mongodb://admin:YOUR_PASSWORD@localhost:27017" \
  --archive | gzip > backup-$(date +%Y%m%d).gz
```

#### Restore from Backup

```bash
# List available backups
ls -lh /backups/shivagri/

# Restore specific backup
gunzip < /backups/shivagri/mongo-20250102_020000.gz | \
docker compose -f docker-compose.prod.yml exec -T mongodb mongorestore --archive
```

### Updates

#### Update All Services

```bash
cd /var/www/shiv-agri

# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Restart services (zero-downtime)
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

#### Update Single Service

```bash
# Update API only
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d api

# Verify
docker compose -f docker-compose.prod.yml logs -f api
```

### Clean Up

```bash
# Remove unused images
docker image prune -f

# Remove all unused resources
docker system prune -a -f

# View disk space recovered
docker system df
```

---

## 🔧 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs SERVICE_NAME

# Check container status
docker compose -f docker-compose.prod.yml ps

# Restart specific service
docker compose -f docker-compose.prod.yml restart SERVICE_NAME

# Recreate container
docker compose -f docker-compose.prod.yml up -d --force-recreate SERVICE_NAME
```

### API Not Responding

```bash
# Check API health endpoint
curl http://localhost:3000/health

# Check API logs
docker compose -f docker-compose.prod.yml logs -f api

# Check if API container is running
docker compose -f docker-compose.prod.yml ps api

# Access API container
docker compose -f docker-compose.prod.yml exec api sh
# Inside container:
# printenv | grep MONGO  # Check environment variables
```

### Database Connection Issues

```bash
# Check MongoDB is running
docker compose -f docker-compose.prod.yml ps mongodb

# Check MongoDB logs
docker compose -f docker-compose.prod.yml logs -f mongodb

# Access MongoDB shell
docker compose -f docker-compose.prod.yml exec mongodb mongosh

# Test connection
mongosh "mongodb://admin:PASSWORD@localhost:27017"
```

### Nginx/SSL Issues

```bash
# Test nginx configuration
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Reload nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

# Check SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Check certificate expiry
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Docker Hub Issues

#### Login Failed

```bash
# Check you're using access token, not password
docker login -u YOUR_USERNAME
# Paste access token

# Verify login
docker info | grep Username
```

#### Image Pull Failed

```bash
# Re-login to Docker Hub
docker logout
docker login -u YOUR_USERNAME

# Pull specific image
docker pull YOUR_USERNAME/shiv-agri-api:latest

# Check image exists on Docker Hub
# Visit: hub.docker.com/repository/list
```

#### Rate Limit Exceeded

```bash
# Check rate limit
curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:ratelimitpreview/test:pull" | \
  jq -r .token | \
  xargs -I {} curl -H "Authorization: Bearer {}" https://registry-1.docker.io/v2/ratelimitpreview/test/manifests/latest 2>&1 | \
  grep -i ratelimit

# Solution: Login to get higher limits
docker login

# Or upgrade to Docker Hub Pro
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Clean up
docker system prune -a -f --volumes

# Check log sizes
du -sh /var/lib/docker/containers/*/*-json.log

# Rotate logs if needed
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

### Port Already in Use

```bash
# Check what's using port 80
lsof -i :80

# Kill process
kill -9 PID

# Or stop conflicting service
systemctl stop apache2  # or nginx
```

### GitHub Actions Failing

```bash
# Check GitHub Actions logs
# Go to: GitHub → Actions tab → Click on failed workflow

# Common issues:
# 1. Missing secrets → Check repository secrets
# 2. Docker Hub login failed → Verify DOCKERHUB_TOKEN
# 3. SSH failed → Verify SERVER_SSH_KEY
# 4. Image build failed → Check Dockerfile syntax
```

---

## 🏗️ Technical Architecture

### Container Architecture

```yaml
Services:
  mongodb:
    image: mongo:7.0
    ports: Internal only
    volumes: Persistent storage

  api:
    image: YOUR_USERNAME/shiv-agri-api:latest
    ports: Internal only (3000)
    depends_on: mongodb

  frontend:
    image: YOUR_USERNAME/shiv-agri-frontend:latest
    ports: Internal only (80)

  nginx:
    image: YOUR_USERNAME/shiv-agri-nginx:latest
    ports: 80, 443 (public)
    depends_on: api, frontend

  certbot:
    image: certbot/certbot
    volumes: SSL certificates
```

### Network Architecture

All services communicate via Docker network:

```
app-network (bridge)
├── mongodb (database)
├── api (backend) → connects to mongodb
├── frontend (static files)
└── nginx (reverse proxy) → routes to frontend & api
```

### Volume Management

```yaml
Volumes:
  mongodb_data:      Database persistence
  mongodb_config:    MongoDB configuration
  api_uploads:       User uploaded files
  certbot_www:       Let's Encrypt challenges
  certbot_conf:      SSL certificates
```

### CI/CD Pipeline

```mermaid
Developer → Git Push
    ↓
GitHub Actions (3 workflows)
    ↓
Build Docker Images
    ↓
Push to Docker Hub
  - api:latest
  - frontend:latest
  - nginx:latest
    ↓
SSH to VPS
    ↓
Pull Latest Images
    ↓
Restart Containers
    ↓
✅ Live in Production
```

### Security Features

- ✅ Non-root Docker containers
- ✅ Multi-stage builds (smaller attack surface)
- ✅ UFW firewall (only 22, 80, 443 open)
- ✅ SSH key authentication
- ✅ SSL/TLS encryption
- ✅ Rate limiting on API
- ✅ Environment variable isolation
- ✅ MongoDB authentication
- ✅ Docker network isolation
- ✅ Health checks for all services

---

## 🎮 Common Operations

### Service Management

```bash
# Start all services
docker compose -f docker-compose.prod.yml up -d

# Stop all services
docker compose -f docker-compose.prod.yml down

# Restart specific service
docker compose -f docker-compose.prod.yml restart api

# View service status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

### Scaling Services

```bash
# Scale API to 3 instances (requires load balancer setup)
docker compose -f docker-compose.prod.yml up -d --scale api=3

# Check scaled services
docker compose -f docker-compose.prod.yml ps
```

### Accessing Containers

```bash
# Access API container shell
docker compose -f docker-compose.prod.yml exec api sh

# Access MongoDB shell
docker compose -f docker-compose.prod.yml exec mongodb mongosh

# Run command in container
docker compose -f docker-compose.prod.yml exec api npm run migrate
```

### Environment Variables

```bash
# Update .env file
nano /var/www/shiv-agri/.env

# Restart services to apply changes
docker compose -f docker-compose.prod.yml restart

# View environment variables
docker compose -f docker-compose.prod.yml exec api printenv
```

### Rollback

```bash
# Rollback to specific image version
# Edit docker-compose.prod.yml
nano docker-compose.prod.yml

# Change:
# FROM: username/shiv-agri-api:latest
# TO:   username/shiv-agri-api:main-abc123def

# Pull and restart
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d api
```

### Database Operations

```bash
# Create database backup
/root/backup-shivagri.sh

# Access MongoDB
docker compose -f docker-compose.prod.yml exec mongodb mongosh

# Common MongoDB commands:
show dbs
use shiv-agri
show collections
db.stats()

# Export collection
docker compose -f docker-compose.prod.yml exec mongodb mongoexport \
  --db=shiv-agri --collection=users --out=/data/users.json
```

---

## 🔐 Security Best Practices

### Checklist

- ✅ Use strong passwords for MongoDB (min 16 chars)
- ✅ Keep JWT_SECRET secure and complex (min 32 chars)
- ✅ Enable firewall (UFW) with minimal ports
- ✅ Use SSH keys instead of passwords
- ✅ Keep Docker and system packages updated
- ✅ Regular database backups
- ✅ Enable HTTPS with valid SSL certificates
- ✅ Limit SSH access to specific IPs (optional)
- ✅ Monitor logs regularly
- ✅ Use environment variables for secrets
- ✅ Never commit .env files
- ✅ Rotate access tokens periodically
- ✅ Use Docker Hub Pro for private images

### Hardening SSH

```bash
# Edit SSH config
nano /etc/ssh/sshd_config

# Recommended settings:
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no

# Restart SSH
systemctl restart sshd
```

### Firewall Rules

```bash
# Check current rules
ufw status verbose

# Optional: Limit SSH to specific IP
ufw delete allow 22/tcp
ufw allow from YOUR_IP to any port 22 proto tcp

# Reload
ufw reload
```

### MongoDB Security

```bash
# Already configured in .env:
# - Authentication enabled
# - Strong passwords required
# - Network isolation (not exposed publicly)

# Additional: Enable MongoDB encryption at rest
# (Advanced - requires Pro license)
```

### SSL/TLS Best Practices

```bash
# Force HTTPS (already in nginx config)
# Use modern TLS versions (TLSv1.2, TLSv1.3)
# Strong cipher suites
# HSTS headers

# Test SSL configuration
# Visit: https://www.ssllabs.com/ssltest/
```

---

## 📚 Appendix

### Quick Reference Commands

```bash
# Service management
docker compose -f docker-compose.prod.yml up -d         # Start
docker compose -f docker-compose.prod.yml down          # Stop
docker compose -f docker-compose.prod.yml restart       # Restart
docker compose -f docker-compose.prod.yml ps            # Status
docker compose -f docker-compose.prod.yml logs -f       # Logs

# Updates
docker compose -f docker-compose.prod.yml pull          # Pull images
docker compose -f docker-compose.prod.yml up -d         # Apply updates

# Backups
/root/backup-shivagri.sh                                # Manual backup
ls -lh /backups/shivagri/                               # List backups

# Maintenance
docker system prune -f                                  # Clean up
docker stats                                            # Resource usage
df -h                                                   # Disk space
```

### File Locations

```
/var/www/shiv-agri/          Application directory
├── .env                      Environment variables
├── docker-compose.prod.yml   Production config
└── nginx/nginx.conf         Nginx configuration (if edited locally)

/backups/shivagri/           Backup directory
├── mongo-20250101_020000.gz
└── mongo-20250102_020000.gz

/root/backup-shivagri.sh     Backup script

/var/log/shivagri-backup.log Backup logs
```

### Environment Variables Reference

```env
# Required
DOCKERHUB_USERNAME=          Your Docker Hub username
MONGO_ROOT_USER=             MongoDB root username
MONGO_ROOT_PASSWORD=         MongoDB root password
MONGO_DB=                    Database name
MONGO_USER=                  App database user
MONGO_PASSWORD=              App database password
JWT_SECRET=                  JWT secret key (min 32 chars)
DOMAIN=                      Your domain name
NODE_ENV=production          Environment

# Optional
API_DOMAIN=                  API subdomain
PORT=3000                    API port
```

### Docker Hub Image Tags

```
latest                       Always points to newest build
main-abc123def              Git SHA tag (for rollbacks)
```

### Useful Links

- **Docker Hub**: https://hub.docker.com
- **Docker Docs**: https://docs.docker.com
- **Let's Encrypt**: https://letsencrypt.org
- **SSL Test**: https://www.ssllabs.com/ssltest/
- **DNS Checker**: https://www.whatsmydns.net
- **GitHub Actions**: https://docs.github.com/actions

### Support

For issues or questions:
1. Check [Troubleshooting](#-troubleshooting) section
2. Review container logs
3. Check GitHub Actions logs
4. Verify all secrets are configured correctly

---

## 🎯 Success Criteria

Your deployment is successful when:

- ✅ All containers running and healthy
- ✅ Frontend accessible via `https://yourdomain.com`
- ✅ API responding at `https://yourdomain.com/api`
- ✅ MongoDB data persisting across restarts
- ✅ SSL certificates valid and auto-renewing
- ✅ Automated deployments working via GitHub Actions
- ✅ Daily backups running successfully
- ✅ Zero errors in logs

---

## 📝 Estimated Time

**Total Setup Time: 6-8 hours** (first time)

**Breakdown:**
- Docker Hub setup: 15 minutes
- GitHub configuration: 15 minutes
- VPS setup: 1-2 hours
- DNS configuration: 5 minutes (+ wait time)
- Initial deployment: 30 minutes
- SSL setup: 15 minutes
- Testing and verification: 1 hour
- Troubleshooting buffer: 2-3 hours

**Subsequent Deployments: Automatic!** (5-10 minutes via CI/CD)

---

## ✅ Pre-Flight Checklist

Before going live:

- [ ] Docker Hub Pro account created (or public repos configured)
- [ ] Docker Hub access token generated
- [ ] All GitHub secrets configured
- [ ] VPS provisioned and accessible
- [ ] Docker and Docker Compose installed on VPS
- [ ] Firewall configured
- [ ] Domain DNS pointing to VPS
- [ ] Environment variables configured on VPS
- [ ] Backup script tested
- [ ] SSL certificates obtained
- [ ] HTTPS working correctly
- [ ] All containers healthy
- [ ] Logs showing no errors
- [ ] Automated deployments tested

---

**🎉 Congratulations!** You now have a production-ready, automated deployment infrastructure!

**Created for**: SHI-15 - Production Infrastructure Setup
**Last Updated**: November 2, 2025
**Version**: 2.0 (Docker Hub)

---

*For questions or issues, check the troubleshooting section or review container logs.*
