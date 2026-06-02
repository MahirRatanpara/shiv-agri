# Shiv-Agri Application Context

> **Purpose:** Single source of truth for LLM context. Each section is self-contained so an LLM can read only the relevant section for a given task. Organized by feature domain for efficient chunking.

> **Last Updated:** 2026-05-30

---

## TABLE OF CONTENTS

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Feature: Soil Testing](#5-feature-soil-testing)
6. [Feature: Water Testing](#6-feature-water-testing)
7. [Feature: Fertilizer Testing](#7-feature-fertilizer-testing)
8. [Feature: Project Management (Farm Dashboard)](#8-feature-project-management-farm-dashboard)
9. [Feature: Transactions & Budget](#9-feature-transactions--budget)
10. [Feature: Managerial Work - Receipts](#10-feature-managerial-work---receipts)
11. [Feature: Managerial Work - Invoices](#11-feature-managerial-work---invoices)
12. [Feature: Managerial Work - Letters](#12-feature-managerial-work---letters)
13. [Feature: User Management & RBAC](#13-feature-user-management--rbac)
14. [Feature: PDF Generation](#14-feature-pdf-generation)
15. [Feature: Media Service](#15-feature-media-service)
16. [Feature: Activity Logging](#16-feature-activity-logging)
17. [Feature: Drafts & Project Wizard](#17-feature-drafts--project-wizard)
18. [Frontend: Routing & Navigation](#18-frontend-routing--navigation)
19. [Frontend: Shared Components](#19-frontend-shared-components)
20. [Frontend: Services Reference](#20-frontend-services-reference)
21. [Frontend: Guards, Interceptors & Directives](#21-frontend-guards-interceptors--directives)
22. [Frontend: State Management](#22-frontend-state-management)
23. [Frontend: Styling & Theme](#23-frontend-styling--theme)
24. [Database: Complete Schema Reference](#24-database-complete-schema-reference)
25. [API: Complete Endpoint Reference](#25-api-complete-endpoint-reference)
26. [DevOps: Docker & Containerization](#26-devops-docker--containerization)
27. [DevOps: CI/CD Pipelines](#27-devops-cicd-pipelines)
28. [DevOps: Infrastructure & Deployment](#28-devops-infrastructure--deployment)
29. [DevOps: Monitoring & Maintenance](#29-devops-monitoring--maintenance)
30. [Environment Variables](#30-environment-variables)
31. [Feature: Notification Service](#31-feature-notification-service)

---

## 1. ARCHITECTURE OVERVIEW

### High-Level Architecture

```
Internet (HTTPS)
    ↓
Nginx Reverse Proxy (Port 443/80)
    ├── Frontend (Angular 20 SPA, port 80)
    ├── Backend API (Node.js/Express, port 3000)
    ├── Media Service (Spring Boot, port 8081)
    └── Notification Service (Spring Boot, port 8082)
            ↓
    MongoDB Database (Port 27017)
```

### System Design

- **Frontend:** Angular 20.3.0 standalone components SPA served via Nginx
- **Backend API:** Node.js/Express RESTful API with Puppeteer for PDF generation
- **Media Service:** Spring Boot 3.2.5 (Java 17) microservice for file uploads/storage
- **Notification Service:** Spring Boot 3.2.5 (Java 17) stateless microservice for WhatsApp + Gmail (OAuth2) delivery, including OTP routing (WhatsApp/SMS via MSG91)
- **Database:** MongoDB 7.0 with Mongoose ODM
- **Reverse Proxy:** Nginx with SSL termination, rate limiting, gzip compression
- **Auth:** Google OAuth 2.0 + Phone+WhatsApp OTP login (feature-flagged) — backend-issued JWT access token (24h) paired with opaque httpOnly refresh-token cookie (60d, hashed in DB)
- **Hosting:** Hostinger VPS with Docker Compose orchestration
- **CI/CD:** GitHub Actions with automated Docker builds and SSH deployments
- **SSL:** Let's Encrypt via Certbot with auto-renewal

### Key Design Decisions

- **Soft deletes** on all critical collections (isDeleted flag)
- **RBAC** with granular permissions (resource.action format)
- **Session-based testing workflow** with state machines (started → details → ready → completed)
- **Bilingual output** (Gujarati + English) for soil/water/fertilizer reports
- **Streaming PDF downloads** for bulk operations with progress tracking
- **No global state management library** — RxJS BehaviorSubjects + Services pattern

### Network Architecture

- All Docker services on a shared bridge network (`app-network`)
- Nginx handles SSL termination, rate limiting (10 req/s), and routing
- Media service uses X-Accel-Redirect for efficient file serving through Nginx
- CORS restricted to configured allowed origins

---

## 2. TECHNOLOGY STACK

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Angular | 20.3.0 | SPA framework (standalone components) |
| TypeScript | 5.9.2 | Type-safe JavaScript |
| RxJS | 7.8.0 | Reactive state & async |
| AG Grid | 32.3.2 | Data tables for testing modules |
| Bootstrap | CDN | CSS grid & base components |
| Owl Carousel | jQuery plugin | Image carousels |
| XLSX | 0.18.5 | Excel file handling |

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 (Alpine) | Runtime |
| Express | 5.1.0 | HTTP framework |
| Mongoose | 8.19.1 | MongoDB ODM |
| jsonwebtoken | 9.0.2 | JWT auth |
| google-auth-library | 9.6.3 | Google OAuth |
| Puppeteer | 24.33.0 | HTML-to-PDF |
| ExcelJS | 4.4.0 | Excel parsing |
| Archiver | 7.0.1 | ZIP compression |
| Winston | 3.19.0 | Logging |
| Multer | 2.0.2 | File uploads |

### Media Service
| Technology | Version | Purpose |
|-----------|---------|---------|
| Spring Boot | 3.2.5 | Java microservice framework |
| Java | 17 (Temurin) | Runtime |
| Spring Data MongoDB | - | MongoDB integration |
| Maven | - | Build tool |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| Docker / Docker Compose | Containerization |
| Nginx | Reverse proxy, SSL, rate limiting |
| MongoDB 7.0 | Primary database |
| GitHub Actions | CI/CD pipelines |
| Hostinger VPS | Production hosting |
| Let's Encrypt / Certbot | SSL certificates |
| Kubernetes (infra/) | Alternative deployment (available) |

---

## 3. PROJECT STRUCTURE

```
shiv-agri/
├── backend/
│   ├── sample-excel-templates/   (Soil & Water testing upload templates)
│   └── src/
│       ├── config/
│       │   ├── database.js
│       │   ├── features.js               (env-driven feature flags, e.g. OTP_LOGIN_ENABLED)
│       │   ├── fertilizerCropConfig.js   (in-memory crop defaults loader)
│       │   └── fertilizerCropDefaults.json (per-crop fertilizer defaults)
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── otpAuthController.js      (phone OTP login flow)
│       │   ├── projectController.js
│       │   ├── userController.js
│       │   ├── roleController.js
│       │   ├── transactionController.js
│       │   ├── receiptController.js
│       │   ├── invoiceController.js
│       │   └── letterController.js
│       ├── middleware/auth.js, featureFlags.js
│       ├── models/
│       │   ├── User.js, Role.js, Permission.js
│       │   ├── Project.js, Transaction.js
│       │   ├── SoilSession.js, SoilSample.js
│       │   ├── WaterSession.js, WaterSample.js
│       │   ├── FertilizerSession.js, FertilizerSample.js
│       │   ├── Receipt.js, Invoice.js, Letter.js
│       │   ├── ActivityLog.js, Draft.js, Notification.js
│       ├── routes/
│       │   ├── api.js (main router)
│       │   ├── auth.js, users.js, roles.js
│       │   ├── projects.js, transactions.js
│       │   ├── soilTesting.js, waterTesting.js, fertilizerTesting.js
│       │   ├── managerialWork.js, pdfGeneration.js, notifications.js
│       ├── services/
│       │   ├── projectService.js, transactionService.js
│       │   ├── pdfGenerator.js, draftService.js, activityLogService.js, notificationService.js
│       │   ├── otpService.js               (in-memory OTP issue/verify + rate limits)
│       │   ├── otpDelivery.js              (template / hello_world / console modes)
│       │   └── notificationClient.js       (HTTP client for notification-service)
│       ├── utils/
│       │   ├── jwt.js, logger.js
│       │   ├── session.js                  (backend refresh-token + httpOnly cookie helper)
│       │   ├── soilClassification.js, waterClassification.js
│       ├── scripts/migrate-permissions.js, migrate-phone-email-unique.js, create-sample-excel-templates.js
│       └── server.js
├── frontend/src/app/
│   ├── app.ts, app.routes.ts, app.config.ts
│   ├── components/
│   │   ├── header/, footer/, toast/, confirmation-modal/
│   │   ├── download-progress/, dashboard-overview/
│   │   ├── project-list/, project-detail-popup/, role-selection-modal/
│   │   ├── ag-grid-editors/datalist-cell-editor.ts
│   ├── pages/
│   │   ├── home/, login/, not-found/, my-account/, contact/, complete-profile/
│   │   ├── lab-testing/, soil-testing/, water-testing/, fertilizer-testing/
│   │   ├── farm-dashboard/, project-details/, project-wizard/
│   │   ├── managerial-work/ (receipts/, invoices/, letters/)
│   │   ├── admin/ (user-management/, role-management/)
│   │   ├── about/, blog/, events/, causes/, gallery/, etc.
│   ├── services/
│   │   ├── auth.service.ts, user.service.ts, permission.service.ts
│   │   ├── soil-testing.service.ts, water-testing.service.ts
│   │   ├── fertilizer-testing.service.ts
│   │   ├── managerial-work.service.ts, pdf.service.ts
│   │   ├── dashboard.service.ts, toast.service.ts
│   │   ├── confirmation-modal.service.ts, download-progress.service.ts
│   ├── guards/auth.guard.ts, profile-complete.guard.ts
│   ├── interceptors/auth.interceptor.ts, error.interceptor.ts
│   ├── directives/has-permission.directive.ts, has-role.directive.ts
│   ├── models/session-state.model.ts, fertilizer-session-state.model.ts
│   └── environments/environment.ts, environment.prod.ts
├── media-service/src/main/java/com/shivagri/media/
│   ├── MediaServiceApplication.java
│   ├── controller/MediaController.java
│   ├── service/MediaService.java
│   └── model/MediaDocument.java
├── notification-service/                       (Spring Boot WhatsApp + Gmail microservice)
│   ├── Dockerfile, pom.xml, mvnw, README.md
│   └── src/main/java/com/shivagri/notification/
│       ├── NotificationServiceApplication.java
│       ├── config/ (Async/Email/Msg91/Otp/Security/WhatsApp Properties, RestTemplateConfig)
│       ├── controller/ (EmailController, OtpController, WhatsAppController, dto/*)
│       ├── exception/ (GlobalExceptionHandler, NotificationException, ProviderException)
│       ├── security/ApiKeyAuthFilter.java     (X-API-Key authentication)
│       └── service/ (EmailService, GmailOAuthTokenService, OtpDispatchService, SmsService, WhatsAppService)
├── nginx/nginx.conf, Dockerfile
├── mongodb/init-mongo.js
├── infra/ (Kubernetes YAMLs)
├── .githooks/ (pre-commit: auto-update context.md + graphify, setup.sh: activate hooks)
├── .graphifyignore (graphify ignore patterns: images, videos, docs, context.md)
├── graphify-out/ (knowledge graph output: cached JSON, chunks, detect, incremental)
├── scripts/ (vps-setup.sh, backup-mongodb.sh, init-letsencrypt.sh)
├── .github/workflows/ (8 CI/CD workflows)
├── docker-compose.yml, docker-compose.prod.yml
├── docs/PHONE_OTP_LOGIN_GUIDE.md (operator runbook for phone-OTP login)
├── context.md (LLM context — single source of truth)
└── .env.example
```

---

## 4. AUTHENTICATION & AUTHORIZATION

### Auth Methods

Two login methods feed a unified session layer (`backend/src/utils/session.js`):

1. **Google OAuth** — `POST /api/auth/google-code` (auth code) or `POST /api/auth/google` (ID token). Matches existing identity by `googleId` OR `email` so a manager-provisioned account is reused, not duplicated.
2. **Phone + WhatsApp OTP** (gated by `OTP_LOGIN_ENABLED`) — `POST /api/auth/otp/request` → `POST /api/auth/otp/verify`. Auto-creates a `role: user` farmer on first successful verify when the phone isn't already linked; otherwise reuses the existing user (single identity across Google + phone). Implemented in `controllers/otpAuthController.js` + `services/otpService.js` + `services/otpDelivery.js`.

### Session / Token Model

Every successful login (Google or OTP) goes through `issueSession(res, user)`:
- **Access token:** signed JWT (24h, `JWT_EXPIRES_IN`) returned in JSON response body, kept in localStorage by the frontend.
- **Refresh token:** opaque random 96-hex-char value, SHA-256-hashed before being stored on the user document. Raw value delivered as an httpOnly cookie (`refreshToken`, 60 days default via `REFRESH_TOKEN_TTL_DAYS`, `Secure`+`SameSite=None` in production). Rotated on every refresh.
- **Refresh:** `POST /api/auth/refresh` reads the cookie, looks up the user by hash, enforces `refreshTokenExpiresAt`, rotates the refresh token, and mints a new access token. Legacy fallback path validates pre-existing Google sessions via the stored Google refresh token and upgrades them onto the new scheme on first refresh.
- **Logout:** clears the refresh-token hash + cookie and revokes the Google refresh token if present.

### OTP Service (in-memory)

`backend/src/services/otpService.js` — Map keyed by normalized phone (`<cc><national>` digits).
- 4-digit numeric code, SHA-256-hashed; 3-minute expiry; 3 verify attempts per code; 60-second resend cooldown; 3 codes per phone per rolling hour.
- `crypto.timingSafeEqual` for code comparison.
- Single-instance only (state is lost on restart).
- `revokeOtp()` rolls back issuance when downstream delivery fails so the user is not penalized.

### OTP Delivery Modes (`OTP_DELIVERY_MODE`)

`backend/src/services/otpDelivery.js`:
- `template` (production) — calls notification-service `/api/notifications/otp` (channel chosen there: WhatsApp template or MSG91 SMS).
- `hello_world` (dev) — sends the no-approval WhatsApp `hello_world` sample template AND prints the actual code to the backend console.
- `console` (pure dev) — prints the code only, no provider call. Auto-upgraded to `template` when `NODE_ENV=production`.

### Profile Phone Attach (Self-service, OTP-verified)

Once an account exists, normal users may ATTACH a phone (never change it) via:
- `POST /api/auth/profile/phone/request-otp` and `POST /api/auth/profile/phone/verify-otp` — only succeeds when `metadata.phoneNumberNormalized` is empty; sets `phoneVerified=true`.
- `POST /api/auth/profile/phone` (no OTP) — used ONLY in Google-only mode (`OTP_LOGIN_ENABLED=false`) for manual phone entry on the complete-profile step.
- `POST /api/auth/profile/email` — attaches an email when none exists (no verification).
- `PATCH /api/auth/profile` is now **admin-only** — non-admins receive 403 with guidance to use OTP. Numbers are immutable once set; admins must fix mistakes.

### Profile-Complete Gate

`GET /api/auth/config` returns `{ googleLoginEnabled, otpLoginEnabled }`. The frontend `profileCompleteGuard` redirects authenticated users with a missing identity (email/phone) to `/complete-profile` before they can use protected app routes.

### Feature Flags (`backend/src/config/features.js`)

`OTP_LOGIN_ENABLED` (default `true`):
- `true` — phone OTP tab is shown; new Google users OTP-verify their phone in complete-profile.
- `false` — Google-only mode: phone OTP endpoints return 403 via the `requireOtpEnabled` middleware, frontend hides the phone tab, and new Google users enter their phone MANUALLY (no OTP) in complete-profile. Use this while WhatsApp Business / template approval is pending.

### Backend Auth Middleware (`backend/src/middleware/auth.js`)

**`authenticate`** — Extracts JWT from Authorization header or cookies, verifies, populates `req.user` with user + role + permissions. Returns 401 if invalid.

**`requirePermission(permissions, options)`** — Checks granular permissions. Options: `requireAll` (default true), `allowAdmin` (default true — admins bypass all checks). Returns 403 if insufficient.

**`requireOwnership(userIdField, resourceGetter)`** — Checks resource ownership. Admins can access all.

**`requireProjectAccess(permissions)`** — Project-scoped read gate. Allows admins, holders of any of the supplied permissions (plus an implicit set including `farm.projects.view`, `farms.view`, `farm.projects.approve`, `farm.projects.update`, `project.update`, `project.delete`), and **stakeholders** of the target project (`submittedBy`, `clientId`, `createdBy`, `assignedTo`, `projectManager`, `fieldWorkers`, `consultants`, `assignedTeam`). Used to grant farmers and assigned workers access to their own farm without granting the broad `farm.projects.view` permission.

### Permission Format

`resource.action` — e.g., `soil.sessions.view`, `project.create`, `managerial.receipts.delete`

**Actions:** view, create, update, delete, approve, assign-role, generate, download, send, upload, export, assign, manage, record

**Notable permissions:** `farm.projects.approve` (approve/reject farmer farm registrations — granted to admin and manager).

### JWT Utility (`backend/src/utils/jwt.js`)

- `generateAccessToken(payload)` — 24-hour JWT
- `verifyToken(token)` — Verify signature & expiry
- `decodeToken(token)` — Decode without expiry check (for refresh flow)

### User Roles

| Role | Description |
|------|-------------|
| admin | Full access, bypasses all permission checks |
| user | Standard user |
| end_user | Farmer self-registration role (creates farm projects in `pending_approval` state) |
| assistant | Assistant role |
| lab_technician | Lab testing access |
| manager | Managerial work access |

### Frontend Auth Components

- **AuthService** (`services/auth.service.ts`) — Google login, phone OTP login (`requestPhoneOtp`, `verifyPhoneOtp`), profile-attach OTP (`requestProfilePhoneOtp`, `verifyProfilePhoneOtp`, `setProfilePhone`, `setProfileEmail`), `loadAuthConfig()` (cached), `otpLoginEnabled` Signal, `currentUser$` BehaviorSubject, `isAuthenticated` Signal, `isProfileIncomplete()`
- **authGuard** (`guards/auth.guard.ts`) — Route protection, stores attempted URL for redirect after login
- **profileCompleteGuard** (`guards/profile-complete.guard.ts`) — Pairs with authGuard on protected routes; redirects to `/complete-profile` when the signed-in user is missing email/phone
- **authInterceptor** (`interceptors/auth.interceptor.ts`) — Adds JWT to all requests with `withCredentials: true`. Only skips token attachment for public auth endpoints (`/auth/google`, `/auth/google-code`, `/auth/refresh`, `/auth/otp/`); authenticated `/auth/me`, `/auth/logout`, `/auth/profile/...` still receive the Bearer token.
- **errorInterceptor** (`interceptors/error.interceptor.ts`) — User-friendly error toasts for HTTP status codes
- **HasPermissionDirective** (`directives/has-permission.directive.ts`) — Structural directive for template permission checks
- **HasRoleDirective** (`directives/has-role.directive.ts`) — Structural directive for template role checks
- **PermissionService** (`services/permission.service.ts`) — `hasPermission()`, `hasRole()`, `hasAnyPermission()`, loads from localStorage

---

## 5. FEATURE: SOIL TESTING

### Overview
Lab technicians create testing sessions, enter soil sample data (manually or via Excel upload), the system auto-classifies parameters in Gujarati and English, and generates PDF reports.

### Workflow (State Machine)
`started` → `details` → `ready` → `completed`

Managed by `SessionStateManager` class (frontend: `models/session-state.model.ts`)

### Database Models

**SoilSession** (`backend/src/models/SoilSession.js`)
- `date` (String, indexed), `version` (Number)
- `startTime`, `endTime` (Date)
- `status` (enum: started, details, ready, completed)
- `sampleCount` (Number), `lastActivity` (Date)
- Unique compound index: (date, version)

**SoilSample** (`backend/src/models/SoilSample.js`)
- `sessionId` (ObjectId → SoilSession, indexed)
- `sessionDate`, `sessionVersion`, `sampleNumber`
- Farmer info: `farmersName`, `mobileNo`, `location`, `farmsName`, `taluka`
- Measurements: `ph`, `ec`, `ocBlank`, `ocStart`, `ocEnd`, `p2o5R`, `k2oR`
- Calculated: `ocDifference`, `ocPercent`, `p2o5`, `k2o`, `organicMatter`
- Crop: `cropName`, `cropType` (enum: normal, small-fruit, large-fruit, '')
- Link: `fertilizerSampleId` (→ FertilizerSample)
- Classification (Gujarati): `phResult`, `ecResult`, `nitrogenResult`, `phosphorusResult`, `potashResult`
- Classification (English): `phResultEn`, `ecResultEn`, `nitrogenResultEn`, `phosphorusResultEn`, `potashResultEn`
- Farm linkage: `linkedProjectId` (ObjectId → Project, indexed), `linkedAt` — auto-set on PDF generation by `farmReportLinker` when `farmsName` + `mobileNo` match a Project's `name` + `clientPhone` (case-insensitive name, last-10-digits phone).

### Classification Logic (`backend/src/utils/soilClassification.js`)

| Parameter | Low | Medium | High |
|-----------|-----|--------|------|
| pH | 0-6.4 (Acidic) | 6.5-8.19 (Normal) | 8.2+ (Basic) |
| EC (mS/cm) | 0-1 (Normal) | 1-3 (Harmful) | 3+ (Damaging) |
| Nitrogen (%) | 0-0.50 | 0.51-0.75 | 0.76+ |
| Phosphorus (kg/ha) | 0-25 | 26-60 | 61+ |
| Potash (kg/ha) | 0-150 | 151-300 | 301+ |

**Final Deduction:**
- pH < 8.2 & EC < 1 → "Suitable for all field crops"
- pH < 8.2 & EC ≥ 1 → "High salt, consult expert"
- pH ≥ 8.2 → "Use organic manure, gypsum, salt-resistant crops"

### API Endpoints (`backend/src/routes/soilTesting.js`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/soil-testing/sessions` | soil.sessions.view | Paginated session list (no samples). Query: `page`, `limit`, `status` (`active`/`completed`/enum). Returns `{ sessions, pagination }` |
| GET | `/api/soil-testing/sessions/date/:date` | soil.sessions.view | Get sessions by date |
| GET | `/api/soil-testing/sessions/count/:date` | soil.sessions.view | Session count for date |
| GET | `/api/soil-testing/sessions/:id` | soil.sessions.view | Get session by ID |
| POST | `/api/soil-testing/sessions` | soil.sessions.create | Create session |
| PUT | `/api/soil-testing/sessions/:id` | soil.sessions.update | Update session & samples |
| PATCH | `/api/soil-testing/sessions/:id/status` | soil.sessions.update | Update session status |
| DELETE | `/api/soil-testing/sessions/:id` | — | Delete session & samples |
| POST | `/api/soil-testing/sessions/:id/upload-excel` | soil.sessions.update | Upload Excel samples (columns: Sample Number, Farmer's Name, Mobile No., Location, Farm's Name, Taluka, Crop Name) |
| GET | `/api/soil-testing/sessions/:sessionId/samples` | soil.sessions.view | Paginated samples |
| PATCH | `/api/soil-testing/sessions/:sessionId/samples` | soil.sessions.update | Bulk upsert samples |
| DELETE | `/api/soil-testing/sessions/:sessionId/samples` | soil.samples.delete | Bulk delete samples |
| GET | `/api/soil-testing/samples/:sampleId/soil-data` | — | Soil data for fertilizer linking |

### Frontend

- **Component:** `pages/soil-testing/soil-testing.ts` — AG Grid table, Excel import, session state management, PDF generation, sample CRUD. Uses `DatalistCellEditor` for cropName (searchable dropdown from fertilizer crop config). Server-side paginated active/completed session lists; completed sessions lazy-loaded on dropdown open.
- **Service:** `services/soil-testing.service.ts` — All session/sample API calls. `getSessions(page, limit, status)` replaces old `getAllSessions()`. Also injects `FertilizerTestingService` for crop config.
- **Routes:** `/lab-testing/soil-testing`, `/lab-testing/soil-testing/session/:sessionId`

---

## 6. FEATURE: WATER TESTING

### Overview
Similar to soil testing but for water quality analysis. Measures pH, EC, Ca+Mg, Na, SAR, CO3+HCO3, RSC and generates water quality class codes.

### Workflow
Same state machine as soil testing: `started` → `details` → `ready` → `completed`

### Database Models

**WaterSession** (`backend/src/models/WaterSession.js`)
- Same structure as SoilSession

**WaterSample** (`backend/src/models/WaterSample.js`)
- `sessionId` (ObjectId → WaterSession, indexed)
- Farmer info: same as SoilSample + `boreWellType`
- Measurements: `ph`, `ec`, `caMgBlank`, `caMgStart`, `caMgEnd`, `caMgDifference`, `caMg`, `na`, `sar`, `co3Hco3`, `rsc`
- Classification (Gujarati): `phResult`, `ecResult`, `sarResult`, `rscResult`
- Classification (English): `phResultEn`, `ecResultEn`, `sarResultEn`, `rscResultEn`
- Water class codes: `ecClass`, `sarClass`, `rscClass`, `waterClass` (combined like "C3S1")
- `classification`, `finalDeduction`
- Farm linkage: `linkedProjectId` (ObjectId → Project, indexed), `linkedAt` — auto-set on PDF generation via `farmReportLinker`.

### Classification Logic (`backend/src/utils/waterClassification.js`)
- pH, EC, SAR, RSC classification ranges
- Water class code generation (C1S1, C3S2, etc.)

### API Endpoints (`backend/src/routes/waterTesting.js`)
Same pattern as soil testing with `/api/water-testing/` prefix. Includes session CRUD (paginated `GET /sessions` with `page`/`limit`/`status` params), sample management, Excel upload, and PDF generation endpoints.

### Frontend
- **Component:** `pages/water-testing/water-testing.ts` — Server-side paginated active/completed session lists; completed sessions lazy-loaded on dropdown open.
- **Service:** `services/water-testing.service.ts` — `getSessions(page, limit, status)` replaces old `getAllSessions()`.
- **Routes:** `/lab-testing/water-testing`, `/lab-testing/water-testing/session/:sessionId`

---

## 7. FEATURE: FERTILIZER TESTING

### Overview
Cross-linked to soil samples. Generates fertilizer recommendations based on soil test results and crop type. Three crop types: normal, small-fruit, large-fruit.

### Workflow (3-State)
`started` → `generate-reports` → `completed`

Managed by `FertilizerSessionStateManager` (`models/fertilizer-session-state.model.ts`)

### Database Models

**FertilizerSession** (`backend/src/models/FertilizerSession.js`)
- Same structure as SoilSession but status: started, generate-reports, completed

**FertilizerSample** (`backend/src/models/FertilizerSample.js`)
- `sessionId` (ObjectId → FertilizerSession, indexed)
- `type` (enum: normal, small-fruit, large-fruit)
- `sampleNumber`, `farmerName`, `farmsName`, `cropName`
- `soilSampleId` (ObjectId → SoilSample — cross-reference)
- NPK values: `nValue`, `pValue`, `kValue`
- Recommendations: `organicManure`, `dap`, `npk`
- Dose schedule: includes `day45` (Urea) and `day45As` (Ammonium Sulphate) as alternative options for day 45; similarly `day75` (Urea) and `day75As` (Ammonium Sulphate) for day 75
- Spray schedules: `spray1Npk`, `spray2Npk`, `spray3Npk` and related fields; hormone dose unit is conditional on hormone name (Projib → grams, others → ml)
- Fruit tree sections: `m1`-`m5` with sub-parameters
- Farm linkage: `linkedProjectId` (ObjectId → Project, indexed), `linkedAt` — auto-set on PDF generation via `farmReportLinker`. Fertilizer samples don't carry `mobileNo` themselves; the linker resolves it via the linked `SoilSample`.

### Fertilizer Crop Config (`backend/src/config/fertilizerCropConfig.js`)
- Loaded once at server startup from `fertilizerCropDefaults.json`
- JSON keyed by cropName, each containing variant entries (`normal`, `small-fruit`, `large-fruit`) with default field values
- Case-insensitive lookup via `getDefaultsForCrop(cropName, type)`
- `getCropNames()` returns sorted list for frontend dropdown
- When soil samples are created/updated with a cropType, the linked fertilizer sample is auto-populated with crop defaults from this config

### API Endpoints (`backend/src/routes/fertilizerTesting.js`)
Same pattern as soil/water testing with `/api/fertilizer-testing/` prefix. Paginated `GET /sessions` with `page`/`limit`/`status` params. Additional endpoints:
- `GET /crop-config` — Returns `{ cropNames, config }` from in-memory crop defaults (used by frontend for cropName dropdown and default previews)
- Excel upload supports `type` parameter for crop type

### Frontend
- **Component:** `pages/fertilizer-testing/fertilizer-testing.ts` — Complex form with multiple sections, spray schedules, fruit tree support, soil sample linking. Server-side paginated active/completed session lists; completed sessions lazy-loaded on dropdown open. Applies crop config defaults to samples on load via `applyCropDefaults()`.
- **Service:** `services/fertilizer-testing.service.ts` — `getSessions(page, limit, status)` replaces old `getAllSessions()`. Caches crop config via `getCropConfig()` (shareReplay). `getDefaultsForCrop(cropName, type)` for client-side lookup. `getCropNamesSnapshot()` for dropdown values.
- **Routes:** `/lab-testing/fertilizer-testing`, `/lab-testing/fertilizer-testing/session/:sessionId`

---

## 8. FEATURE: PROJECT MANAGEMENT (FARM DASHBOARD)

### Overview
Full project lifecycle management for farm consulting projects. Projects have categories (Farm, Landscaping, Gardening), status tracking, team assignment, contacts, milestones, budget tracking, and activity logging.

### Database Model: Project (`backend/src/models/Project.js`)

**Core Fields:**
- `name` (String, required, text-indexed)
- `category` (enum: FARM, LANDSCAPING, GARDENING, required, indexed)
- `status` (enum: Upcoming, Running, Completed, On Hold, Cancelled, pending_approval, approved, rejected, **pending_quotation**, **pending_acceptance**)
- `budget` (Number, required, min: 0), `expenses` (Number, auto-updated)

**Farm Approval Workflow:**
- `submittedBy` (User ref, indexed), `submittedAt` (Date) — set when farm is submitted (self-registration or manager-direct)
- `approvedBy` (User ref), `approvedAt` (Date) — set on approval
- `rejectedReason` (String, max 500) — set on rejection
- `registrationSource` (enum: farmer_self, manager_direct, indexed)
- `activeQuotation` (Quotation ref, indexed) — currently-active quotation surfaced to the farmer; older quotations remain in the Quotation collection with `status='superseded'`
- `quotationAcceptedAt` (Date) — first-time approval timestamp via the quotation flow

**Client Info:**
- `clientId`, `clientName`, `clientEmail`, `clientPhone`, `clientAvatar`, `alternativeContact`

**Location:**
- `address`, `taluka` (indexed), `city`, `district`, `state`, `postalCode`
- `coordinates` (GeoJSON for geospatial queries), `mapUrl`
- Coordinates auto-derived from `mapUrl` on create/update via `backend/src/utils/mapUrlParser.js` when not explicitly set (parses `?q=lat,lng`, `?ll=`, `@lat,lng`, raw "lat,lng"; follows redirects for `maps.app.goo.gl` / `goo.gl` / `g.co` shortlinks via `resolveAndParseLatLng`).

**Land Details:**
- `totalArea`, `areaUnit` (enum: acres, hectares, sqmeters, vigha-16, vigha-24), `cultivableArea`, `soilType`
- `waterSource[]` (legacy), `irrigationSystem` (Bore, Well, Mixed, Canal, River), `terrainType`

**Electricity / Power Supply:**
- `electricity.transformerHp`, `electricity.motorCount`, `electricity.totalMotorHp`

**Project Tags:**
- `needsLandscapingConsultancy` (Boolean, indexed) — orthogonal to category, marks farms also needing landscaping consultancy
- `isOnlineVisit` (Boolean) — when true, on-site visit count tracking is skipped (`visitFrequency` not collected)

**Team:**
- `assignedTo`, `projectManager`, `fieldWorkers[]`, `consultants[]`, `assignedTeam[]` (User refs)

**Contacts:** Array of { fullName, designation, phone, email, role, isPrimary, isActive }

**Milestones:** Array of { name, date, description, isCompleted, completedAt }

**Visit Tracking:** `totalVisitsPlanned`, `totalVisitsCompleted`, `visitFrequency`, `numberOfYears`

**Other:** `crops[]`, `tags[]`, `priority`, `isFavorite[]` (user IDs), `coverImage`, `images[]`

**Farm Media:** `farmMedia[]` of { mediaId, url, mimeType, type (image|video), sizeBytes, status, uploadedBy, uploadedByName, uploadedAt (indexed), attended (Boolean, default false), attendedAt, attendedBy, attendedByName, countsTowardQuota (Boolean, default true), deletedAt, deletedBy } — photos/videos uploaded via Media Service, embedded as references. **Owner, manager, and admin uploads** are all accepted: owner uploads count toward the weekly quota and start unattended; admin/manager uploads bypass the quota (`countsTowardQuota=false`) and land already attended. Owner uploads land in the unattended bucket (shown as thumbnails); admins/farm managers acknowledge them via mark-attended, which moves them into the paginated drawer.

**Landscaping Designs:** `landscapingDesigns[]` of { mediaId, url, mimeType, type (image|video), sizeBytes, title, notes, status, uploadedBy, uploadedByName, uploadedAt (indexed), deletedAt, deletedBy } — manager/admin-only uploads for landscaping projects, stored via Media Service.

**Prescriptions:** `prescriptions[]` of { _id, source (file|manual|structured), docType (image|video|pdf|docx|text|manual|structured), title, notes, textContent, mediaId, url, mimeType, sizeBytes, fileName, structured, attachedImages[], status, uploadedBy, uploadedByName, uploadedAt (indexed) } — manager/admin upload only, owner read-only. Supports uploaded files (image/pdf/doc/docx/text), inline text snippets, prescriptions composed via the in-app manual builder, and the **structured** Shiv Agri standard visit prescription (mirrors the printed slip — farmer name, visit date, lastVisitReview, landPreparation, sowingPlanting, farmingOperations (leveling/marking/digging/soilFilling/tractor/supports/fillGaps/pruning/other), irrigation, weedControl, fertilizers (farmyardManure/chemical/organic/jivamrut/spray), pests (soilBorne/root/stem/leaf/flower/fruit), diseases (soilBorne/stem/branch/leaf/flower/fruit/other), hormoneTreatment, fruitHarvesting, grading, packing, otherNotes — plus `attachedImages[]` of {mediaId,url,mimeType,sizeBytes,fileName} rendered into the PDF). Soft-delete metadata (`deletedAt`, `deletedBy`) on both the subdoc and each `attachedImages[]` entry.

**Lab Reports:** `reports[]` of { sampleType (soil|water|fertilizer, indexed), sampleId (ObjectId, refPath sampleModel, indexed), sampleModel (SoilSample|WaterSample|FertilizerSample), sessionId, sampleNumber, farmerName, farmsName, mobileNo, cropName, fertilizerType, sessionDate, generatedAt (indexed), generatedBy (User ref), generatedByName } — auto-populated on PDF generation by `backend/src/services/farmReportLinker.js` when the sample's `farmsName` + `mobileNo` match this project's `name` + `clientPhone` (case-insensitive name, last-10-digits phone). One entry per (sampleType + sampleId); re-runs update the existing entry rather than duplicating.

**Soft Delete:** `isDeleted`, `deletedAt`, `deletedBy`

**Archive:** `isArchived` (Boolean, indexed, default false), `archivedAt`, `archivedBy` — admin-controlled. Archived projects remain visible but are read-only: uploads are rejected (409) and lifecycle status changes are blocked client-side.

**Virtuals:** `fullLocation`, `budgetRemaining`, `isOverBudget`, `daysToCompletion`, `isOverdue`

**Indexes:** category+status, city, state, taluka, createdBy, budget, text search (name), geospatial (coordinates), date ranges, status+submittedBy, registrationSource+status, needsLandscapingConsultancy

### API Endpoints (`backend/src/routes/projects.js`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/projects` | farm.projects.view OR farms.view | Filtered/paginated list. Filters incl. `district`, `submittedBy=me`, `includeArchived=true` (default hides archived). End-users auto-filtered to own FARM submissions. |
| GET | `/api/projects/farm-names-by-phone` | authenticated | Farm-name suggestions for a phone number (last-10-digits match via farmReportLinker; used by soil/water/fertilizer testing grid datalists). |
| GET | `/api/projects/stats` | farm.projects.view | Statistics |
| GET | `/api/projects/export` | project.export | Export to Excel/CSV |
| GET | `/api/projects/:id` | requireProjectAccess(farm.projects.view, farms.view) | Get single project — gate also lets stakeholders (submitter/client/assigned workers/PM/consultants/team) read |
| POST | `/api/projects` | (role-based) | Create project. End/standard users → `pending_approval` farmer self-registration; managers/admins → `approved` direct registration with phone-based client lookup |
| PATCH | `/api/projects/:id/approve` | farm.projects.approve | Approve a pending farm registration |
| PATCH | `/api/projects/:id/reject` | farm.projects.approve | Reject a pending farm registration (body: `reason`) |
| PATCH | `/api/projects/:id/start` | farm.projects.update | Move approved farm → Running |
| PATCH | `/api/projects/:id/complete` | farm.projects.update | Move running farm → Completed |
| PATCH | `/api/projects/:id/status` | farm.projects.update | Set farm status (approved/Running/Completed/On Hold/Cancelled) |
| PATCH | `/api/projects/:id/request-edit` | (owner or approver) | Re-submits farm to `pending_approval` with edits |
| PATCH | `/api/projects/:id` | project.update | Update project |
| DELETE | `/api/projects/:id` | project.delete | Soft delete |
| DELETE | `/api/projects/:id/hard` | — | Hard delete (admin) |
| PATCH | `/api/projects/:id/archive` | admin | Archive project (sets `isArchived=true`); blocks uploads and lifecycle changes |
| PATCH | `/api/projects/:id/unarchive` | admin | Restore an archived project |
| PATCH | `/api/projects/:id/favorite` | — | Toggle favorite |
| POST | `/api/projects/:id/contacts` | project.update | Add contact |
| PUT | `/api/projects/:id/contacts/:contactId` | project.update | Update contact |
| DELETE | `/api/projects/:id/contacts/:contactId` | project.update | Remove contact |
| GET | `/api/projects/:id/timeline` | farm.projects.view | Timeline + milestones |
| POST | `/api/projects/:id/milestones` | project.update | Add milestone |
| GET | `/api/projects/:id/transactions` | farm.projects.view | Project transactions |
| POST | `/api/projects/:id/transactions` | project.update | Add transaction |
| PATCH | `/api/projects/:id/transactions/:txId` | project.update | Update transaction |
| DELETE | `/api/projects/:id/transactions/:txId` | project.update | Remove transaction |
| GET | `/api/projects/:id/activity` | farm.projects.view | Activity log |
| GET | `/api/projects/:id/media` | requireProjectAccess(farm.projects.view, farms.view) | List **unattended** media (no pagination) plus `attendedTotal` count for the drawer |
| GET | `/api/projects/:id/media/older` | requireProjectAccess(farm.projects.view, farms.view) | Paginated list of **attended** media (page/limit query params; route preserved for back-compat — semantically "attended", not "older") |
| GET | `/api/projects/:id/media/quota` | requireProjectAccess(farm.projects.view, farms.view) | Current week's upload quota snapshot |
| POST | `/api/projects/:id/media` | farm owner OR admin/manager | Upload up to 5 photos/videos (≤25MB each). Owner uploads count toward weekly quota and start unattended. Admin/manager uploads (route gate sets `req.mediaUploadContext.isPrivileged`) bypass the quota (`countsTowardQuota=false`) and land already attended. Rejects 409 if archived. |
| GET | `/api/projects/:id/designs` | farm.projects.view OR farms.view | List landscaping designs |
| POST | `/api/projects/:id/designs` | manager or admin (farm.projects.update) | Upload up to 5 design images/videos (≤25MB each) |
| DELETE | `/api/projects/:id/designs/:designId` | manager or admin | Soft-delete a design (sets `status='DELETED'` + `deletedAt`/`deletedBy`). Admin deletes any; manager deletes own uploads. |
| GET | `/api/projects/:id/prescriptions` | farm.projects.view OR farms.view | List prescriptions (owner read-only) |
| POST | `/api/projects/:id/prescriptions` | manager or admin | Upload up to 5 prescription files (image/pdf/doc/docx/text, ≤25MB each) |
| POST | `/api/projects/:id/prescriptions/text` | manager or admin | Add an inline text-only prescription |
| POST | `/api/projects/:id/prescriptions/manual` | manager or admin | Add a prescription composed via the in-app manual builder |
| POST | `/api/projects/:id/prescriptions/structured` | manager or admin | Submit the Shiv Agri standard visit-prescription form (JSON `structured` payload + up to 5 image attachments, ≤25MB each) |
| GET | `/api/projects/:id/prescriptions/:prescriptionId/pdf` | farm.projects.view OR farms.view | Inline-rendered PDF of a structured prescription (404 for other docTypes) |
| DELETE | `/api/projects/:id/prescriptions/:prescriptionId` | manager or admin | Soft-delete a prescription. Admin deletes any; manager deletes own uploads. |
| GET | `/api/projects/:id/quotations` | requireProjectAccess(farm.projects.view, farms.view) | List quotations for a project (history). Supports `?kind=annual\|bop` filter. |
| GET | `/api/projects/:id/quotations/active` | requireProjectAccess(farm.projects.view, farms.view) | Currently-active quotation (status submitted or accepted) |
| GET | `/api/projects/:id/quotations/:quotationId` | requireProjectAccess(farm.projects.view, farms.view) | Get a specific quotation |
| POST | `/api/projects/:id/quotations` | manager or admin | Submit a quotation (rich-text `content` + `amountPerYear`; supersedes prior submitted quotations and moves project → `pending_acceptance`). Supports `attachInitial=true` to attach a pre-accepted quotation at farm-creation time without farmer notification or status change. |
| POST | `/api/projects/:id/quotations/bop` | manager or admin | Adhoc BOP (Bill of Project) quotation for landscaping projects (`kind='bop'`, `bopItems[]`). Does NOT change project status or supersede annual quotations. |
| PATCH | `/api/projects/:id/quotations/:quotationId/accept` | farm owner only (enforced in service) | Farmer accepts → project moves to `approved` |
| PATCH | `/api/projects/:id/quotations/:quotationId/reject` | farm owner only (enforced in service) | Farmer rejects (optional `reason`) → project reverts to `pending_quotation` |
| PATCH | `/api/projects/:id/quotations/:quotationId/installments/:installmentNumber/mark-paid` | manager or admin | Idempotently marks the installment paid and creates a linked Invoice (`invoiceType='cash'`, `paymentStatus='paid'`). Stamps `installment.invoiceId`/`invoiceNumber`/`paidBy`. |
| PATCH | `/api/projects/:id/quotations/:quotationId/installments/:installmentNumber/revert` | admin only | Reverts an installment to pending and soft-deletes the linked invoice. |
| GET | `/api/projects/:id/quotations/:quotationId/pdf` | requireProjectAccess(farm.projects.view, farms.view) | Quotation rendered on the company letterhead (uses the letter template + installment table) |
| GET | `/api/projects/:id/admin-transactions` | admin only | List manual transactions for the farm (page/limit/sortBy/sortOrder/type/category/startDate/endDate) |
| GET | `/api/projects/:id/admin-transactions/summary` | admin only | Totals + count summary |
| POST | `/api/projects/:id/admin-transactions` | admin only | Record a manual debit/credit (description + amount required) |
| PATCH | `/api/projects/:id/admin-transactions/:transactionId` | admin only | Update a manual transaction |
| DELETE | `/api/projects/:id/admin-transactions/:transactionId` | admin only | Soft-delete a manual transaction |
| GET | `/api/projects/:id/reports` | requireProjectAccess(farm.projects.view, farms.view) | List soil/water/fertilizer reports auto-linked to this farm (newest first) |
| GET | `/api/projects/:id/reports/:reportId/pdf` | requireProjectAccess(farm.projects.view, farms.view) | Inline PDF for the in-app overlay viewer |
| GET | `/api/projects/:id/reports/:reportId/pdf/download` | requireProjectAccess(farm.projects.view, farms.view) | Attachment-disposition PDF for explicit download |
| PATCH | `/api/projects/:id/media/attend-all` | admin or farm.projects.approve | Bulk-mark every unattended media item as attended (uses arrayFilters) |
| PATCH | `/api/projects/:id/media/:mediaId/attend` | admin or farm.projects.approve | Mark a single media item as attended |
| DELETE | `/api/projects/:id/media/:mediaId` | admin / manager / farm owner | Soft-delete a media item (sets `farmMedia.$.status='DELETED'` + `deletedAt`/`deletedBy`). Admin deletes any (refunds quota if `countsTowardQuota=true` and uploaded in current ISO week); manager deletes own uploads (same refund rule); owner deletes own UNATTENDED uploads (NO quota refund). |
| PATCH | `/api/projects/bulk` | project.update | Bulk update |
| POST | `/api/projects/bulk-delete` | project.delete | Bulk soft delete |

**Query Filters:** category, projectType, status, city, district, state, budget range, date range, team, search text, favorites, submittedBy

### Farm Registration & Approval Workflow

- **Farmer self-registration:** End-users (`end_user`/`user` role) submit via `POST /api/projects` → status `pending_quotation` (was `pending_approval`), `registrationSource=farmer_self`, clientId/clientPhone auto-populated from the user's profile. Notifies users with `farm.projects.approve` (type `farm_quotation_required`).
- **Manager-direct registration:** Managers/admins POST a farm → `ProjectService.resolveOrCreateFarmer({ rawPhone, email, name })` resolves the client by normalized phone first, then by email (attaching the phone if the email-user has no phone), and finally **auto-provisions a brand-new `role: user` farmer** (`phoneVerified=false`) with the canonical `<cc><national>` normalized key so the farmer's first phone-OTP or Google login claims this same account. Conflicts (different phone on same email, or duplicate phone/email) are rejected. Status becomes `approved` immediately with `registrationSource=manager_direct`.
- **Approval/Rejection (legacy):** `approveProject` and `rejectProject` archive open `farm_registration` notifications and notify the submitter (`farm_approved` / `farm_rejected`). Used only for the legacy `pending_approval` path (e.g. edit requests on already-approved farms).
- **Edit requests:** `requestProjectEdit` lets owners (submitter or linked client) or approvers update a farm. If the farm was already approved (`approved`/`Running`/`Completed`/`On Hold`), it resets to `pending_approval` (legacy flow). Otherwise it resets to `pending_quotation` so the manager re-quotes.

### Quotations Workflow (`backend/src/models/Quotation.js`, `controllers/quotationController.js`, `services/quotationService.js`)

- **Model:** `Quotation` = { project (ref, indexed), kind (enum: annual/bop, default 'annual', indexed), title (String, ≤200, used for BOP), content (rich-text HTML, required), contentText (plain-text fallback ≤1000 chars), amountPerYear (≥0), bopItems[] ({description, quantity, rate, total} — empty for annual; sum populates `amountPerYear` on BOP), installments[] (4 quarterly installments auto-derived in a `pre('validate')` hook **for `kind='annual'` only** — BOP variants skip installment auto-build; each has installmentNumber 1-4, amount, dueDate, status (pending/paid/overdue), paidAt, paidAmount, invoiceId (Invoice ref), invoiceNumber, paidBy (User ref)), startDate (Date, default now), status (submitted/accepted/rejected/superseded, indexed), submittedBy/submittedByName, acceptedBy/acceptedAt, rejectedBy/rejectedAt/rejectedReason (≤500), timestamps }. Compound index: `project+status+createdAt`.
- **Submit:** `createQuotation` — farm-only; rejects if the project is already approved. Marks any prior `submitted` quotation as `superseded`, creates the new doc, sets `project.status='pending_acceptance'` + `project.activeQuotation=quotation._id`, archives pending farm_registration / farm_quotation_required notifications, and notifies the farmer (`farm_quotation_received`, metadata: farmName, quotationId). **Attach-on-create flow:** when `payload.attachInitial=true` (used during manager-direct farm registration on an already-approved project), the quotation is created with `status='accepted'`, no farmer notification is fired, and the project status is not changed.
- **Accept:** `acceptQuotation` — only the farm owner (matched against `submittedBy` or `clientId`) may accept. Moves project to `approved` (sets `approvedBy/approvedAt/quotationAcceptedAt`) and notifies approvers with `farm_quotation_accepted`.
- **Reject:** `rejectQuotation` — owner-only. Records optional `rejectedReason` (≤500), reverts project to `pending_quotation`, clears `activeQuotation`, and notifies approvers with `farm_quotation_required` ("Quotation revision requested") including the rejection reason.
- **BOP creation:** `createBopQuotation` — landscaping-only (gated by `isLandscapingProject` helper checking category/projectType/needsLandscapingConsultancy). Stores `kind='bop'`, `title`, and `bopItems[]`; sums item totals into `amountPerYear`. Does NOT touch project status and does NOT supersede annual quotations.
- **Mark installment paid:** `markInstallmentPaid` — idempotent (returns the pre-existing invoice if `installment.invoiceId` already set). Creates an Invoice via `Invoice.getNextInvoiceNumber()` with `invoiceType='cash'`, `paymentStatus='paid'`, a line item describing the installment, full project location (address→`referenceNumber`, city→`location`, taluka→`village`+`taluka`, district, state, pincode) and `sourceQuotationId`/`sourceInstallmentNumber` back-links. Stamps the installment with `invoiceId`/`invoiceNumber`/`paidBy`.
- **Revert installment payment:** `revertInstallmentPayment` — admin only. Resets installment fields to pending/null and soft-deletes the linked invoice.
- **PDF:** `pdfGenerator.generateQuotationPDF(quotation, project)` composes a letter-body (greeting, scope HTML, INR-formatted annual fee, installment table) inside the existing letterhead template (`templates/letter.html`). Filename: `Quotation_<farmName>_<date>.pdf`.

### Farm Media Upload (`backend/src/controllers/farmMediaController.js`, `services/farmMediaService.js`)

- **Flow:** Controller checks the project is not archived → if the caller is privileged (`req.mediaUploadContext.isPrivileged`, set by the route gate for manager/admin) the quota is bypassed entirely; otherwise calls `reserveQuota(projectId, files.length)` to atomically debit the weekly counter → forwards each file to Media Service (initiate `POST /api/v1/media` then complete `PUT /:id/upload`) → embeds reference on `Project.farmMedia[]` (privileged uploads stamped `countsTowardQuota=false` and `attended=true`; owner uploads stamped `countsTowardQuota=true` and `attended=false`) → on partial failure, owner uploads call `releaseQuota(projectId, failures.length)` to refund the unused reservation (skipped for privileged uploads) → notifies all project **stakeholders** (owner + assigned workers/PM/consultants/team, excluding the uploader) via `notifyOnUpload` with type `farm_media_upload`.
- **Designs (`farmDesignController.js` / `farmDesignService.js`):** Manager/admin-only flow. Validates image/video MIME, uploads to Media Service, embeds on `Project.landscapingDesigns[]`, and notifies stakeholders with type `farm_design_upload` (carries `documentType` + `itemCount` in metadata).
- **Prescriptions (`farmPrescriptionController.js` / `farmPrescriptionService.js`):** Manager/admin-only flow with four entry points: file upload (image/pdf/doc/docx/text via Media Service), inline text (`/text`), manual builder (`/manual`), and the **structured visit form** (`/structured` — JSON `structured` payload + optional image attachments uploaded via Media Service into `attachedImages[]`; pre-generates the subdoc `_id` so the response reliably surfaces it). Embeds on `Project.prescriptions[]` and notifies stakeholders with type `farm_prescription_upload`. Structured prescriptions can additionally be rendered to PDF via `GET /:id/prescriptions/:prescriptionId/pdf` (uses `pdfGenerator.generatePrescriptionPDF` against `templates/prescription.html`).
- **Attended workflow:** New owner uploads start unattended (admin/manager uploads start attended). `markAttended` (single, via `$elemMatch` + positional `$`) and `markAllAttended` (bulk, via `arrayFilters`) flip `attended=true` and stamp `attendedAt/attendedBy/attendedByName`. The default `GET /:id/media` returns only unattended items plus an `attendedTotal` count; the attended drawer is loaded on demand via `GET /:id/media/older`. `deleteMedia` soft-deletes by setting `status='DELETED'` + `deletedAt`/`deletedBy`; three deletion modes: admin (any item, refund eligible), manager (own uploads, refund eligible), owner (own UNATTENDED uploads, never refunds). Quota refunds only apply when caller is admin/manager AND item was `countsTowardQuota=true` AND uploaded in the current ISO week. Designs and prescriptions follow the same admin-any / manager-own soft-delete policy.
- **Limits:** ≤5 files/request, ≤25MB/file (multer memory storage), `image/*` or `video/*` only. Quota: `FARM_MEDIA_WEEKLY_LIMIT` (default 10) uploads per project per ISO week.
- **Quota model (`backend/src/models/FarmMediaQuota.js`):** `{ projectId, isoWeek ("YYYY-Www"), uploadCount, lastUploadAt }`. The service treats the row as project-scoped: `getCurrentQuotaRecord` rolls a stale row forward when the ISO week changes (resets `uploadCount` to 0 in-place via aggregation pipeline). `reserveQuota` is the atomic debit (conditional `findOneAndUpdate` requiring `uploadCount ≤ WEEKLY_LIMIT - count`); `releaseQuota` refunds for failed uploads (clamped at 0). Resets at start of next ISO week (Monday 00:00 UTC).
- **Response headers:** `X-Media-Quota-Used`, `X-Media-Quota-Limit`, `X-Media-Quota-Resets-At` set on every media response.
- **Status codes:** 201 all uploaded, 207 partial, 429 quota exceeded, 415 unsupported type, 502 media-service failure.
- **Env:** `MEDIA_SERVICE_URL` (internal, default `http://localhost:8081`), `MEDIA_SERVICE_PUBLIC_URL` (browser-facing prefix for `contentUrl`).

### Frontend
- **Component:** `pages/farm-dashboard/farm-dashboard.ts` — Project listing, activity tracking, budget/expense dashboard
- **Component:** `pages/project-details/project-details.ts` — Full project view
- **Component:** `pages/farm-management/farm-management.ts` — Farm list with approval/management actions (replaces farm-dashboard for /farm-management route). Toolbar exposes a "Landscaping" filter toggle (`showLandscapingOnly`) that client-side filters to farms with `needsLandscapingConsultancy === true`; matching cards render a "Landscaping" project tag next to the status pill.
- **Component:** `pages/farm-registration/farm-registration.ts` — Farmer self-registration page wrapper
- **Component:** `pages/farm-project-details/farm-project-details.ts` — Detail view with approve/reject/start/complete actions; tabbed UI (Details / Media / Designs (landscaping only) / Prescriptions / Reports / Transactions (admin-only)). The Reports tab lists auto-linked soil/water/fertilizer lab reports (filter chips by type, inline PDF overlay via iframe + blob URL, attachment download). Auto-opens on `?tab=reports`. The Transactions tab lists, creates, edits, and deletes admin-only manual debit/credit entries with an income/expense/net summary card. Media tab splits into an **Unattended** grid (with per-tile "Mark attended" + admin-only delete, plus a "Mark all as attended" header action) and a collapsible **Attended photos** drawer (lazily fetched via `listAttendedMedia`, paginated, page size 12). The Media upload UI is hidden from non-owners; managers/admins instead see Designs (landscaping projects) and Prescriptions upload panels (file upload + inline text + manual builder). Admins also see an Archive/Restore button on the project (uses `confirmationModalService`); archived projects render an "Archived" tag and disable upload/lifecycle controls. Auto-opens the Media tab when navigated with `?tab=media` (e.g. from a `farm_media_upload`, `farm_design_upload`, or `farm_prescription_upload` notification). Embeds `<app-farm-weather>` (Open-Meteo) when farm coordinates are present.
- **Component:** `components/farm-registration-form/farm-registration-form.ts` — Reusable farm registration form (used by registration page and edit flows). Captures taluka, electricity (transformer HP, motor count, total motor HP), `needsLandscapingConsultancy` and `isOnlineVisit` flags, and offers a "Use current location" button that captures browser geolocation into `mapUrl` + `coordinates`. Replaces the old water-source pill picker; irrigation source is now required. In **manager mode**, phone lookup either resolves an existing farmer (name/email become read-only) OR — on a 404 — switches into "new farmer" mode where name (required) and email (optional) become editable so backend `resolveOrCreateFarmer` can auto-provision the account on submit.
- **Component:** `components/farm-weather/farm-weather.ts` — Standalone weather card driven by `[latitude]`/`[longitude]`/`[locationLabel]` inputs. Calls Open-Meteo (`api.open-meteo.com/v1/forecast`) directly with `past_days=30`, `forecast_days=7`; shows current conditions, 30-day rainfall total + rainy-day count, and a 7-day forecast strip. WMO code → label/icon maps inline.
- **Service:** `services/farm-management.service.ts` — `getFarms()`, `registerFarm()`, `approveFarm()`, `rejectFarm()`, `startFarm()`, `completeFarm()`, `updateFarmStatus()`, `requestFarmEdit()`, `archiveFarm()`, `unarchiveFarm()`, `getFarmById()`, `lookupUserByPhone()`. `FarmProject` exposes `submittedBy`/`clientId`/`createdBy` for client-side ownership checks plus `isArchived`/`archivedAt`, and now also `category` / `projectType` (so the UI can gate Designs visibility to landscaping projects).
- **Service:** `services/farm-media.service.ts` — `listMedia()` (unattended + `attendedTotal`), `listAttendedMedia(page, limit)`, `markAttended(mediaId)`, `markAllAttended()`, `deleteMedia(mediaId)`, `getQuota()`, `uploadFiles()` (returns `progress`/`done` events via `HttpEventType`).
- **Service:** `services/farm-design.service.ts` — `listDesigns(projectId)`, `uploadDesigns(projectId, files)` (progress/done events) for landscaping design uploads.
- **Service:** `services/farm-prescription.service.ts` — `listPrescriptions(projectId)`, `uploadPrescriptions(projectId, files)`, `addTextPrescription(projectId, payload)`, `addManualPrescription(projectId, payload)`, `addStructuredPrescription(projectId, payload, images)` (returns progress/done events for the structured visit form), `downloadPrescriptionPdf(projectId, prescriptionId)` → Blob.
- **Service:** `services/quotation.service.ts` — `list(projectId, { kind? })`, `getActive(projectId)`, `getById(projectId, quotationId)`, `submit(projectId, payload)` (supports `attachInitial`), `createBopQuotation(projectId, payload)`, `accept(projectId, quotationId)`, `reject(projectId, quotationId, reason?)`, `markInstallmentPaid(projectId, quotationId, installmentNumber)`, `revertInstallmentPayment(projectId, quotationId, installmentNumber)`, `downloadPdf(projectId, quotationId)` → Blob. Exposes `Quotation`, `QuotationInstallment`, `QuotationPayload`, `QuotationStatus`, BOP types.
- **Service:** `services/farm-admin-transaction.service.ts` — `list(projectId, page, limit)`, `getSummary(projectId)`, `create(projectId, payload)`, `update(projectId, txId, payload)`, `delete(projectId, txId)` for admin-only farm transactions.
- **Service:** `services/farm-report.service.ts` — `listReports(projectId)`, `viewReportPdf(projectId, reportId)` (inline blob), `downloadReportPdf(projectId, reportId)` (attachment blob), `triggerBrowserDownload(blob, filename)` for the auto-linked lab reports tab.
- **Route:** `/farm-dashboard` (authGuard), `/project-details/:id`, `/farm-management` (authGuard), `/farm-management/new` (authGuard), `/farm-management/project/:id` (authGuard)

---

## 9. FEATURE: TRANSACTIONS & BUDGET

### Overview
Track debits and credits against projects. Auto-updates project expenses. Supports category breakdown and summary aggregation.

### Database Model: Transaction (`backend/src/models/Transaction.js`)

- `projectId` (ObjectId → Project, required, indexed)
- `description` (String, required, max 500)
- `amount` (Number, required, min: 0)
- `type` (enum: debit, credit, required, indexed)
- `category` (String, indexed)
- `date` (Date, required, indexed)
- `notes` (String, max 1000)
- `createdBy`, `lastUpdatedBy` (User refs)
- Soft delete: `isDeleted`, `deletedAt`, `deletedBy`

**Virtuals:** `formattedAmount` (INR currency), `transactionType` ('Expense'/'Income')

**Auto-update:** Save/delete hooks recalculate parent Project's `expenses` field

**Static Methods:** `getByProject()`, `countByProject()`, `getSummaryByProject()`, `getCategoryBreakdown()`, `deleteByProject()`

### API Endpoints (`backend/src/routes/transactions.js`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/transactions/summary` | farm.projects.view | Project summary (totals) |
| GET | `/api/transactions/categories` | farm.projects.view | Category breakdown |
| GET | `/api/transactions` | farm.projects.view | Filtered/paginated list |
| POST | `/api/transactions` | project.update | Create transaction |
| GET | `/api/transactions/:id` | farm.projects.view | Get single |
| PATCH | `/api/transactions/:id` | project.update | Update |
| DELETE | `/api/transactions/:id` | project.update | Soft delete |

### Admin-Only Manual Farm Transactions (`backend/src/controllers/farmTransactionController.js`)

- Per-farm admin-recorded debits/credits exposed under `/api/projects/:id/admin-transactions` (mounted in `routes/projects.js`). Wraps `TransactionService` with the project id taken from the URL path so each route is naturally scoped to one farm.
- Gated by a strict `requireAdmin` middleware in `routes/projects.js` (admins only — even managers are excluded). Reuses the same `Transaction` model as section 9, so entries flow through the same `expenses` auto-update hooks.
- Validates `type ∈ {debit, credit}` and non-negative numeric `amount`; returns 404 if the project does not exist.

---

## 10. FEATURE: MANAGERIAL WORK - RECEIPTS

### Overview
Track payments received from farmers/clients with auto-incrementing receipt numbers (RCP-XXXX).

### Database Model: Receipt (`backend/src/models/Receipt.js`)

- `receiptNumber` (String, unique, indexed — auto-generated RCP-XXXX)
- `date` (Date, indexed), `customerName` (String, indexed)
- `customerAddress`, `amount`, `amountInWords`
- `paymentMethod` (enum: cheque, bank_transfer, cash)
- `chequeNumber`, `bankName`
- `paymentType` (enum: full_payment, part_payment, advance_payment)
- `billReference`, `billDate`, `remarks`
- `pdfUrl`, `pdfGeneratedAt`
- `createdBy`, `updatedBy` (User refs)
- `version`, `originalReceiptId`
- Soft delete: `isDeleted`, `deletedAt`, `deletedBy`

### API Endpoints (`backend/src/routes/managerialWork.js`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/managerial-work/receipts` | managerial.receipts.view | List receipts |
| GET | `/api/managerial-work/receipts/next-number` | managerial.receipts.create | Next receipt number |
| GET | `/api/managerial-work/receipts/:id` | managerial.receipts.view | Get receipt |
| POST | `/api/managerial-work/receipts` | managerial.receipts.create | Create receipt |
| PUT | `/api/managerial-work/receipts/:id` | managerial.receipts.update | Update receipt |
| PUT | `/api/managerial-work/receipts/:id/pdf` | managerial.receipts.update | Update PDF ref |
| DELETE | `/api/managerial-work/receipts/:id` | managerial.receipts.delete | Soft delete |

### Frontend
- **Component:** `pages/managerial-work/receipts/receipts.ts` — CRUD, filters (date range, payment method, amount), PDF generation
- **Route:** `/managerial-work/receipts`

---

## 11. FEATURE: MANAGERIAL WORK - INVOICES

### Overview
Create invoices with line items, track payment status, link to receipts, support bilingual descriptions (Gujarati/English). Auto-incrementing numbers (INV-XXXX).

### Database Model: Invoice (`backend/src/models/Invoice.js`)

- `invoiceNumber` (String, unique, indexed — auto-generated INV-XXXX)
- `invoiceType` (enum: cash, debit_memo)
- `date`, `customerName`, `referenceNumber`, `location`, `village`, `taluka`, `district`, `state`, `pincode`, `phoneNumber`, `mobileNumber`
- `items[]` — { serialNumber, description, descriptionGujarati, rate, quantity, total }
- `subtotal`, `taxAmount`, `discount`, `grandTotal`, `grandTotalInWords`
- `paymentStatus` (enum: unpaid, partial, paid), `paidAmount`
- `linkedReceipts[]` (Receipt refs)
- `sourceQuotationId` (Quotation ref, indexed), `sourceInstallmentNumber` (1-4) — soft back-link to the quotation/installment that auto-generated this invoice (nullable for manual invoices; used by the admin revert flow)
- `consultantName`, `consultantCredentials`
- `pdfUrl`, `pdfGeneratedAt`, `remarks`
- `isDraft`, soft delete fields, version tracking

**Methods:** `calculateTotals()`, `updatePaymentStatus()`, `softDelete()`
**Static:** `getNextInvoiceNumber()`, `getServiceOptions()` (7 pre-defined service items)

### API Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/managerial-work/invoices` | managerial.invoices.view | List invoices |
| GET | `/api/managerial-work/invoices/next-number` | managerial.invoices.create | Next number |
| GET | `/api/managerial-work/invoices/service-options` | managerial.invoices.view | Service templates |
| GET | `/api/managerial-work/invoices/:id` | managerial.invoices.view | Get invoice |
| POST | `/api/managerial-work/invoices` | managerial.invoices.create | Create |
| PUT | `/api/managerial-work/invoices/:id` | managerial.invoices.update | Update |
| PUT | `/api/managerial-work/invoices/:id/payment` | managerial.invoices.update | Update payment |
| PUT | `/api/managerial-work/invoices/:id/pdf` | managerial.invoices.update | Update PDF ref |
| POST | `/api/managerial-work/invoices/:id/duplicate` | managerial.invoices.create | Duplicate |
| DELETE | `/api/managerial-work/invoices/:id` | managerial.invoices.delete | Soft delete |

### Frontend
- **Component:** `pages/managerial-work/invoices/invoices.ts` — CRUD, line items, payment tracking, PDF generation
- **Route:** `/managerial-work/invoices`

---

## 12. FEATURE: MANAGERIAL WORK - LETTERS

### Overview
Create service list letters or general letters with rich text content, tags, and PDF generation. Auto-incrementing numbers (LTR-XXXX). Includes a 13-point service list template.

### Database Model: Letter (`backend/src/models/Letter.js`)

- `letterNumber` (String, unique, sparse)
- `date`, `letterType` (enum: service_list, general, custom)
- `subject`, `recipientName`, `recipientAddress`
- `content` (HTML rich text), `contentPlainText` (auto-generated)
- `tags[]`
- Company info: `companyName`, `consultantName`, `consultantCredentials`, `consultantTitle`, `contactPhone`, `contactEmail`, `companyAddress`
- `pdfUrl`, `pdfGeneratedAt`, `isDraft`
- Soft delete, version tracking

### API Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/managerial-work/letters` | managerial.letters.view | List letters |
| GET | `/api/managerial-work/letters/next-number` | managerial.letters.create | Next number |
| GET | `/api/managerial-work/letters/template/service-list` | managerial.letters.view | Service list template |
| GET | `/api/managerial-work/letters/tags` | managerial.letters.view | All unique tags |
| GET | `/api/managerial-work/letters/:id` | managerial.letters.view | Get letter |
| POST | `/api/managerial-work/letters` | managerial.letters.create | Create |
| PUT | `/api/managerial-work/letters/:id` | managerial.letters.update | Update |
| PUT | `/api/managerial-work/letters/:id/pdf` | managerial.letters.update | Update PDF ref |
| DELETE | `/api/managerial-work/letters/:id` | managerial.letters.delete | Soft delete |

### Frontend
- **Component:** `pages/managerial-work/letters/letters.ts` — CRUD, rich text editor, tags, templates, PDF
- **Route:** `/managerial-work/letters`

---

## 13. FEATURE: USER MANAGEMENT & RBAC

### Overview
Admin can manage users, create custom roles with granular permissions, and assign roles. System roles (admin, user, assistant) are protected from deletion.

### Database Models

**User** (`backend/src/models/User.js`)
- `name` (default `'New User'`), `email` (optional — sparse unique, lowercase), `googleId` (unique, sparse)
- `phoneVerified` (boolean, set true after successful OTP verify), `phoneVerifiedAt` (Date)
- `profilePhoto`, `role` (enum: admin, user, end_user, assistant, lab_technician, manager)
- `roleRef` (ObjectId → Role — RBAC), `refreshToken` (SHA-256 hash of opaque backend refresh token), `refreshTokenExpiresAt` (Date), `googleRefreshToken`
- `lastLogin`, `metadata` (department, designation, phoneCountryCode, phoneNumber, phoneNumberNormalized — normalized digits-only key `<cc><national>`; sparse-unique-indexed so phone is a 1-1 identity)
- Methods: `toClientJSON()`, `hasPermission(name)`
- Static: `findByRole(role)`

**Role** (`backend/src/models/Role.js`)
- `name` (unique, snake_case), `displayName`, `description`
- `permissions[]` (ObjectId refs → Permission)
- `isSystem` (boolean — system roles can't be deleted), `isActive`
- `metadata` (color, icon, priority)
- Methods: `hasPermission()`, `addPermission()`, `removePermission()`
- Static: `findActive()`, `findByName()`, `findSystemRoles()`, `findCustomRoles()`

**Permission** (`backend/src/models/Permission.js`)
- `name` (unique — format: resource.action), `resource`, `action`
- `description`, `isActive`
- `metadata.category` (enum: user-management, testing, projects, billing, files, reports, system, other)
- Static: `findByResource()`, `findByAction()`, `findByNames()`

### API Endpoints

**User Management (`backend/src/routes/users.js`):**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/users` | users.view | Paginated user list |
| GET | `/api/users/lookup/by-phone` | users.view | Lookup user by `phone` query (matches normalized + raw phone variants) |
| GET | `/api/users/:id` | users.view | Get user |
| PUT | `/api/users/:userId/role` | users.assign-role | Change role |
| DELETE | `/api/users/:userId` | users.delete | Delete user |

**Role Management (`backend/src/routes/roles.js`):**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/roles/permissions` | permissions.view | All permissions |
| GET | `/api/roles` | roles.view | All roles |
| GET | `/api/roles/:id` | roles.view | Role by ID/name |
| POST | `/api/roles` | roles.create | Create role |
| PUT | `/api/roles/:id` | roles.update | Update role |
| DELETE | `/api/roles/:id` | roles.delete | Delete role |
| POST | `/api/roles/assign/:userId` | users.assign-role | Assign role |

### Frontend
- **Component:** `pages/admin/user-management/user-management.component.ts` — User list, search, role assignment, deletion
- **Component:** `pages/admin/role-management/role-management.component.ts` — Role CRUD, permission assignment
- **Routes:** `/admin/users` (authGuard)

---

## 14. FEATURE: PDF GENERATION

### Overview
Server-side PDF generation using Puppeteer (Chromium) for HTML-to-PDF conversion. Supports individual, bulk (base64 JSON), streaming (multipart), and combined (single PDF) modes. Gujarati font support (Noto Sans Gujarati).

### Backend Service (`backend/src/services/pdfGenerator.js`)

**Methods:**
- `generateSoilPDF(sample)` — Single soil report
- `generateWaterPDF(sample)` — Water testing report
- `generateFertilizerPDF(sample)` — Fertilizer recommendation
- `generateReceiptPDF(receipt)` — Receipt document
- `generateInvoicePDF(invoice)` — Invoice document
- `generateLetterPDF(letter)` — Letter document
- `generatePrescriptionPDF(prescription, project)` — Structured visit prescription (renders `templates/prescription.html` with the checkbox-grid form + attached images)
- `generateQuotationPDF(quotation, project)` — Quotation rendered into the company letterhead (`templates/letter.html`) with INR-formatted annual fee + 4-row installment table
- `generateBulkPDFs(samples)` — Multiple PDFs as array
- `generateBulkPDFsStream(samples, type)` — Async generator for streaming
- `generateCombinedPDF(samples)` — Single PDF with all samples
- `_buildDay45Row(data, formatNumber)` — Conditional day 45 row: shows Urea, Ammonium Sulphate, or both
- `_buildDay75Row(data, formatNumber)` — Conditional day 75 row: shows Urea, Ammonium Sulphate, or both
- `_buildHormoneDoseWithUnit(hormoneName, hormoneDose, formatNumber)` — Returns dose with unit based on hormone name (પ્રોજીબ → ગ્રામ/પંપ દીઠ, others → મિલી/પંપ દીઠ)

**Number Formatting:** `formatNumber` defaults to 2 decimal places but displays integers without decimals for cleaner output.

**Browser resilience:** `initBrowser` verifies liveness on the cached Puppeteer instance (`connected`/`isConnected`) and relaunches if disconnected; it also registers a `'disconnected'` handler that nulls the cache. `_withFreshBrowser(renderFn)` is a helper that retries a single-PDF render once when the cached browser is dead (detects "Connection closed" / "Protocol error" / "Target closed" / "Session closed"). `generateInvoicePDF` is wrapped through `_withFreshBrowser`. The invoice template (`templates/invoice.html`) now binds `{{taluka}}`, `{{district}}`, `{{state}}`, `{{pincode}}` for the full Indian-style address block rendered by quotation-installment invoices.

### API Endpoints (`backend/src/routes/pdfGeneration.js`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pdf/sample/:sampleId` | Soil sample PDF |
| GET | `/api/pdf/sample/:sampleId/preview` | PDF preview (inline) |
| POST | `/api/pdf/session/:sessionId/bulk` | Bulk PDFs (base64 JSON) |
| POST | `/api/pdf/session/:sessionId/stream` | Stream PDFs (multipart) |
| POST | `/api/pdf/session/:sessionId/combined` | Combined PDF |
| POST | `/api/pdf/samples/multiple` | Multiple sample PDFs |
| POST | `/api/pdf/receipt/:receiptId` | Receipt PDF |
| POST | `/api/pdf/invoice/:invoiceId` | Invoice PDF |
| POST | `/api/pdf/letter/:letterId` | Letter PDF |

Water and fertilizer testing have equivalent PDF endpoints under their respective route files.

**Farm linkage on PDF generation:** Soil, water, and fertilizer single-sample PDF endpoints (`POST /api/pdf/sample/:sampleId`, the water/fertilizer equivalents) invoke `backend/src/services/farmReportLinker.js` (`linkSampleToFarm`) before sending the PDF. The linker is best-effort (errors are swallowed): it matches `farmsName` + `mobileNo` against `Project.name` + `Project.clientPhone` (case-insensitive name, last-10-digits phone with implicit +91), stamps `linkedProjectId`/`linkedAt` on the sample, and idempotently upserts an entry into `Project.reports[]`. Soil PDF route now requires `authenticate` middleware so `req.user` can be recorded as `generatedBy`/`generatedByName`.

### Frontend Service (`services/pdf.service.ts`)

Handles download, preview, streaming with progress tracking. Key features:
- Multipart response streaming with `DownloadProgressService` integration
- Base64-to-blob conversion for bulk downloads
- Staggered downloads to prevent browser blocking
- Header extraction (x-farmer-name, x-sample-number) for filenames

---

## 15. FEATURE: MEDIA SERVICE

### Overview
Dedicated Spring Boot microservice for media upload, storage, and retrieval. Uses a two-step upload flow (initiate → complete) with status tracking.

### Technology
- Spring Boot 3.2.5, Java 17, MongoDB, Maven
- Port: 8081
- Storage: `FileSystemStorageService` is the default (no Spring profile required); root dir from `MEDIA_STORAGE_FILESYSTEM_ROOT_DIR` (prod default `/var/media/uploads`, local dev default `/Users/mahirratanpara/uploads`)
- Max file: 25MB (multipart max-request-size 30MB)
- Allowed types: images (jpeg, png, webp, gif), videos (mp4, quicktime/mov, webm), documents (pdf, doc, docx), text (plain, markdown)

### Data Model: MediaDocument

- `storageKey`, `originalName`, `mimeType`, `sizeBytes`
- `checksumSha256`, `altText`, `tags[]`
- `storageBackend`, `status` (UPLOADING, ACTIVE, FAILED, DELETED)
- `statusHistory[]`, `contentUrl`, `uploadedBy`
- Index: status + createdAt (descending)

### API Endpoints (`/api/v1/media`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/media` | Initiate upload (returns uploadToken) |
| PUT | `/api/v1/media/{id}/upload` | Complete upload (multipart file) |
| GET | `/api/v1/media/{id}/content` | Get file content (7-day cache) |
| GET | `/api/v1/media/{id}` | Get metadata |
| PATCH | `/api/v1/media/{id}/status` | Update status |
| POST | `/api/v1/media/batch-resolve` | Batch status check |
| DELETE | `/api/v1/media/{id}` | Delete media |

### Nginx Integration
- Proxied via `/api/v1/media` location block
- 25MB max body size
- X-Accel-Redirect for efficient internal file serving

### Scheduled Media Cleanup (`backend/src/services/mediaCleanupService.js`)
- Background sweep started from `server.js` via `mediaCleanupService.startScheduled()`.
- Permanently purges soft-deleted subdocs (`farmMedia`, `landscapingDesigns`, `prescriptions`, and prescription `attachedImages[]`) once their `deletedAt` is older than `MEDIA_PURGE_RETENTION_DAYS` (default 30).
- For each purged item, best-effort `DELETE /api/v1/media/:id` against the media service to remove the underlying file (failures logged, not thrown).
- Cursor-iterates candidate projects (any array carrying `status='DELETED'`), then `$pull`s expired subdocs in one update per project.
- Initial sweep 60s after boot, then every `MEDIA_PURGE_INTERVAL_MS` (default 24h). Handle is `.unref()`'d so it doesn't block shutdown.

---

## 16. FEATURE: ACTIVITY LOGGING

### Overview
Audit trail for all project-related actions. Tracks who did what, when, with before/after change snapshots.

### Database Model: ActivityLog (`backend/src/models/ActivityLog.js`)

- `projectId` (ObjectId, indexed), `userId` (ObjectId, indexed)
- `userName`, `userAvatar` (denormalized for display)
- `actionType` (enum: created, updated, deleted, visit_recorded, expense_added, payment_received, document_uploaded, comment_posted, team_member_assigned/removed, contact_added/updated/removed, milestone_added/completed, status_changed, budget_updated, cover_photo_changed, other)
- `description` (required), `metadata` (flexible object)
- `changes` ({ before, after } — for update tracking)
- `ipAddress`, `userAgent`, `timestamp` (indexed)

**Static Methods:**
- `logActivity(projectId, userId, actionType, description, metadata)`
- `getProjectActivity(projectId, options)` — Paginated
- `getProjectActivityCount(projectId, actionType)`
- `getRecentActivities(userId, limit)`

---

## 17. FEATURE: DRAFTS & PROJECT WIZARD

### Overview
Multi-step project creation wizard with draft auto-save. Users can save incomplete projects and resume later.

### Database Model: Draft (`backend/src/models/Draft.js`)

- `projectId` (ObjectId → Project, indexed)
- `wizardStep` (Number, 1-6)
- `draftData` (Mixed — any form data)
- `createdBy` (User ref)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/drafts/list` | Get user's drafts |
| GET | `/api/projects/drafts/:id` | Get draft by ID |
| POST | `/api/projects/drafts` | Save as draft |
| PUT | `/api/projects/drafts/:id` | Update draft |
| POST | `/api/projects/drafts/:id/complete` | Convert draft → project |

### Frontend
- **Component:** `pages/project-wizard/project-wizard.ts` — Multi-step form wizard
- **Routes:** `/projects/new` (authGuard), `/projects/edit/:id` (authGuard)

---

## 18. FRONTEND: ROUTING & NAVIGATION

### Route Map (`frontend/src/app/app.routes.ts`)

| Path | Component | Guard | Notes |
|------|-----------|-------|-------|
| `` | → `/home` | — | Root redirect |
| `home` | HomeComponent | — | Landing page |
| `login` | LoginComponent | — | Google OAuth + (when enabled) phone+WhatsApp OTP tab |
| `complete-profile` | CompleteProfileComponent | authGuard | Forces signed-in users with no email/phone to add one before app routes unlock |
| `lab-testing` | LabTestingComponent | authGuard + profileCompleteGuard | Parent container |
| `lab-testing/soil-testing` | SoilTestingComponent | — | Child route |
| `lab-testing/soil-testing/session/:sessionId` | SoilTestingComponent | — | Session view |
| `lab-testing/water-testing` | WaterTestingComponent | — | Child route |
| `lab-testing/water-testing/session/:sessionId` | WaterTestingComponent | — | Session view |
| `lab-testing/fertilizer-testing` | FertilizerTestingComponent | — | Child route |
| `lab-testing/fertilizer-testing/session/:sessionId` | FertilizerTestingComponent | — | Session view |
| `managerial-work` | ManagerialWorkComponent | authGuard + profileCompleteGuard | Parent container |
| `managerial-work/receipts` | ReceiptsComponent | — | Child route |
| `managerial-work/invoices` | InvoicesComponent | — | Child route |
| `managerial-work/letters` | LettersComponent | — | Child route |
| `farm-dashboard` | FarmDashboardComponent | authGuard + profileCompleteGuard | Project management |
| `farm-management` | FarmManagementComponent | authGuard + profileCompleteGuard | Farms list with approval workflow |
| `farm-management/new` | FarmRegistrationPageComponent | authGuard + profileCompleteGuard | Farmer self-registration |
| `farm-management/project/:id` | FarmProjectDetailsComponent | authGuard + profileCompleteGuard | Farm detail with approve/reject/start/complete |
| `projects/new` | ProjectWizardComponent | authGuard + profileCompleteGuard | Create project |
| `projects/edit/:id` | ProjectWizardComponent | authGuard + profileCompleteGuard | Edit project |
| `project-details/:id` | ProjectDetailsComponent | — | View project |
| `admin/users` | UserManagementComponent | authGuard + profileCompleteGuard | User management |
| `my-account` | MyAccountComponent | authGuard + profileCompleteGuard | Account settings (phone-attach via OTP) |
| `contact` | ContactComponent | — | Contact page |
| `404` | NotFoundComponent | — | Error page |
| `**` | → `/404` | — | Catch-all |

**Public pages (no auth):** home, about, events, causes, blog, shop, team, gallery, testimonials, donation, contact

---

## 19. FRONTEND: SHARED COMPONENTS

| Component | Location | Purpose |
|-----------|----------|---------|
| HeaderComponent | `components/header/` | Navigation, auth display, permission-based menu items, logout. Embeds NotificationBell when authenticated; Farms link routes to `/farm-management`. |
| NotificationBellComponent | `components/header/notification-bell/` | Header bell with unread count, dropdown list, mark-read & archive actions |
| FarmRegistrationFormComponent | `components/farm-registration-form/` | Reusable farm registration form (location incl. taluka + map URL with "Use current location", land details, electricity, project tags, crops, contact) |
| FarmWeatherComponent | `components/farm-weather/` | Open-Meteo weather card: current conditions + 7-day forecast + 30-day rainfall summary, driven by lat/lng inputs |
| FooterComponent | `components/footer/` | Company info, links, social media |
| ToastComponent | `components/toast/` | Notification display, auto-dismiss |
| ConfirmationModalComponent | `components/confirmation-modal/` | Reusable confirm/cancel dialog |
| DownloadProgressComponent | `components/download-progress/` | Bulk download progress bar |
| DashboardOverviewComponent | `components/dashboard-overview/` | Dashboard stats and metrics |
| ProjectListComponent | `components/project-list/` | Project cards for home page |
| ProjectDetailPopupComponent | `components/project-detail-popup/` | Modal for project details |
| RoleSelectionModalComponent | `components/role-selection-modal/` | Role picker during first login |
| DatalistCellEditor | `components/ag-grid-editors/datalist-cell-editor.ts` | AG Grid cell editor using `<input list>` + `<datalist>` for searchable dropdown with free-text fallback (used for cropName in soil testing) |

---

## 20. FRONTEND: SERVICES REFERENCE

| Service | File | Key Methods |
|---------|------|-------------|
| AuthService | `auth.service.ts` | googleLoginWithCode(), requestPhoneOtp(), verifyPhoneOtp(), requestProfilePhoneOtp(), verifyProfilePhoneOtp(), setProfilePhone(), setProfileEmail(), loadAuthConfig() (cached), getCurrentUser(), refreshToken(), logout(), updateProfile({phoneCountryCode, phoneNumber}), isProfileIncomplete(), currentUser$ BehaviorSubject, otpLoginEnabled Signal |
| FarmManagementService | `farm-management.service.ts` | getFarms(), registerFarm(), approveFarm(), rejectFarm(), startFarm(), completeFarm(), updateFarmStatus(), requestFarmEdit(), archiveFarm(), unarchiveFarm(), getFarmById(), lookupUserByPhone(); FarmProject exposes category / projectType / activeQuotation / quotationAcceptedAt; FarmStatus union extended with `pending_quotation` and `pending_acceptance` |
| FarmMediaService | `farm-media.service.ts` | listMedia(projectId) → unattended + attendedTotal, listAttendedMedia(projectId, page, limit), markAttended(projectId, mediaId), markAllAttended(projectId), deleteMedia(projectId, mediaId), getQuota(projectId), uploadFiles(projectId, files) → progress/done events |
| FarmDesignService | `farm-design.service.ts` | listDesigns(projectId), uploadDesigns(projectId, files) → progress/done events |
| FarmPrescriptionService | `farm-prescription.service.ts` | listPrescriptions(projectId), uploadPrescriptions(projectId, files), addTextPrescription(projectId, payload), addManualPrescription(projectId, payload), addStructuredPrescription(projectId, payload, images) → progress/done events, downloadPrescriptionPdf(projectId, prescriptionId) → Blob |
| QuotationService | `quotation.service.ts` | list(projectId), getActive(projectId), getById(projectId, quotationId), submit(projectId, payload), accept(projectId, quotationId), reject(projectId, quotationId, reason?), downloadPdf(projectId, quotationId) → Blob |
| FarmAdminTransactionService | `farm-admin-transaction.service.ts` | list(projectId, page, limit), getSummary(projectId), create(projectId, payload), update(projectId, txId, payload), delete(projectId, txId) — admin-only manual farm transactions |
| FarmReportService | `farm-report.service.ts` | listReports(projectId), viewReportPdf(projectId, reportId) → Blob (inline), downloadReportPdf(projectId, reportId) → Blob (attachment), triggerBrowserDownload(blob, filename) — auto-linked lab reports |
| NotificationService | `notification.service.ts` | getNotifications() → {notifications, unreadCount}, markRead(id), archive(id) |
| UserService | `user.service.ts` | getAllUsers(), getUser(), updateUserRole(), deleteUser() |
| PermissionService | `permission.service.ts` | hasPermission(), hasRole(), hasAnyPermission(), getAllRoles(), createRole(), assignRoleToUser() |
| SoilTestingService | `soil-testing.service.ts` | getSessions(page, limit, status), getSession(id), sample CRUD, bulkUpdateSamples(), uploadExcel(), getSoilDataForSample() |
| WaterTestingService | `water-testing.service.ts` | getSessions(page, limit, status), getSession(id), sample CRUD, bulkUpdateSamples(), uploadExcel() |
| FertilizerTestingService | `fertilizer-testing.service.ts` | getSessions(page, limit, status), getSession(id), sample CRUD, bulkUpdateSamples(), uploadExcel() with type, getCropConfig(), getDefaultsForCrop(), getCropNamesSnapshot() |
| ManagerialWorkService | `managerial-work.service.ts` | Receipt/Invoice/Letter CRUD, getNextNumber(), getServiceOptions(), numberToWords() |
| PdfService | `pdf.service.ts` | generateSinglePDF(), downloadBulkPDFs(), streamBulkSessionPDFs(), previewPDF() — for soil/water/fertilizer/receipt/invoice/letter |
| DashboardService | `dashboard.service.ts` | Dashboard metrics and analytics |
| ToastService | `toast.service.ts` | success(), error(), info(), warning(), clear() |
| ConfirmationModalService | `confirmation-modal.service.ts` | confirm(config) → Promise<boolean> |
| DownloadProgressService | `download-progress.service.ts` | start(), update(), complete(), error(), progress$ Observable |

---

## 21. FRONTEND: GUARDS, INTERCEPTORS & DIRECTIVES

### Auth Guard (`guards/auth.guard.ts`)
- `CanActivateFn` — checks `authService.isAuthenticated()`
- Stores attempted URL for redirect after login
- Redirects to `/login` if not authenticated

### Profile Complete Guard (`guards/profile-complete.guard.ts`)
- `CanActivateFn` — runs after authGuard on all gated app routes
- Redirects authenticated users with `isProfileIncomplete()` to `/complete-profile` and saves the attempted URL in `localStorage.redirectUrl`
- Must NOT be applied to `/complete-profile` itself (would loop)

### Auth Interceptor (`interceptors/auth.interceptor.ts`)
- Adds `Authorization: Bearer <token>` and `withCredentials: true` to non-public-auth requests so the refresh-token cookie travels with them
- Skips token attachment ONLY for public auth endpoints: `/auth/google`, `/auth/google-code`, `/auth/refresh`, `/auth/otp/`. Authenticated `/auth/me`, `/auth/logout`, `/auth/profile/...` still receive the Bearer token.
- Proactive token refresh if expiring within 5 minutes
- Retries failed requests with new token on 401
- Skips third-party requests (e.g. Open-Meteo) — only attaches auth headers/credentials to relative URLs, the configured `environment.apiUrl` origin, or the current window origin

### Error Interceptor (`interceptors/error.interceptor.ts`)
- Maps HTTP status codes (400-504) to user-friendly toast messages
- Skips certain URLs to avoid duplicate toasts (/auth/refresh, /auth/google)

### Directives
- **HasPermissionDirective** (`has-permission.directive.ts`) — `*hasPermission="'permission.name'"` structural directive
- **HasRoleDirective** (`has-role.directive.ts`) — `*hasRole="'admin'"` structural directive

---

## 22. FRONTEND: STATE MANAGEMENT

**Pattern:** RxJS BehaviorSubjects + Services (no NgRx/Akita)

| State | Location | Type |
|-------|----------|------|
| Current User | AuthService.currentUser$ | BehaviorSubject<User\|null> |
| Is Authenticated | AuthService.isAuthenticated | Signal<boolean> |
| User Permissions | PermissionService.userPermissions$ | Observable<string[]> |
| Toasts | ToastService.toasts | BehaviorSubject<Toast[]> |
| Confirmation Modal | ConfirmationModalService.showModal$ | BehaviorSubject<boolean> |
| Download Progress | DownloadProgressService.progress$ | BehaviorSubject<DownloadProgress> |
| Session State | SessionStateManager class | State Pattern (in-component) |

**Data Flow:** Component → Service → HttpClient → Observable → Component subscription → Template rendering

---

## 23. FRONTEND: STYLING & THEME

### Theme Colors (from `src/assets/css/custom.css`)
| Role | Color | Hex |
|------|-------|-----|
| Background | White | #fff |
| Content Text | Gray | #555555 |
| Header | Dark Green | #1b5e20 |
| Header 2 | Medium Green | #33691e |
| Footer | Dark Gray | #222222 |
| Primary | Green | #66bb6a |
| Secondary | Dark Green | #33691e |

### Typography
- **Body:** Roboto, 16px
- **Headers:** Poppins, 40px
- **Input/Textarea:** Roboto, 16px

### CSS Libraries
- Bootstrap (CDN) — Grid, forms, components
- Font Awesome — Icons
- Owl Carousel — Carousel widgets
- Slick — Image sliders
- AG Grid Alpine theme — Data tables

### jQuery Plugins (loaded via angular.json scripts)
- jquery-3.3.1.min.js, popper.min.js, bootstrap.min.js
- isotope.pkgd.min.js, owl.carousel.min.js, jquery.prettyPhoto.js, slick.min.js

### Global Styles Order (angular.json)
1. `src/styles.css` (AG Grid)
2. `src/assets/css/bootstrap.min.css`
3. `src/assets/css/all.min.css` (Font Awesome)
4. `src/assets/css/slick.css`
5. `src/assets/css/responsive.css`
6. `src/assets/css/color.css`
7. `src/assets/css/custom.css`

### Build Budgets
- Initial bundle: 2MB warning, 5MB error
- Component styles: 150kB max

---

## 24. DATABASE: COMPLETE SCHEMA REFERENCE

### Collections Summary

| Collection | Model File | Key Indexes |
|-----------|------------|-------------|
| users | User.js | email (unique+sparse), role, createdAt, metadata.phoneNumberNormalized (unique+sparse) |
| roles | Role.js | name (unique), isActive |
| permissions | Permission.js | name (unique), resource, action |
| projects | Project.js | category+status, city, state, taluka, createdBy, text(name), 2dsphere(coordinates), status+submittedBy, registrationSource+status, needsLandscapingConsultancy, activeQuotation |
| quotations | Quotation.js | project, status, kind, project+status+createdAt — farm consultancy quotations; `kind='annual'` auto-derives 4 quarterly installments (each carrying `invoiceId`/`invoiceNumber`/`paidBy`), `kind='bop'` (landscaping Bill of Project) skips installment auto-build and stores `bopItems[]` |
| transactions | Transaction.js | projectId+date, projectId+type, projectId+category |
| soilsessions | SoilSession.js | date, (date+version unique) |
| soilsamples | SoilSample.js | sessionId, sessionDate |
| watersessions | WaterSession.js | date, (date+version unique) |
| watersamples | WaterSample.js | sessionId, sessionDate |
| fertilizersessions | FertilizerSession.js | date, (date+version unique) |
| fertilizersamples | FertilizerSample.js | sessionId, sessionDate |
| receipts | Receipt.js | receiptNumber (unique), date, customerName |
| invoices | Invoice.js | invoiceNumber (unique), date, sourceQuotationId — also stores taluka/district/state/pincode for the full address block |
| letters | Letter.js | letterNumber (unique sparse), date |
| activitylogs | ActivityLog.js | projectId+timestamp, userId+timestamp |
| notifications | Notification.js | user, type (incl. `farm_media_upload`, `farm_design_upload`, `farm_prescription_upload`, `farm_quotation_required`, `farm_quotation_received`, `farm_quotation_accepted`), project, isRead, archivedAt, user+isRead+createdAt, user+archivedAt+createdAt; metadata adds `documentType`/`itemCount` (design/prescription uploads) and `quotationId`/`amountPerYear` (quotation events) |
| drafts | Draft.js | projectId, createdBy |
| media | MediaDocument.java | status+createdAt |
| farmmediaquotas | FarmMediaQuota.js | projectId, (projectId+isoWeek unique) — per-week upload counters for farm media |

### Cross-Collection Relationships

```
User ─── roleRef ──→ Role ──── permissions[] ──→ Permission
User ←── user ── Notification
Project ←── project ── Notification
Project ←── project ── Quotation
Project ── activeQuotation ──→ Quotation
User ←── submittedBy/approvedBy ── Project
User ←── createdBy ── Project
User ←── createdBy ── Transaction
Project ←── projectId ── Transaction
Project ←── projectId ── ActivityLog
Project ←── projectId ── Draft
SoilSession ←── sessionId ── SoilSample
WaterSession ←── sessionId ── WaterSample
FertilizerSession ←── sessionId ── FertilizerSample
SoilSample ←── soilSampleId ── FertilizerSample
SoilSample ── fertilizerSampleId ──→ FertilizerSample
Project ←── linkedProjectId ── SoilSample / WaterSample / FertilizerSample
Project ── reports[].sampleId ──→ SoilSample / WaterSample / FertilizerSample (refPath sampleModel)
Invoice ── linkedReceipts[] ──→ Receipt
Quotation ── installments[].invoiceId ──→ Invoice
Invoice ── sourceQuotationId ──→ Quotation
```

---

## 25. API: COMPLETE ENDPOINT REFERENCE

### Base URL
- Development: `http://localhost:3000/api`
- Production: `https://shivagri.com/api`

### Auth Endpoints (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/config` | No | Returns `{ googleLoginEnabled, otpLoginEnabled }` so the login UI knows which methods to show |
| POST | `/google` | No | Google OAuth ID token login (matches by googleId OR email; issues backend refresh-token cookie) |
| POST | `/google-code` | No | Google OAuth auth code login (matches by googleId OR email; issues backend refresh-token cookie) |
| POST | `/refresh` | No (uses cookie) | Reads opaque refresh-token cookie, rotates it, mints new access token. Legacy fallback validates via Google refresh token and upgrades to new scheme. |
| POST | `/otp/request` | No (requireOtpEnabled) | Send a 4-digit WhatsApp OTP to `{ phoneCountryCode, phoneNumber }` (rate-limited: 60s cooldown, 3/hour) |
| POST | `/otp/verify` | No (requireOtpEnabled) | Verify `{ phoneCountryCode, phoneNumber, otp }`; auto-creates a `role: user` farmer when phone is unknown; issues session |
| POST | `/logout` | Yes | Logout & revoke refresh + Google tokens, clear cookie |
| GET | `/me` | Yes | Get current user |
| PATCH | `/profile` | Yes (admin only) | Direct phone change — non-admins receive 403 |
| POST | `/profile/phone/request-otp` | Yes (requireOtpEnabled) | Send OTP to ATTACH a phone to the signed-in account (only when no phone set) |
| POST | `/profile/phone/verify-otp` | Yes (requireOtpEnabled) | Verify OTP and attach phone; sets `phoneVerified=true` |
| POST | `/profile/phone` | Yes | Manual phone attach (no OTP) — used only when OTP login is disabled |
| POST | `/profile/email` | Yes | Attach an email when none exists |

### Notification Endpoints (`/api/notifications`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Yes | List active (non-archived) notifications + unreadCount |
| PATCH | `/:id/read` | Yes | Mark notification read |
| DELETE | `/:id` | Yes | Archive notification |

### Standard Response Format
```json
// Success
{ "success": true, "data": { ... }, "message": "..." }

// Error
{ "success": false, "error": "...", "details": [...] }

// Paginated
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 156, "totalPages": 8 } }
```

*For full endpoint details by feature, see Sections 5-17 above.*

---

## 26. DEVOPS: DOCKER & CONTAINERIZATION

### Development (`docker-compose.yml`)

| Service | Image/Build | Port | Key Config |
|---------|-------------|------|------------|
| mongodb | mongo:7.0 | 27017 (internal) | Health check, volume persistence |
| api | ./backend | 3000 (internal) | Hot-reload via volume mount, depends on mongodb |
| media-service | ./media-service | 8081 (internal) | Filesystem storage, depends on mongodb |
| notification-service | ./notification-service | 8082 (also published as 8082 in dev) | Stateless WhatsApp + Gmail sender; API-key auth |
| frontend | ./frontend | 80 (internal) | Angular SPA via Nginx |
| nginx | ./nginx | 80 (public) | Reverse proxy, depends on api+frontend |

### Production (`docker-compose.prod.yml`)

| Service | Image | Port | Key Config |
|---------|-------|------|------------|
| api | ${DOCKERHUB_USERNAME}/shiv-agri-api:latest | 3000 | Production env vars from .env |
| media-service | ${DOCKERHUB_USERNAME}/shiv-agri-media:latest | 8081 | Filesystem at /var/media/uploads |
| notification-service | ${DOCKERHUB_USERNAME}/shiv-agri-notification:latest | 8082 | WhatsApp + Gmail; OTP channel routing (`OTP_CHANNEL=whatsapp\|sms`); MSG91 SMS fallback |
| frontend | ${DOCKERHUB_USERNAME}/shiv-agri-frontend:latest | 80 | Pre-built Angular assets |
| nginx | ${DOCKERHUB_USERNAME}/shiv-agri-nginx:latest | 80, 443 | SSL via Certbot, auto-reload every 6h |
| certbot | certbot/certbot | — | Auto-renewal every 12h |

### Dockerfiles

**Backend** (`backend/Dockerfile`) — Node.js 20 Alpine, multi-stage. Installs Chromium + Gujarati fonts for Puppeteer PDF generation. Non-root user. Health check: `/health`.

**Frontend** (`frontend/Dockerfile`) — Node.js 20 Alpine build stage → Nginx Alpine production. `npm run build --configuration=production`. SPA routing (try_files → /index.html).

**Media Service** (`media-service/Dockerfile`) — Temurin JDK 17 build → JRE 17 production. Maven build, non-root user. Health check: `/actuator/health`.

**Nginx** (`nginx/Dockerfile`) — Nginx Alpine with custom config, certbot challenge directory.

### Nginx Config (`nginx/nginx.conf`)

- **Rate limiting:** 10 req/s per IP, burst 20
- **Gzip:** Enabled for text, CSS, JSON, JS
- **SSL:** TLSv1.2/1.3, Let's Encrypt certs
- **Routing:** `/api/v1/media` → media-service:8081, `/api/notifications` → notification-service:8082 (30m body for email attachments), `/api` → api:3000, `/` → frontend:80
- **Media:** X-Accel-Redirect for internal file serving, 25MB max body
- **HTTP → HTTPS** redirect (301)

---

## 27. DEVOPS: CI/CD PIPELINES

### GitHub Actions Workflows (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy-api.yml` | Push to main (backend/**) | Build & deploy backend API |
| `deploy-frontend.yml` | Push to main (frontend/**) | Build & deploy frontend |
| `deploy-nginx.yml` | Push to main (nginx/**) | Build & deploy nginx |
| `deploy-media.yml` | Push to main (media-service/**) | Build & deploy media service |
| `deploy-notification.yml` | Push to main (notification-service/**) | Build & deploy notification service (calls reusable `deploy-service.yml`) |
| `deploy-service.yml` | Reusable | Generic build→push→deploy workflow |
| `deploy-permissions.yml` | Reusable / manual | Sync permissions.yml to DB |
| `sync-docker-compose.yml` | Push to main (docker-compose.prod.yml) | Upload compose file to VPS |
| `sync-and-restart.yml` | Manual only | Upload compose + restart services |

### Deployment Flow (deploy-service.yml)

1. Checkout code
2. Setup Docker Buildx
3. Login to Docker Hub
4. Build & push image (tagged: `main-<sha>`, `latest`)
5. SSH to VPS (`/var/www/shiv-agri`)
6. Pull latest image
7. `docker compose up -d --no-deps <service>`
8. Cleanup old images

### GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| DOCKERHUB_USERNAME | Docker Hub login |
| DOCKERHUB_TOKEN | Docker Hub access token |
| SERVER_HOST | VPS IP address |
| SERVER_USER | SSH user (root) |
| SERVER_SSH_KEY | Ed25519 private key |

---

## 28. DEVOPS: INFRASTRUCTURE & DEPLOYMENT

### Git Hooks (`.githooks/`)

- **pre-commit:** Automatically updates `context.md` via Claude CLI to reflect staged changes. Skip with `SKIP_CONTEXT_UPDATE=1 git commit` or `git commit --no-verify`.
- **setup.sh:** Run once after cloning to activate hooks: `./githooks/setup.sh` (sets `core.hooksPath` to `.githooks/`)

### VPS Setup (`scripts/vps-setup.sh`)

Automated script for fresh Hostinger VPS:
1. System update & essential packages
2. Docker & Docker Compose installation
3. UFW firewall (SSH:22, HTTP:80, HTTPS:443)
4. Directory structure (`/var/www/shiv-agri`, `/backups/shivagri`)
5. Docker Hub login
6. .env file creation (chmod 600)
7. Backup cron job (daily 2 AM)

### SSL Setup (`scripts/init-letsencrypt.sh`)

- Domain: shivagri.com, www.shivagri.com
- RSA 4096
- Certbot via Docker with auto-renewal

### MongoDB Init (`mongodb/init-mongo.js`)

- Creates app user with readWrite role
- Uses env vars: MONGO_INITDB_DATABASE, MONGO_APP_USER, MONGO_APP_PASSWORD
- Runs only on first container start

### Kubernetes (Alternative — `infra/`)

Available but not primary deployment:
- `namespace.yaml` — `shiv-agri` namespace
- `mongodb-deployment.yaml` — 1 replica, 5Gi PVC
- `backend-deployment.yaml` — 2 replicas, liveness/readiness probes
- `frontend-deployment.yaml` — 2 replicas, LoadBalancer service

### Backups (`scripts/backup-mongodb.sh`)

- Daily mongodump with gzip compression
- 7-day retention
- Stored at `/backups/shivagri/`
- Optional: rclone remote upload, Telegram notifications (commented out)

---

## 29. DEVOPS: MONITORING & MAINTENANCE

### Health Checks
- Backend: `GET /health` (30s interval, 10s timeout)
- Media Service: `GET /actuator/health` (30s interval, 10s timeout)
- Frontend: `wget /` (30s interval, 3s timeout)
- MongoDB: `mongosh --eval "db.runCommand('ping')"` (30s interval)

### Container Management
```bash
docker compose -f docker-compose.prod.yml ps          # Status
docker compose -f docker-compose.prod.yml logs -f api  # Logs
docker compose -f docker-compose.prod.yml restart api  # Restart
docker stats                                            # Resource usage
docker system df                                        # Disk usage
docker system prune -a -f                               # Cleanup
```

### Log Locations
- Backend: Winston logger (console + file for errors)
- Nginx: Standard access/error logs
- MongoDB: Container stdout

---

## 30. ENVIRONMENT VARIABLES

### Backend (.env.example)
| Variable | Default | Purpose |
|----------|---------|---------|
| PORT | 3000 | API server port |
| MONGODB_URI | mongodb://localhost:27017/shiv-agri | Database connection |
| NODE_ENV | development | Environment mode |
| JWT_SECRET | — | JWT signing secret (32+ chars) |
| JWT_EXPIRES_IN | 24h | Access token expiry |
| REFRESH_TOKEN_TTL_DAYS | 60 | Lifetime of the opaque backend refresh token (Google + OTP) |
| GOOGLE_CLIENT_ID | — | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | — | Google OAuth client secret |
| ALLOWED_ORIGINS | http://localhost:4200 | CORS origins (comma-separated) |
| OTP_LOGIN_ENABLED | true | Master switch — when false, phone OTP routes return 403 and the login UI hides the phone tab |
| OTP_DELIVERY_MODE | template | `template` / `hello_world` / `console` (forced to `template` when NODE_ENV=production) |
| OTP_BRAND_NAME | Shiv-Agri | Brand string used in free-text OTP fallback |
| NOTIFICATION_SERVICE_URL | http://notification-service:8082 | Where backend reaches the notification microservice |
| NOTIFICATION_API_KEY | — | Must match the value set on notification-service (`X-API-Key`) |
| WHATSAPP_OTP_TEMPLATE_NAME / _LANGUAGE / _HAS_BUTTON | otp_login / en / true | WhatsApp template wiring for OTP |
| DEFAULT_PHONE_COUNTRY_CODE | +91 | Default country code for phone parsing/lookup |
| DEFAULT_PHONE_SIGNUP_ROLE | user | Role granted to phone-OTP first-time signups |
| MEDIA_PURGE_RETENTION_DAYS | 30 | Days after soft-delete before media subdocs are permanently purged |
| MEDIA_PURGE_INTERVAL_MS | 86400000 (24h) | Interval for the scheduled media-purge sweep |

### Production (.env — on VPS)
| Variable | Purpose |
|----------|---------|
| DOCKERHUB_USERNAME | Docker Hub image registry |
| MONGO_ROOT_USER/PASSWORD | MongoDB root credentials |
| MONGO_DB/USER/PASSWORD | App database credentials |
| MONGODB_URI | Full connection string with auth |
| JWT_SECRET | Production JWT secret (strong) |
| GOOGLE_CLIENT_ID/SECRET | Google OAuth credentials |
| GOOGLE_CALLBACK_URL | OAuth callback URL |
| ALLOWED_ORIGINS | Production CORS origins |
| DOMAIN | Primary domain |
| SMTP_HOST/PORT/USER/PASSWORD | Email (optional) |
| WHATSAPP_API_KEY/PHONE_ID | WhatsApp (optional) |
| NOTIFICATION_API_KEY | Shared secret between backend and notification-service |
| WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN / WHATSAPP_API_VERSION | WhatsApp Cloud API credentials on notification-service |
| OTP_CHANNEL | `whatsapp` or `sms` (MSG91) — notification-service routing |
| MSG91_AUTH_KEY / MSG91_TEMPLATE_ID / MSG91_SENDER_ID / MSG91_OTP_VARIABLE | MSG91 SMS configuration (used when OTP_CHANNEL=sms) |
| GMAIL_FROM_ADDRESS / GMAIL_FROM_NAME / GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET / GMAIL_OAUTH_REFRESH_TOKEN | Gmail OAuth2 sender on notification-service |
| AWS_ACCESS_KEY_ID/SECRET/REGION/BUCKET | S3 storage (optional) |
| BACKUP_ENABLED/RETENTION_DAYS/TIME | Backup config |
| RATE_LIMIT_WINDOW_MS/MAX_REQUESTS | Rate limiting |

### Frontend Environments
**Development** (`environment.ts`):
```typescript
{ production: false, apiUrl: 'http://localhost:3000/api', googleClientId: '965745303258-...' }
```

**Production** (`environment.prod.ts`):
```typescript
{ production: true, apiUrl: 'https://shivagri.com/api', googleClientId: '965745303258-...' }
```

---

## 31. FEATURE: NOTIFICATION SERVICE

### Overview
Stateless Spring Boot 3.2.5 / Java 17 microservice that sends WhatsApp messages (WhatsApp Cloud API) and Gmail emails (OAuth2 + SMTP) on behalf of the platform. Also fronts OTP delivery so the backend doesn't talk to provider APIs directly.

- **Port:** 8082
- **Storage:** none (purely stateless — no database)
- **Auth:** static `X-API-Key` header (see `security/ApiKeyAuthFilter.java`), value `NOTIFICATION_API_KEY`
- **Container:** `shivagri-notification` (dev: `shivagri-notification-dev`)
- **Image:** `${DOCKERHUB_USERNAME}/shiv-agri-notification`
- **CI:** `.github/workflows/deploy-notification.yml`

### Architecture

```
backend (Node)  →  notificationClient.js  →  notification-service (Spring Boot, 8082)
                                              ├── WhatsAppService → Meta Graph API
                                              ├── SmsService      → MSG91 (when OTP_CHANNEL=sms)
                                              ├── EmailService    → Gmail SMTP (OAuth2 token via GmailOAuthTokenService)
                                              └── OtpDispatchService routes /otp to either WhatsApp or SMS based on OTP_CHANNEL
```

All endpoints accept `?async=true` to return `202 Accepted` and process on the `notification-async` executor (see `config/AsyncConfig.java`).

### API Endpoints (`/api/notifications`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/whatsapp/text` | Send WhatsApp text (≤ 4096 chars) |
| POST | `/whatsapp/media` | Send WhatsApp image/video/audio/document by public URL |
| POST | `/whatsapp/template` | Send approved WhatsApp template (required for OTPs / unsolicited messages) |
| POST | `/email` | Send plain or HTML email (JSON, no attachments) |
| POST | `/email/with-attachments` | Send email with attachments (multipart/form-data) |
| POST | `/otp` | Channel-agnostic OTP send — routes WhatsApp template vs MSG91 SMS via `OTP_CHANNEL` |
| GET | `/actuator/health` | Health probe (unauthenticated) |

Nginx exposes the prefix at `/api/notifications` (30MB body for attachments); the backend uses `services/notificationClient.js` for all internal calls.

### Config (env-only, 12-factor)

- **Required:** `NOTIFICATION_API_KEY`
- **WhatsApp:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION` (default `v21.0`), `WHATSAPP_DEFAULT_COUNTRY_CODE` (default `91`)
- **OTP routing:** `OTP_CHANNEL` (`whatsapp` | `sms`), `WHATSAPP_OTP_TEMPLATE_NAME/_LANGUAGE/_HAS_BUTTON`
- **MSG91 SMS:** `MSG91_AUTH_KEY`, `MSG91_BASE_URL`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER_ID`, `MSG91_OTP_VARIABLE`, `MSG91_DEFAULT_COUNTRY_CODE`
- **Gmail OAuth:** `GMAIL_FROM_ADDRESS`, `GMAIL_FROM_NAME`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`

### Source Layout
- `controller/` — `EmailController`, `WhatsAppController`, `OtpController` + DTOs in `controller/dto/`
- `service/` — `EmailService`, `WhatsAppService`, `SmsService`, `OtpDispatchService`, `GmailOAuthTokenService`
- `config/` — typed `*Properties` classes (Async/Email/Msg91/Otp/Security/WhatsApp), `RestTemplateConfig`
- `security/ApiKeyAuthFilter.java` — rejects unauthenticated requests at the filter chain
- `exception/` — `GlobalExceptionHandler`, `NotificationException`, `ProviderException`
- See `notification-service/README.md` for the full operator guide.
