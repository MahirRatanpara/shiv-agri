# Shiv-Agri Application Context

> **Purpose:** Single source of truth for LLM context. Each section is self-contained so an LLM can read only the relevant section for a given task. Organized by feature domain for efficient chunking.

> **Last Updated:** 2026-03-21

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

---

## 1. ARCHITECTURE OVERVIEW

### High-Level Architecture

```
Internet (HTTPS)
    ↓
Nginx Reverse Proxy (Port 443/80)
    ├── Frontend (Angular 20 SPA, port 80)
    ├── Backend API (Node.js/Express, port 3000)
    └── Media Service (Spring Boot, port 8081)
            ↓
    MongoDB Database (Port 27017)
```

### System Design

- **Frontend:** Angular 20.3.0 standalone components SPA served via Nginx
- **Backend API:** Node.js/Express RESTful API with Puppeteer for PDF generation
- **Media Service:** Spring Boot 3.2.5 (Java 17) microservice for file uploads/storage
- **Database:** MongoDB 7.0 with Mongoose ODM
- **Reverse Proxy:** Nginx with SSL termination, rate limiting, gzip compression
- **Auth:** Google OAuth 2.0 + JWT tokens (24h expiry)
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
│   └── src/
│       ├── config/database.js
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── projectController.js
│       │   ├── userController.js
│       │   ├── roleController.js
│       │   ├── transactionController.js
│       │   ├── receiptController.js
│       │   ├── invoiceController.js
│       │   └── letterController.js
│       ├── middleware/auth.js
│       ├── models/
│       │   ├── User.js, Role.js, Permission.js
│       │   ├── Project.js, Transaction.js
│       │   ├── SoilSession.js, SoilSample.js
│       │   ├── WaterSession.js, WaterSample.js
│       │   ├── FertilizerSession.js, FertilizerSample.js
│       │   ├── Receipt.js, Invoice.js, Letter.js
│       │   ├── ActivityLog.js, Draft.js
│       ├── routes/
│       │   ├── api.js (main router)
│       │   ├── auth.js, users.js, roles.js
│       │   ├── projects.js, transactions.js
│       │   ├── soilTesting.js, waterTesting.js, fertilizerTesting.js
│       │   ├── managerialWork.js, pdfGeneration.js
│       ├── services/
│       │   ├── projectService.js, transactionService.js
│       │   ├── pdfGenerator.js, draftService.js, activityLogService.js
│       ├── utils/
│       │   ├── jwt.js, logger.js
│       │   ├── soilClassification.js, waterClassification.js
│       ├── scripts/migrate-permissions.js
│       └── server.js
├── frontend/src/app/
│   ├── app.ts, app.routes.ts, app.config.ts
│   ├── components/
│   │   ├── header/, footer/, toast/, confirmation-modal/
│   │   ├── download-progress/, dashboard-overview/
│   │   ├── project-list/, project-detail-popup/, role-selection-modal/
│   ├── pages/
│   │   ├── home/, login/, not-found/, my-account/, contact/
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
│   ├── guards/auth.guard.ts
│   ├── interceptors/auth.interceptor.ts, error.interceptor.ts
│   ├── directives/has-permission.directive.ts, has-role.directive.ts
│   ├── models/session-state.model.ts, fertilizer-session-state.model.ts
│   └── environments/environment.ts, environment.prod.ts
├── media-service/src/main/java/com/shivagri/media/
│   ├── MediaServiceApplication.java
│   ├── controller/MediaController.java
│   ├── service/MediaService.java
│   └── model/MediaDocument.java
├── nginx/nginx.conf, Dockerfile
├── mongodb/init-mongo.js
├── infra/ (Kubernetes YAMLs)
├── .githooks/ (pre-push: auto-update context.md, setup.sh: activate hooks)
├── scripts/ (vps-setup.sh, backup-mongodb.sh, init-letsencrypt.sh)
├── .github/workflows/ (8 CI/CD workflows)
├── docker-compose.yml, docker-compose.prod.yml
├── context.md (LLM context — single source of truth)
└── .env.example
```

---

## 4. AUTHENTICATION & AUTHORIZATION

### Auth Flow

1. **Login:** Frontend sends Google OAuth authorization code to `POST /api/auth/google-code`
2. **Backend:** Verifies with Google, creates/updates User in DB, generates JWT (24h expiry), stores Google refresh token
3. **Token Storage:** JWT stored in localStorage on frontend
4. **Request Auth:** `authInterceptor` adds `Authorization: Bearer <token>` to all non-auth requests
5. **Token Refresh:** Proactive refresh 5 minutes before expiry via `POST /api/auth/refresh` using stored Google refresh token
6. **Tab Visibility:** Token refreshed when user returns to tab after being away

### Backend Auth Middleware (`backend/src/middleware/auth.js`)

**`authenticate`** — Extracts JWT from Authorization header or cookies, verifies, populates `req.user` with user + role + permissions. Returns 401 if invalid.

**`requirePermission(permissions, options)`** — Checks granular permissions. Options: `requireAll` (default true), `allowAdmin` (default true — admins bypass all checks). Returns 403 if insufficient.

**`requireOwnership(userIdField, resourceGetter)`** — Checks resource ownership. Admins can access all.

### Permission Format

`resource.action` — e.g., `soil.sessions.view`, `project.create`, `managerial.receipts.delete`

**Actions:** view, create, update, delete, approve, assign-role, generate, download, send, upload, export, assign, manage, record

### JWT Utility (`backend/src/utils/jwt.js`)

- `generateAccessToken(payload)` — 24-hour JWT
- `verifyToken(token)` — Verify signature & expiry
- `decodeToken(token)` — Decode without expiry check (for refresh flow)

### User Roles

| Role | Description |
|------|-------------|
| admin | Full access, bypasses all permission checks |
| user | Standard user |
| assistant | Assistant role |
| lab_technician | Lab testing access |
| manager | Managerial work access |

### Frontend Auth Components

- **AuthService** (`services/auth.service.ts`) — Google login, token management, `currentUser$` BehaviorSubject, `isAuthenticated` Signal
- **authGuard** (`guards/auth.guard.ts`) — Route protection, stores attempted URL for redirect after login
- **authInterceptor** (`interceptors/auth.interceptor.ts`) — Adds JWT, auto-refresh on 401, skips auth endpoints
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
| GET | `/api/soil-testing/sessions` | soil.sessions.view | Get all sessions with samples |
| GET | `/api/soil-testing/sessions/date/:date` | soil.sessions.view | Get sessions by date |
| GET | `/api/soil-testing/sessions/count/:date` | soil.sessions.view | Session count for date |
| GET | `/api/soil-testing/sessions/:id` | soil.sessions.view | Get session by ID |
| POST | `/api/soil-testing/sessions` | soil.sessions.create | Create session |
| PUT | `/api/soil-testing/sessions/:id` | soil.sessions.update | Update session & samples |
| PATCH | `/api/soil-testing/sessions/:id/status` | soil.sessions.update | Update session status |
| DELETE | `/api/soil-testing/sessions/:id` | — | Delete session & samples |
| POST | `/api/soil-testing/sessions/:id/upload-excel` | soil.sessions.update | Upload Excel samples |
| GET | `/api/soil-testing/sessions/:sessionId/samples` | soil.sessions.view | Paginated samples |
| PATCH | `/api/soil-testing/sessions/:sessionId/samples` | soil.sessions.update | Bulk upsert samples |
| DELETE | `/api/soil-testing/sessions/:sessionId/samples` | soil.samples.delete | Bulk delete samples |
| GET | `/api/soil-testing/samples/:sampleId/soil-data` | — | Soil data for fertilizer linking |

### Frontend

- **Component:** `pages/soil-testing/soil-testing.ts` — AG Grid table, Excel import, session state management, PDF generation, sample CRUD
- **Service:** `services/soil-testing.service.ts` — All session/sample API calls
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

### Classification Logic (`backend/src/utils/waterClassification.js`)
- pH, EC, SAR, RSC classification ranges
- Water class code generation (C1S1, C3S2, etc.)

### API Endpoints (`backend/src/routes/waterTesting.js`)
Same pattern as soil testing with `/api/water-testing/` prefix. Includes session CRUD, sample management, Excel upload, and PDF generation endpoints.

### Frontend
- **Component:** `pages/water-testing/water-testing.ts`
- **Service:** `services/water-testing.service.ts`
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
- `sampleNumber`, `farmerName`, `cropName`
- `soilSampleId` (ObjectId → SoilSample — cross-reference)
- NPK values: `nValue`, `pValue`, `kValue`
- Recommendations: `organicManure`, `dap`, `npk`
- Spray schedules: `spray1Npk`, `spray2Npk`, `spray3Npk` and related fields
- Fruit tree sections: `m1`-`m5` with sub-parameters

### API Endpoints (`backend/src/routes/fertilizerTesting.js`)
Same pattern as soil/water testing with `/api/fertilizer-testing/` prefix. Additional: Excel upload supports `type` parameter for crop type.

### Frontend
- **Component:** `pages/fertilizer-testing/fertilizer-testing.ts` — Complex form with multiple sections, spray schedules, fruit tree support, soil sample linking
- **Service:** `services/fertilizer-testing.service.ts`
- **Routes:** `/lab-testing/fertilizer-testing`, `/lab-testing/fertilizer-testing/session/:sessionId`

---

## 8. FEATURE: PROJECT MANAGEMENT (FARM DASHBOARD)

### Overview
Full project lifecycle management for farm consulting projects. Projects have categories (Farm, Landscaping, Gardening), status tracking, team assignment, contacts, milestones, budget tracking, and activity logging.

### Database Model: Project (`backend/src/models/Project.js`)

**Core Fields:**
- `name` (String, required, text-indexed)
- `category` (enum: FARM, LANDSCAPING, GARDENING, required, indexed)
- `status` (enum: Upcoming, Running, Completed, On Hold, Cancelled)
- `budget` (Number, required, min: 0), `expenses` (Number, auto-updated)

**Client Info:**
- `clientId`, `clientName`, `clientEmail`, `clientPhone`, `clientAvatar`, `alternativeContact`

**Location:**
- `address`, `city`, `district`, `state`, `postalCode`
- `coordinates` (GeoJSON for geospatial queries), `mapUrl`

**Land Details:**
- `totalArea`, `areaUnit`, `cultivableArea`, `soilType`
- `waterSource[]`, `irrigationSystem`, `terrainType`

**Team:**
- `assignedTo`, `projectManager`, `fieldWorkers[]`, `consultants[]`, `assignedTeam[]` (User refs)

**Contacts:** Array of { fullName, designation, phone, email, role, isPrimary, isActive }

**Milestones:** Array of { name, date, description, isCompleted, completedAt }

**Visit Tracking:** `totalVisitsPlanned`, `totalVisitsCompleted`, `visitFrequency`, `numberOfYears`

**Other:** `crops[]`, `tags[]`, `priority`, `isFavorite[]` (user IDs), `coverImage`, `images[]`

**Soft Delete:** `isDeleted`, `deletedAt`, `deletedBy`

**Virtuals:** `fullLocation`, `budgetRemaining`, `isOverBudget`, `daysToCompletion`, `isOverdue`

**Indexes:** category+status, city, state, createdBy, budget, text search (name), geospatial (coordinates), date ranges

### API Endpoints (`backend/src/routes/projects.js`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/projects` | farm.projects.view | Filtered/paginated list |
| GET | `/api/projects/stats` | farm.projects.view | Statistics |
| GET | `/api/projects/export` | project.export | Export to Excel/CSV |
| GET | `/api/projects/:id` | farm.projects.view | Get single project |
| POST | `/api/projects` | project.create | Create project |
| PATCH | `/api/projects/:id` | project.update | Update project |
| DELETE | `/api/projects/:id` | project.delete | Soft delete |
| DELETE | `/api/projects/:id/hard` | — | Hard delete (admin) |
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
| PATCH | `/api/projects/bulk` | project.update | Bulk update |
| POST | `/api/projects/bulk-delete` | project.delete | Bulk soft delete |

**Query Filters:** category, projectType, status, city, state, budget range, date range, team, search text, favorites

### Frontend
- **Component:** `pages/farm-dashboard/farm-dashboard.ts` — Project listing, activity tracking, budget/expense dashboard
- **Component:** `pages/project-details/project-details.ts` — Full project view
- **Route:** `/farm-dashboard` (authGuard), `/project-details/:id`

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
- `date`, `customerName`, `referenceNumber`, `location`, `village`, `phoneNumber`, `mobileNumber`
- `items[]` — { serialNumber, description, descriptionGujarati, rate, quantity, total }
- `subtotal`, `taxAmount`, `discount`, `grandTotal`, `grandTotalInWords`
- `paymentStatus` (enum: unpaid, partial, paid), `paidAmount`
- `linkedReceipts[]` (Receipt refs)
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
- `name`, `email` (unique, indexed), `googleId` (unique, sparse)
- `profilePhoto`, `role` (enum: admin, user, assistant, lab_technician, manager)
- `roleRef` (ObjectId → Role — RBAC), `refreshToken`, `googleRefreshToken`
- `lastLogin`, `metadata` (department, designation, phoneNumber)
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
- `generateBulkPDFs(samples)` — Multiple PDFs as array
- `generateBulkPDFsStream(samples, type)` — Async generator for streaming
- `generateCombinedPDF(samples)` — Single PDF with all samples

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
- Storage: Filesystem (`/var/media/uploads`)
- Max file: 20MB
- Allowed types: image/jpeg, image/png, image/webp, image/gif

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
| `login` | LoginComponent | — | Google OAuth |
| `lab-testing` | LabTestingComponent | authGuard | Parent container |
| `lab-testing/soil-testing` | SoilTestingComponent | — | Child route |
| `lab-testing/soil-testing/session/:sessionId` | SoilTestingComponent | — | Session view |
| `lab-testing/water-testing` | WaterTestingComponent | — | Child route |
| `lab-testing/water-testing/session/:sessionId` | WaterTestingComponent | — | Session view |
| `lab-testing/fertilizer-testing` | FertilizerTestingComponent | — | Child route |
| `lab-testing/fertilizer-testing/session/:sessionId` | FertilizerTestingComponent | — | Session view |
| `managerial-work` | ManagerialWorkComponent | authGuard | Parent container |
| `managerial-work/receipts` | ReceiptsComponent | — | Child route |
| `managerial-work/invoices` | InvoicesComponent | — | Child route |
| `managerial-work/letters` | LettersComponent | — | Child route |
| `farm-dashboard` | FarmDashboardComponent | authGuard | Project management |
| `projects/new` | ProjectWizardComponent | authGuard | Create project |
| `projects/edit/:id` | ProjectWizardComponent | authGuard | Edit project |
| `project-details/:id` | ProjectDetailsComponent | — | View project |
| `admin/users` | UserManagementComponent | authGuard | User management |
| `my-account` | MyAccountComponent | authGuard | Account settings |
| `contact` | ContactComponent | — | Contact page |
| `404` | NotFoundComponent | — | Error page |
| `**` | → `/404` | — | Catch-all |

**Public pages (no auth):** home, about, events, causes, blog, shop, team, gallery, testimonials, donation, contact

---

## 19. FRONTEND: SHARED COMPONENTS

| Component | Location | Purpose |
|-----------|----------|---------|
| HeaderComponent | `components/header/` | Navigation, auth display, permission-based menu items, logout |
| FooterComponent | `components/footer/` | Company info, links, social media |
| ToastComponent | `components/toast/` | Notification display, auto-dismiss |
| ConfirmationModalComponent | `components/confirmation-modal/` | Reusable confirm/cancel dialog |
| DownloadProgressComponent | `components/download-progress/` | Bulk download progress bar |
| DashboardOverviewComponent | `components/dashboard-overview/` | Dashboard stats and metrics |
| ProjectListComponent | `components/project-list/` | Project cards for home page |
| ProjectDetailPopupComponent | `components/project-detail-popup/` | Modal for project details |
| RoleSelectionModalComponent | `components/role-selection-modal/` | Role picker during first login |

---

## 20. FRONTEND: SERVICES REFERENCE

| Service | File | Key Methods |
|---------|------|-------------|
| AuthService | `auth.service.ts` | googleLoginWithCode(), getCurrentUser(), refreshToken(), logout(), currentUser$ BehaviorSubject |
| UserService | `user.service.ts` | getAllUsers(), getUser(), updateUserRole(), deleteUser() |
| PermissionService | `permission.service.ts` | hasPermission(), hasRole(), hasAnyPermission(), getAllRoles(), createRole(), assignRoleToUser() |
| SoilTestingService | `soil-testing.service.ts` | Session CRUD, sample CRUD, bulkUpdateSamples(), uploadExcel(), getSoilDataForSample() |
| WaterTestingService | `water-testing.service.ts` | Session CRUD, sample CRUD, bulkUpdateSamples(), uploadExcel() |
| FertilizerTestingService | `fertilizer-testing.service.ts` | Session CRUD, sample CRUD, bulkUpdateSamples(), uploadExcel() with type |
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

### Auth Interceptor (`interceptors/auth.interceptor.ts`)
- Adds `Authorization: Bearer <token>` to non-auth requests
- Proactive token refresh if expiring within 5 minutes
- Retries failed requests with new token on 401

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
| users | User.js | email (unique), role, createdAt |
| roles | Role.js | name (unique), isActive |
| permissions | Permission.js | name (unique), resource, action |
| projects | Project.js | category+status, city, state, createdBy, text(name), 2dsphere(coordinates) |
| transactions | Transaction.js | projectId+date, projectId+type, projectId+category |
| soilsessions | SoilSession.js | date, (date+version unique) |
| soilsamples | SoilSample.js | sessionId, sessionDate |
| watersessions | WaterSession.js | date, (date+version unique) |
| watersamples | WaterSample.js | sessionId, sessionDate |
| fertilizersessions | FertilizerSession.js | date, (date+version unique) |
| fertilizersamples | FertilizerSample.js | sessionId, sessionDate |
| receipts | Receipt.js | receiptNumber (unique), date, customerName |
| invoices | Invoice.js | invoiceNumber (unique), date |
| letters | Letter.js | letterNumber (unique sparse), date |
| activitylogs | ActivityLog.js | projectId+timestamp, userId+timestamp |
| drafts | Draft.js | projectId, createdBy |
| media | MediaDocument.java | status+createdAt |

### Cross-Collection Relationships

```
User ─── roleRef ──→ Role ──── permissions[] ──→ Permission
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
Invoice ── linkedReceipts[] ──→ Receipt
```

---

## 25. API: COMPLETE ENDPOINT REFERENCE

### Base URL
- Development: `http://localhost:3000/api`
- Production: `https://shivagri.com/api`

### Auth Endpoints (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/google` | No | Google OAuth ID token login |
| POST | `/google-code` | No | Google OAuth auth code login |
| POST | `/refresh` | No | Refresh JWT using Google refresh token |
| POST | `/logout` | Yes | Logout & revoke tokens |
| GET | `/me` | Yes | Get current user |

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
| frontend | ./frontend | 80 (internal) | Angular SPA via Nginx |
| nginx | ./nginx | 80 (public) | Reverse proxy, depends on api+frontend |

### Production (`docker-compose.prod.yml`)

| Service | Image | Port | Key Config |
|---------|-------|------|------------|
| api | ${DOCKERHUB_USERNAME}/shiv-agri-api:latest | 3000 | Production env vars from .env |
| media-service | ${DOCKERHUB_USERNAME}/shiv-agri-media:latest | 8081 | Filesystem at /var/media/uploads |
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
- **Routing:** `/api/v1/media` → media-service:8081, `/api` → api:3000, `/` → frontend:80
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

- **pre-push:** Automatically updates `context.md` via Claude CLI before each push. Skip with `SKIP_CONTEXT_UPDATE=1 git push` or `git push --no-verify`.
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
| JWT_EXPIRES_IN | 24h | Token expiry |
| GOOGLE_CLIENT_ID | — | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | — | Google OAuth client secret |
| ALLOWED_ORIGINS | http://localhost:4200 | CORS origins (comma-separated) |

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
