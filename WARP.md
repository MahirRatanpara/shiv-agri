# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository overview

- Monorepo for the Shiv-Agri application with a Node.js/Express + MongoDB API, an Angular SPA frontend, and Docker/nginx-based production infrastructure.
- Key top-level directories:
  - `backend/` – Node/Express API, MongoDB models, RBAC, PDF generation templates and services.
  - `frontend/` – Angular 20 application, permission-aware UI and admin dashboards.
  - `nginx/` – Reverse-proxy configuration for API + SPA, HTTP→HTTPS redirect.
  - `infra/` – Kubernetes manifests (optional deployment path).
  - `scripts/` – VPS setup, MongoDB backup and related operational scripts.
  - `.github/workflows/` – GitHub Actions CI/CD pipelines for API, frontend, nginx, docker-compose sync, and RBAC permission deployment.
  - `docs/` – Detailed guides for RBAC and MongoDB migration.

Important documentation to consult for deeper context:
- `SETUP.md` – Local dev, Docker and Kubernetes setup instructions.
- `DEPLOYMENT_GUIDE.md` – End-to-end production deployment, CI/CD, SSL, monitoring.
- `Application_Requirements.md` – High-level functional and technical requirements.
- `docs/RBAC_IMPLEMENTATION_GUIDE.md` – Full RBAC design and implementation details across backend and frontend.
- `docs/MONGODB_MIGRATION_GUIDE.md` – Migrating MongoDB from Docker to a native VPS install.
- `.github/workflows/README.md` – Summary of deployment workflows and required GitHub secrets.

## Local development workflow

### Backend API (Node.js/Express)

Backend entrypoint: `backend/src/server.js` (Express app + Mongo connection via `backend/src/config/database.js`).

Typical local setup and run:

```bash
cd backend
npm install
cp .env.example .env   # set MONGODB_URI, JWT_SECRET, ALLOWED_ORIGINS, etc.
node src/server.js
```

Notes:
- If `MONGODB_URI` is not set, the backend defaults to `mongodb://localhost:27017/shiv-agri`.
- For local development you can either run a local MongoDB instance or use the `mongodb` service from `docker-compose.yml` (see below).

#### Quick backend smoke test (soil testing API)

There is a shell-based smoke test script for the soil testing endpoints:

```bash
cd backend
chmod +x test-soil-testing-api.sh   # once
./test-soil-testing-api.sh
```

This script assumes the API is running on `http://localhost:3000` and uses `curl` + `json_pp` to:
- Check `/api/health`.
- List soil-testing sessions.
- Create/update a sample soil-testing session and fetch it back.

There is currently no dedicated Node.js test runner configured for the backend (no `npm test` script).

### Frontend (Angular 20)

The Angular application lives under `frontend/` and is configured via `frontend/angular.json`.

Common commands:

```bash
cd frontend
npm install

# Development server
npm start           # equivalent to: ng serve (default http://localhost:4200)

# Production build
npm run build        # ng build, output to dist/frontend/browser

# Unit tests (Karma)
npm test             # ng test
```

Running a single frontend test (Karma):

```bash
cd frontend
# Run only a specific spec file by path
npm test -- --include src/app/path/to/your.component.spec.ts
```

Adjust the `--include` path to the spec you want to run; this leverages Angular CLI's test builder configuration in `angular.json`.

### Full stack via Docker Compose (local development)

For a containerized local environment (MongoDB + API + frontend + nginx), use the root-level `docker-compose.yml`:

```bash
# From repo root

docker compose up -d     # build (if needed) and start mongodb, api, frontend, nginx
docker compose down      # stop and remove containers
```

Key points from `docker-compose.yml`:
- `mongodb` (MongoDB 7.0) exposed on `27017` with persistent volumes.
- `api` built from `backend/Dockerfile`, mapped to host port `3000`, depends on `mongodb` health.
- `frontend` built from `frontend/Dockerfile`.
- `nginx` built from `nginx/Dockerfile`, exposed on `80`, proxies `/` to frontend and `/api` to the API.

With this stack running, you typically access:
- Frontend via `http://localhost` (nginx → Angular).
- API via `http://localhost/api`.
- MongoDB via `localhost:27017` (from host).

## Permissions and RBAC

RBAC is a central part of this codebase and is shared between backend and frontend.

Core pieces:
- Configuration: `backend/src/config/permissions.yml` defines all permissions and roles.
- Models: `backend/src/models/Permission.js`, `Role.js`, `User.js` implement RBAC data structures.
- Middleware: `backend/src/middleware/auth.js` provides:
  - `authenticate` – JWT auth and user loading.
  - `requirePermission` – permission-based API guarding.
  - Helpers like `hasPermission` used programmatically.
- Scripts: `backend/src/scripts/migrate-permissions.js` syncs YAML → MongoDB (permissions, roles, user permission caches).
- Frontend: see `docs/RBAC_IMPLEMENTATION_GUIDE.md` for details of `PermissionService`, `HasPermissionDirective`, `HasRoleDirective`, admin role management UI, and permission-based navigation/toasts.

### RBAC migration commands

These scripts are defined in `backend/package.json` and should be run from the `backend/` directory with a valid `MONGODB_URI`:

```bash
cd backend
npm install   # if not already installed

# Preview changes without modifying the database
npm run migrate:permissions:dry-run

# Apply permission and role changes
npm run migrate:permissions

# Force-update system roles as well (use carefully)
npm run migrate:permissions:force
```

Use these after editing `backend/src/config/permissions.yml` or when RBAC changes are deployed to a new environment.

For production, RBAC migrations are typically run through the GitHub Actions workflow `.github/workflows/deploy-permissions.yml` ("Deploy Database Permissions"), which:
- Rebuilds and restarts the `api` service on the VPS.
- Executes the appropriate `npm run migrate:permissions*` command inside the `shivagri-api` container.
- Supports manual `dry_run` and `force_update` flags and automatically falls back to a normal migration on `main` branch pushes.

## High-level backend architecture

Backend entrypoint: `backend/src/server.js`.

Pipeline:
1. Load environment (`dotenv`).
2. Connect to MongoDB via `backend/src/config/database.js` (uses `MONGODB_URI`).
3. Configure middleware:
   - CORS based on `ALLOWED_ORIGINS` (comma-separated env var).
   - Cookie parsing.
   - JSON + URL-encoded body parsing.
4. Register routes:
   - `/api/auth` – authentication (Google OAuth-based login and JWT issuance).
   - `/api` – main API router, which further delegates to domain-specific routers under `backend/src/routes/`.
   - `/health` – health checks.
5. Attach a process-wide error handler.

Key backend components (non-exhaustive, but important for navigation):
- Routes: `backend/src/routes/`
  - `auth.js` – login/logout, Google OAuth callbacks.
  - `api.js` – aggregates feature routers.
  - `soilTesting.js`, `waterTesting.js` – soil and water analysis workflows.
  - `managerialWork.js` – operations-related endpoints.
  - `pdfGeneration.js` – PDF export endpoints (reports, invoices, receipts, letters).
  - `roles.js`, `users.js` – RBAC and user administration.
- Controllers: `backend/src/controllers/`
  - `authController.js`, `userController.js` – authentication and user lifecycle.
  - `invoiceController.js`, `receiptController.js`, `letterController.js` – billing and letter-pad flows.
  - `roleController.js` – role and permission management APIs.
- Models: `backend/src/models/`
  - Domain entities: `SoilSession`, `SoilSample`, `WaterSession`, `WaterSample`, `Invoice`, `Receipt`, `Letter`, `Product`, `User`, `Role`, `Permission`.
- Utilities and services:
  - `backend/src/services/pdfGenerator.js` – Puppeteer-based PDF generation using HTML templates in `backend/templates/`.
  - `backend/src/utils/soilClassification.js`, `waterClassification.js` – classification logic for report values.
  - `backend/src/utils/logger.js` – Winston-based logging setup.
  - `backend/src/utils/jwt.js` – JWT helpers.

When adding new protected backend endpoints:
- Follow existing patterns in `routes/*` + `controllers/*`.
- Use `authenticate` and `requirePermission` from `middleware/auth.js`.
- Add any new permissions to `src/config/permissions.yml` and run the migration script.

## High-level frontend architecture

The frontend is an Angular 20 SPA configured in `frontend/angular.json` with build/serve/test targets.

Important architectural elements (see `docs/RBAC_IMPLEMENTATION_GUIDE.md` for full details):
- `frontend/src/app/services/permission.service.ts`
  - Centralized permission and role checking API.
  - Exposes helpers like `hasPermission`, `hasAllPermissions`, `hasAnyPermission`, `hasRole`.
  - Wraps backend role/permission endpoints for the admin UI.
- Structural directives:
  - `frontend/src/app/directives/has-permission.directive.ts` – `*hasPermission` for showing/hiding elements based on permissions.
  - `frontend/src/app/directives/has-role.directive.ts` – `*hasRole` for role-based visibility.
- Admin RBAC UI:
  - `frontend/src/app/pages/admin/role-management/` – role listing, creation, editing, permission assignment.
- UX infrastructure:
  - Toast notifications service used in pages like soil and water testing instead of browser `alert()`.
  - A confirmation modal service and component used for actions like logout.
  - A global HTTP error interceptor (`frontend/src/app/interceptors/error.interceptor.ts`) that maps HTTP errors to user-friendly messages.
- Navigation:
  - `frontend/src/app/components/header/` – header and navigation; shows/hides sections (e.g., soil/water testing) based on user permissions via `PermissionService`.

When building new UI around secured features:
- Prefer `*hasPermission` / `*hasRole` and `PermissionService` instead of ad-hoc permission checks.
- Ensure new routes correspond to backend permissions and are added to `permissions.yml` as needed.

## Infrastructure, deployment, and CI/CD

### Docker and Docker Compose

- Local dev: `docker-compose.yml` defines `mongodb`, `api`, `frontend`, and `nginx` for a full local stack.
- Production: `docker-compose.prod.yml` defines the production stack on the VPS:
  - `api` – Node/Express API container (`${DOCKERHUB_USERNAME}/shiv-agri-api:latest`).
  - `frontend` – Nginx container serving the built Angular app.
  - `nginx` – reverse proxy / TLS terminator (`${DOCKERHUB_USERNAME}/shiv-agri-nginx:latest`).
  - `certbot` – Let's Encrypt auto-renewal.
  - Volumes for uploads and certificates: `api_uploads`, `certbot_www`, `certbot_conf`.

The detailed production flow, including first-time setup, Docker Hub integration, SSL issuance, and operational commands, is documented in `DEPLOYMENT_GUIDE.md`.

### Nginx reverse proxy

- Config file: `nginx/nginx.conf`.
- Responsibilities:
  - Terminate HTTPS on ports 80/443 (with certificates from `/etc/letsencrypt/live/...`).
  - Proxy `/api` to the `api:3000` service with basic rate limiting.
  - Proxy `/` to `frontend:80` for the Angular SPA.
  - Redirect HTTP → HTTPS and serve ACME challenge files from `/var/www/certbot`.

### GitHub Actions workflows

Location: `.github/workflows/`.

- `deploy-api.yml`, `deploy-frontend.yml`, `deploy-nginx.yml` – build Docker images, push to Docker Hub, SSH into VPS, and deploy updated containers.
- `sync-docker-compose.yml` – syncs `docker-compose.prod.yml` to the VPS and validates it (no automatic restart).
- `sync-and-restart.yml` – manual workflow that syncs `docker-compose.prod.yml` and optionally restarts selected services.
- `deploy-permissions.yml` – validates `permissions.yml`, pulls the latest `api` image on the VPS, restarts the container, and runs the RBAC migration script inside it.

For any infrastructure change (Docker, nginx, deployment behavior), review both `DEPLOYMENT_GUIDE.md` and `.github/workflows/README.md` to understand how CI/CD interacts with the VPS and Docker Hub.

## Data and MongoDB

- Local development:
  - Backend defaults to `mongodb://localhost:27017/shiv-agri` when `MONGODB_URI` is unset.
  - `backend/.env.example` provides a minimal local configuration including `MONGODB_URI`, JWT secrets, and `ALLOWED_ORIGINS`.
- Production and staging:
  - Root `.env.example` documents the full set of production environment variables, including Mongo users/passwords, `MONGODB_URI`, JWT, domain settings, email/WhatsApp integration, CORS, and rate limiting.
  - `docs/MONGODB_MIGRATION_GUIDE.md` describes how to migrate MongoDB from a Docker container to a native installation on the VPS, including backup, restore, and configuration steps.

Before modifying anything related to MongoDB deployments, backups, or migrations, consult:
- `docs/MONGODB_MIGRATION_GUIDE.md` for migration and operational procedures.
- `scripts/backup-mongodb.sh` / `scripts/mongodb-backup.sh` for how backups are implemented and scheduled.
- `docker-compose*.yml` and `DEPLOYMENT_GUIDE.md` for how the API obtains its `MONGODB_URI` and credentials in each environment.
