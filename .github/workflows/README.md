# GitHub Actions Deployment Workflows

This directory contains automated deployment workflows for the Shiv-Agri application.

## Workflows

### 1. `deploy-api.yml` - API Deployment

Triggers on:
- Push to `main` branch with changes in `backend/**`
- Manual trigger via `workflow_dispatch`

**Steps:**
1. Builds the API Docker image
2. Pushes to Docker Hub
3. SSHs to VPS and deploys the updated API container

### 2. `deploy-frontend.yml` - Frontend Deployment

Triggers on:
- Push to `main` branch with changes in `frontend/**`
- Manual trigger via `workflow_dispatch`

**Steps:**
1. Builds the Frontend Docker image
2. Pushes to Docker Hub
3. SSHs to VPS and deploys the updated Frontend container

### 3. `deploy-nginx.yml` - Nginx Deployment

Triggers on:
- Push to `main` branch with changes in `nginx/**`
- Manual trigger via `workflow_dispatch`

**Steps:**
1. Builds the Nginx Docker image
2. Pushes to Docker Hub
3. SSHs to VPS and deploys the updated Nginx container

### 4. `sync-docker-compose.yml` - Docker Compose Configuration Sync

Triggers on:
- Push to `main` branch with changes in `docker-compose.prod.yml`
- Manual trigger via `workflow_dispatch`

**Steps:**
1. Uploads `docker-compose.prod.yml` to VPS
2. Validates the configuration syntax
3. Shows current service status
4. Provides instructions for restarting services

**Note:** This workflow only syncs the configuration file. It does NOT automatically restart services. This is a safety feature to prevent unintended service disruptions.

### 5. `sync-and-restart.yml` - Sync Docker Compose and Restart Services (Manual Only)

Triggers on:
- Manual trigger via `workflow_dispatch` only

**Inputs:**
- `restart_services`: Choose whether to restart services (yes/no)
- `services_to_restart`: Specify which services to restart (comma-separated or "all")

**Steps:**
1. Uploads `docker-compose.prod.yml` to VPS
2. Validates the configuration
3. Optionally restarts specified services
4. Pulls latest images if restarting
5. Cleans up old images

**Use Cases:**
- Deploy configuration changes and restart all services in one action
- Update configuration for specific services only
- Force service restart with latest configuration

## Environment Variable Loading

All deployment workflows now **automatically source the `.env` file** from the VPS before executing docker-compose commands. This ensures that:

- Environment variables are properly loaded for docker-compose
- Variables with special characters (like `MONGO_PASSWORD_ENCODED`) are correctly available
- The deployment uses the exact same environment configuration as manual deployments

### How it Works

Each workflow includes this step before running docker-compose:

```bash
# Source environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
  echo "✓ Environment variables loaded from .env"
else
  echo "⚠ Warning: .env file not found"
fi
```

This command:
1. Checks if `.env` exists
2. Reads the file and filters out comments (lines starting with `#`)
3. Exports all variables to the shell environment
4. Confirms successful loading

## Required GitHub Secrets

The following secrets must be configured in your GitHub repository:

| Secret | Description | Example |
|--------|-------------|---------|
| `DOCKERHUB_USERNAME` | Docker Hub username | `shivagridevops` |
| `DOCKERHUB_TOKEN` | Docker Hub access token | `dckr_pat_...` |
| `SERVER_HOST` | VPS server IP address | `77.37.47.117` |
| `SERVER_USER` | SSH username | `root` |
| `SERVER_SSH_KEY` | Private SSH key for server access | `-----BEGIN OPENSSH PRIVATE KEY-----...` |

### Setting Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with its corresponding value

## Manual Trigger

### Triggering Deployment Workflows

You can manually trigger any deployment workflow:

1. Go to **Actions** tab in GitHub
2. Select the workflow (e.g., "Deploy API")
3. Click **Run workflow**
4. Select the branch (usually `main`)
5. Click **Run workflow**

### Using Sync and Restart Workflow

The `sync-and-restart.yml` workflow provides interactive options:

1. Go to **Actions** tab → **Sync Docker Compose and Restart Services**
2. Click **Run workflow**
3. Select branch: `main`
4. Choose options:
   - **Restart services after sync?**: Select `yes` or `no`
   - **Services to restart**:
     - Type `all` to restart all services
     - Type `api,mongodb` to restart specific services (comma-separated)
     - Examples: `api`, `frontend`, `nginx`, `mongodb`, `api,frontend`
5. Click **Run workflow**

#### Example Scenarios

**Scenario 1: Sync configuration without restart**
- Restart services: `no`
- Use when you want to update the file but restart services later manually

**Scenario 2: Restart all services**
- Restart services: `yes`
- Services to restart: `all`
- Use when you've made changes affecting multiple services

**Scenario 3: Restart only API**
- Restart services: `yes`
- Services to restart: `api`
- Use when you've only changed API-related configuration

**Scenario 4: Restart API and MongoDB**
- Restart services: `yes`
- Services to restart: `api,mongodb`
- Use when you've changed database-related configuration

## Deployment Process

### Automatic Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Developer pushes code to main branch                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions detects changes in specific paths           │
│  (backend/**, frontend/**, or nginx/**)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Build Docker image with latest code                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Push image to Docker Hub with tags                         │
│  - latest (for main branch)                                 │
│  - {branch}-{sha} (for version tracking)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  SSH to VPS server                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Load environment variables from .env                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Pull latest image from Docker Hub                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Recreate container with new image                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Clean up old images                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Deployment complete! ✓                                     │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring Deployments

### View Workflow Runs

1. Go to the **Actions** tab in your GitHub repository
2. Select the workflow you want to monitor
3. Click on a specific run to see detailed logs

### Check Deployment Status on VPS

```bash
# SSH to the server
ssh root@77.37.47.117

# Check container status
docker ps --filter name=shivagri

# Check logs
docker logs shivagri-api
docker logs shivagri-frontend
docker logs shivagri-nginx
```

## Workflow Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│  What do you want to deploy?                                │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    Code changes    Configuration    Full restart
    (API/Frontend)     changes          needed
         │               │               │
         ▼               ▼               ▼
  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐
  │ Deploy API  │  │ Sync Docker  │  │ Sync and    │
  │ Deploy      │  │ Compose      │  │ Restart     │
  │ Frontend    │  │              │  │ (Manual)    │
  │ Deploy Nginx│  │              │  │             │
  └─────────────┘  └──────────────┘  └─────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
   Automatic         Automatic        Manual only
   (on push)         (on push)      (with options)
```

## Troubleshooting

### Docker Compose Configuration Issues

**Problem:** Services fail after docker-compose.prod.yml is updated

**Solution:**
1. Check workflow logs for validation errors
2. SSH to server and manually validate:
   ```bash
   cd /var/www/shiv-agri
   docker compose -f docker-compose.prod.yml config
   ```
3. If valid, use "Sync and Restart" workflow to apply changes

### Deployment Fails with "Environment Variables Not Found"

**Solution:** Ensure the `.env` file exists on the VPS at `/var/www/shiv-agri/.env`

```bash
ssh root@77.37.47.117 "cat /var/www/shiv-agri/.env"
```

### Docker Compose Fails with Authentication Error

**Solution:** Ensure MongoDB user exists and credentials in `.env` are correct

```bash
# List existing MongoDB users
cd /path/to/scripts
./list-mongodb-users.sh --remote root@77.37.47.117 -a admin -p "adminpass" -d shiv-agri
```

### Container Fails to Start After Deployment

**Solution:** Check container logs for specific errors

```bash
ssh root@77.37.47.117 "docker logs --tail 50 shivagri-api"
```

### SSH Connection Failed

**Possible causes:**
- Invalid SSH key in GitHub secrets
- Firewall blocking GitHub Actions IP ranges
- SSH service not running on VPS

**Solution:** Test SSH connection manually and verify `SERVER_SSH_KEY` secret

## Best Practices

1. **Test locally first** before pushing to main
2. **Use feature branches** for development, merge to main for deployment
3. **Monitor workflow runs** after each deployment
4. **Keep secrets secure** - never commit them to the repository
5. **Review logs** if deployment fails
6. **Use manual triggers** for controlled deployments during maintenance
7. **Keep .env file backed up** on the VPS

## Recent Updates

### 2025-11-12: Environment Variable Sourcing

- Added explicit `.env` file sourcing before docker-compose commands
- Ensures consistent environment variable handling
- Provides visual confirmation when environment is loaded
- Handles missing `.env` file gracefully with warning message

This update resolves issues with special characters in passwords (e.g., `MONGO_PASSWORD_ENCODED`) by ensuring all environment variables are properly exported to the shell before docker-compose execution.

## Related Documentation

- [Docker Compose Configuration](../../docker-compose.prod.yml)
- [MongoDB User Management Scripts](../../scripts/README.md)
- [Server Setup Guide](../../scripts/vps-setup.sh)
