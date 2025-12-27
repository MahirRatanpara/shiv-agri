# SHI-20: Role-Based Access Control (RBAC) Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Permissions Structure](#permissions-structure)
4. [Roles Definition](#roles-definition)
5. [Database Schema](#database-schema)
6. [Backend Implementation](#backend-implementation)
7. [Frontend Implementation](#frontend-implementation)
8. [Migration & Deployment](#migration--deployment)
9. [Usage Examples](#usage-examples)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)
12. [UX Improvements & Error Handling](#ux-improvements--error-handling)

---

## Overview

This document describes the comprehensive Role-Based Access Control (RBAC) system implemented for the Shiv Agri application. The system provides fine-grained permission management for controlling access to features and resources.

### Key Features
- **Granular Permissions**: 50+ permissions covering all system operations
- **Flexible Roles**: 5 predefined roles + ability to create custom roles
- **Permission-Based Middleware**: API endpoint protection using permissions
- **Admin Dashboard**: Full UI for managing roles and permissions
- **Database Migration**: Reusable script for applying permission changes
- **CI/CD Integration**: GitHub Actions for automated deployments

### Implementation Status
✅ Backend Models (Permission, Role, User)
✅ YAML Configuration for permissions
✅ Database Migration Script
✅ Backend API Endpoints
✅ Permission Middleware
✅ Frontend Service & Directives
✅ Admin Dashboard Component
✅ GitHub Actions Workflow
✅ Documentation

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                       YAML Configuration                     │
│              (backend/src/config/permissions.yml)            │
│         • Defines all permissions and role mappings         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Migration Script                          │
│          (backend/src/scripts/migrate-permissions.js)        │
│    • Reads YAML config                                       │
│    • Syncs to MongoDB (idempotent)                          │
│    • Updates user permissions                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                     Database Layer                           │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│   │  Permission  │  │     Role     │  │     User     │    │
│   │  Collection  │  │  Collection  │  │  Collection  │    │
│   └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                ↓                     ↓
    ┌───────────────────┐   ┌──────────────────┐
    │  Backend API      │   │  Frontend UI     │
    │  • Middleware     │   │  • Service       │
    │  • Controllers    │   │  • Directives    │
    │  • Routes         │   │  • Components    │
    └───────────────────┘   └──────────────────┘
```

### Data Flow

1. **Permission Definition** → YAML file defines all permissions and roles
2. **Migration** → Script reads YAML and syncs to MongoDB
3. **User Login** → User permissions are loaded and cached
4. **API Request** → Middleware checks required permissions
5. **UI Rendering** → Directives show/hide elements based on permissions

---

## Permissions Structure

### Permission Format
Each permission follows the pattern: `resource.action`

Examples:
- `soil.sessions.view` - View soil testing sessions
- `soil.sessions.create` - Create soil testing sessions
- `users.assign-role` - Assign roles to users

### Permission Categories
Permissions are organized into categories:

1. **User Management** (`users`, `roles`, `permissions`)
2. **Testing** (`soil-*`, `water-*`)
3. **Projects** (`projects`, `farms`)
4. **Billing** (`billing`)
5. **Files** (`files`)
6. **Reports** (`reports`)
7. **System** (`system-settings`, `system-logs`)

### Available Actions
- `view` - Read access
- `create` - Create new resources
- `update` - Modify existing resources
- `delete` - Remove resources
- `generate` - Generate reports/documents
- `download` - Download files
- `send` - Send via email/WhatsApp
- `upload` - Upload files
- `export` - Export data
- `approve` - Approve requests
- `assign` - Assign permissions/roles
- `assign-role` - Assign roles to users

### Complete Permission List

See `backend/src/config/permissions.yml` for the full list of 50+ permissions.

---

## Roles Definition

### System Roles (Cannot be deleted)

#### 1. Admin
**Purpose**: Full system access
**Permissions**: ALL (60+ permissions)
**Typical Users**: System administrators, owners

#### 2. User (Client)
**Purpose**: View-only access to own data
**Permissions**:
- View own soil/water sessions and samples
- View own projects and farms
- View own billing information
- Download own reports

**Typical Users**: Farmers, clients

#### 3. Assistant
**Purpose**: Data entry support
**Permissions**:
- Create soil/water sessions and samples
- View sessions and samples
- Upload files
- View reports

**Typical Users**: Field assistants, data entry staff

### Custom Roles

#### 4. Lab Technician
**Purpose**: Full testing operations
**Permissions**:
- Full CRUD on soil/water testing
- Generate and download reports
- Upload/delete files

**Typical Users**: Laboratory staff

#### 5. Manager
**Purpose**: Business operations management
**Permissions**:
- View users
- View testing data and generate reports
- Full access to projects and farms
- Full access to billing
- Upload/delete files

**Typical Users**: Operations managers, supervisors

### Creating Custom Roles

Admins can create custom roles via:
1. Admin Dashboard UI
2. API endpoint: `POST /api/roles`
3. Editing `permissions.yml` and running migration

---

## Database Schema

### Permission Model
```javascript
{
  name: String,              // e.g., "soil.sessions.view"
  resource: String,          // e.g., "soil-sessions"
  action: String,            // e.g., "view"
  description: String,
  isActive: Boolean,
  metadata: {
    category: String,        // e.g., "testing"
    tags: [String]
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Role Model
```javascript
{
  name: String,              // e.g., "admin"
  displayName: String,       // e.g., "Administrator"
  description: String,
  permissions: [ObjectId],   // Array of Permission IDs
  isSystem: Boolean,         // System roles cannot be deleted
  isActive: Boolean,
  metadata: {
    color: String,           // UI color (#hex)
    icon: String,            // UI icon
    priority: Number         // Display order (lower = higher)
  },
  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

### User Model (Updated)
```javascript
{
  name: String,
  email: String,
  role: String,              // Role name (e.g., "admin")
  roleRef: ObjectId,         // Reference to Role document
  permissions: [ObjectId],   // Cached permissions for performance
  isApproved: Boolean,
  isActive: Boolean,
  // ... other fields
}
```

---

## Backend Implementation

### 1. Models

**Location**: `backend/src/models/`

- `Permission.js` - Permission model with methods
- `Role.js` - Role model with permission management
- `User.js` - Updated with RBAC support

### 2. Middleware

**Location**: `backend/src/middleware/auth.js`

#### `authenticate()`
Verifies JWT and loads user with permissions.

#### `requirePermission(permissions, options)`
Checks if user has required permission(s).

**Usage**:
```javascript
// Single permission
router.get('/sessions',
  authenticate,
  requirePermission('soil.sessions.view'),
  getSessions
);

// Multiple permissions (require ALL)
router.post('/sessions',
  authenticate,
  requirePermission(['soil.sessions.create', 'soil.sessions.view']),
  createSession
);

// Multiple permissions (require ANY)
router.get('/dashboard',
  authenticate,
  requirePermission(['admin.view', 'manager.view'], { requireAll: false }),
  getDashboard
);
```

**Options**:
- `requireAll` (default: true) - User must have ALL permissions
- `allowAdmin` (default: true) - Admin role bypasses check

#### `requireOwnership(userIdField, resourceGetter)`
Ensures user owns the resource (combined with permission check).

#### `authorize(...roles)`
Legacy role-based check (deprecated, use `requirePermission` instead).

### 3. Controllers

**Location**: `backend/src/controllers/roleController.js`

- `getAllRoles()` - Get all roles with user counts
- `getRole(id)` - Get single role by ID/name
- `createRole()` - Create new custom role
- `updateRole(id)` - Update role permissions
- `deleteRole(id)` - Delete custom role
- `getAllPermissions()` - Get all available permissions
- `assignRoleToUser(userId)` - Assign role to user

### 4. Routes

**Location**: `backend/src/routes/roles.js`

```
GET    /api/roles              - List all roles
GET    /api/roles/:id          - Get role details
POST   /api/roles              - Create role (requires 'roles.create')
PUT    /api/roles/:id          - Update role (requires 'roles.update')
DELETE /api/roles/:id          - Delete role (requires 'roles.delete')

GET    /api/roles/permissions  - List all permissions (requires 'permissions.view')
POST   /api/roles/assign/:userId - Assign role (requires 'users.assign-role')
```

### 5. Protected Routes

All soil and water testing routes now require authentication and appropriate permissions:

```javascript
// Soil Testing
GET    /api/soil-testing/sessions       -> requires 'soil.sessions.view'
POST   /api/soil-testing/sessions       -> requires 'soil.sessions.create'
PUT    /api/soil-testing/sessions/:id   -> requires 'soil.sessions.update'
DELETE /api/soil-testing/sessions/:id   -> requires 'soil.sessions.delete'

// Water Testing
GET    /api/water-testing/sessions      -> requires 'water.sessions.view'
POST   /api/water-testing/sessions      -> requires 'water.sessions.create'
// ... etc
```

---

## Frontend Implementation

### 1. Permission Service

**Location**: `frontend/src/app/services/permission.service.ts`

**Methods**:
```typescript
// Permission checks
hasPermission(permissionName: string): boolean
hasAllPermissions(permissions: string[]): boolean
hasAnyPermission(permissions: string[]): boolean

// Role checks
hasRole(roleName: string | string[]): boolean

// API methods
getAllPermissions(params?): Observable<...>
getAllRoles(params?): Observable<...>
getRole(id): Observable<...>
createRole(data): Observable<...>
updateRole(id, data): Observable<...>
deleteRole(id): Observable<...>
assignRoleToUser(userId, roleName): Observable<...>
```

### 2. Directives

#### HasPermissionDirective

**Location**: `frontend/src/app/directives/has-permission.directive.ts`

**Usage**:
```html
<!-- Single permission -->
<button *hasPermission="'soil.sessions.create'">
  Create Session
</button>

<!-- Multiple permissions (require ALL) -->
<button *hasPermission="['soil.sessions.create', 'soil.sessions.view']">
  Manage Sessions
</button>

<!-- Multiple permissions (require ANY) -->
<button *hasPermission="['admin.view', 'manager.view']; mode: 'any'">
  View Dashboard
</button>

<!-- With else template -->
<div *hasPermission="'admin.view'; else noAccess">
  Admin content
</div>
<ng-template #noAccess>
  <p>Access denied</p>
</ng-template>
```

#### HasRoleDirective

**Location**: `frontend/src/app/directives/has-role.directive.ts`

**Usage**:
```html
<!-- Single role -->
<button *hasRole="'admin'">Admin Panel</button>

<!-- Multiple roles -->
<button *hasRole="['admin', 'manager']">Management</button>

<!-- With else template -->
<div *hasRole="'admin'; else noAccess">
  Admin content
</div>
```

### 3. Admin Dashboard

**Location**: `frontend/src/app/pages/admin/role-management/`

**Features**:
- View all roles with user counts
- Create custom roles
- Edit role permissions
- Delete custom roles (system roles protected)
- View permission details
- Search and filter roles
- Responsive design with modals

**Access**: Requires `roles.view` permission

---

## Migration & Deployment

### Database Migration Script

**Location**: `backend/src/scripts/migrate-permissions.js`

**Features**:
- Reads from `permissions.yml`
- Idempotent (safe to run multiple times)
- Dry-run mode for preview
- Force mode for system role updates
- Validates configuration
- Updates all users with new permissions
- Colored console output

**Usage**:

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already done)
npm install

# Dry run (preview changes)
npm run migrate:permissions:dry-run

# Apply changes
npm run migrate:permissions

# Force update (includes system roles)
npm run migrate:permissions:force
```

**Direct execution**:
```bash
node src/scripts/migrate-permissions.js [--dry-run] [--force]
```

**Output Example**:
```
🚀 Starting Permission & Role Migration

ℹ Loading configuration from permissions.yml
✓ Loaded 60 permissions and 5 roles

ℹ Connecting to MongoDB...
✓ Connected to MongoDB

📋 Syncing Permissions
✓ Created permission: users.view
✓ Created permission: users.create
  Permission unchanged: users.update
...

👥 Syncing Roles
✓ Created role: lab_technician (40 permissions)
✓ Updated role: admin (60 permissions)
...

👤 Syncing User Permissions
✓ Updated user: admin@example.com (admin)
✓ Updated user: tech@example.com (lab_technician)
...

📊 Migration Summary

Permissions:
  ✓ Created: 45
  ℹ Updated: 10
    Unchanged: 5

Roles:
  ✓ Created: 2
  ℹ Updated: 1
    Unchanged: 2

Users:
  ✓ Updated: 15

✓ Migration completed successfully
```

### GitHub Actions Workflow

**Location**: `.github/workflows/deploy-permissions.yml`

**Triggers**:
1. Manual dispatch (workflow_dispatch) with options:
   - Environment (production/staging)
   - Dry run mode
   - Force update flag

2. Automatic on push to main when `permissions.yml` changes

**Features**:
- Environment protection
- Configuration validation
- Dry-run support
- Migration execution
- Result verification
- Deployment summary
- Failure notifications

**Manual Execution**:
1. Go to GitHub → Actions
2. Select "Deploy Database Permissions"
3. Click "Run workflow"
4. Choose options:
   - Environment
   - Dry run (yes/no)
   - Force update (yes/no)
5. Click "Run workflow"

**Required Secrets**:
- `MONGODB_URI` - MongoDB connection string
- `PRODUCTION_SSH_KEY` - SSH key for production access (if needed)

---

## Usage Examples

### Backend: Protecting an API Endpoint

```javascript
const { authenticate, requirePermission } = require('../middleware/auth');

// GET endpoint - view permission
router.get('/farms',
  authenticate,
  requirePermission('farms.view'),
  async (req, res) => {
    // Implementation
  }
);

// POST endpoint - create permission
router.post('/farms',
  authenticate,
  requirePermission('farms.create'),
  async (req, res) => {
    // Implementation
  }
);

// DELETE endpoint - delete permission, disable admin bypass
router.delete('/farms/:id',
  authenticate,
  requirePermission('farms.delete', { allowAdmin: false }),
  async (req, res) => {
    // Implementation
  }
);

// Multiple permissions - user needs BOTH
router.post('/farms/:id/invoice',
  authenticate,
  requirePermission(['farms.view', 'billing.create']),
  async (req, res) => {
    // Implementation
  }
);
```

### Frontend: Conditional UI Rendering

```typescript
// Component
import { PermissionService } from './services/permission.service';

export class MyComponent {
  constructor(private permissionService: PermissionService) {}

  canCreate(): boolean {
    return this.permissionService.hasPermission('soil.sessions.create');
  }

  canManage(): boolean {
    return this.permissionService.hasAnyPermission([
      'admin.view',
      'manager.view'
    ]);
  }
}
```

```html
<!-- Template using directive -->
<button *hasPermission="'soil.sessions.create'">
  Create Session
</button>

<div *hasRole="['admin', 'manager']">
  <h2>Management Dashboard</h2>
  <!-- Manager content -->
</div>

<!-- Programmatic check -->
<button *ngIf="canCreate()">
  Create Session
</button>
```

### Backend: Programmatic Permission Check

```javascript
const { hasPermission } = require('../middleware/auth');

async function someController(req, res) {
  const user = req.user;

  if (hasPermission(user, 'billing.send')) {
    // Send invoice via email
  } else {
    return res.status(403).json({
      error: 'You do not have permission to send invoices'
    });
  }
}
```

### Creating a New Role

```javascript
// Via API
const response = await fetch('/api/roles', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'field_supervisor',
    displayName: 'Field Supervisor',
    description: 'Supervises field operations and data collection',
    permissions: [
      '507f1f77bcf86cd799439011', // soil.sessions.view
      '507f1f77bcf86cd799439012', // soil.sessions.create
      // ... more permission IDs
    ],
    metadata: {
      color: '#10b981',
      icon: 'clipboard',
      priority: 50
    }
  })
});
```

---

## Testing

### Unit Tests

Test permission checks in isolation:

```javascript
describe('Permission Middleware', () => {
  it('should allow access with correct permission', async () => {
    const req = { user: { permissions: [{ name: 'soil.sessions.view' }] } };
    const res = {};
    const next = jest.fn();

    const middleware = requirePermission('soil.sessions.view');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should deny access without permission', async () => {
    const req = { user: { permissions: [] } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    const middleware = requirePermission('soil.sessions.create');
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### Integration Tests

Test end-to-end permission flows:

```javascript
describe('Soil Sessions API', () => {
  it('should allow admin to create sessions', async () => {
    const token = await getAdminToken();
    const response = await request(app)
      .post('/api/soil-testing/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2024-01-01', version: 1 });

    expect(response.status).toBe(201);
  });

  it('should deny user without permission', async () => {
    const token = await getUserToken(); // User without create permission
    const response = await request(app)
      .post('/api/soil-testing/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2024-01-01', version: 1 });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Insufficient permissions');
  });
});
```

### Manual Testing Checklist

- [ ] Admin can access all features
- [ ] User can only view own data
- [ ] Assistant can create but not delete
- [ ] Lab Technician has full testing access
- [ ] Manager has project and billing access
- [ ] Custom roles work as expected
- [ ] Permission changes reflect immediately after migration
- [ ] UI elements show/hide based on permissions
- [ ] API endpoints properly protected
- [ ] Error messages are clear and helpful

---

## Troubleshooting

### Common Issues

#### 1. User can't access features after role assignment

**Problem**: User assigned a role but still gets "Insufficient permissions" errors.

**Solution**:
```bash
# Re-run the migration to sync user permissions
npm run migrate:permissions
```

Or programmatically:
```javascript
// Update single user
const user = await User.findById(userId);
const role = await Role.findOne({ name: user.role }).populate('permissions');
user.permissions = role.permissions.map(p => p._id);
await user.save();
```

#### 2. Migration fails with "Permission already exists"

**Problem**: Duplicate permission name in YAML.

**Solution**:
- Check `permissions.yml` for duplicate `name` fields
- Ensure all permission names are unique
- Run validation: `node src/scripts/migrate-permissions.js --dry-run`

#### 3. System role updated incorrectly

**Problem**: Admin role missing permissions after migration.

**Solution**:
```bash
# Force update system roles
npm run migrate:permissions:force
```

**Note**: Use force flag carefully as it overwrites system roles.

#### 4. Frontend not reflecting permission changes

**Problem**: UI still shows old permissions after migration.

**Solution**:
- User must log out and log in again to refresh permissions
- Or call `permissionService.updateUserPermissions()` after role change
- Clear browser localStorage if needed

#### 5. "Authentication required" on public endpoints

**Problem**: Middleware applied to routes that should be public.

**Solution**:
```javascript
// Move authenticate middleware to individual routes
// NOT: router.use(authenticate);

// Instead:
router.get('/sessions', authenticate, requirePermission('soil.sessions.view'), handler);
router.get('/health', handler); // Public endpoint
```

### Debugging

Enable detailed logging:

```javascript
// In migrate-permissions.js
process.env.LOG_LEVEL = 'debug';

// In auth middleware
console.log('User permissions:', req.user.permissions.map(p => p.name));
console.log('Required permissions:', requiredPermissions);
```

Check database state:

```javascript
// Connect to MongoDB and run:
db.permissions.find({ isActive: true }).count()
db.roles.find({ isActive: true })
db.users.findOne({ email: 'test@example.com' })
```

### Getting Help

1. **Check logs**: Review migration output and API error logs
2. **Verify configuration**: Ensure `permissions.yml` is valid YAML
3. **Test permissions**: Use dry-run mode before applying changes
4. **Review docs**: Check this guide for examples and patterns
5. **Inspect database**: Verify permissions and roles are correctly stored

---

## UX Improvements & Error Handling

As part of the RBAC implementation, several UX improvements were made to enhance user experience:

### Toast Notifications

**Issue**: Browser `alert()` popups were intrusive and provided poor UX.

**Solution**: Replaced all browser alerts with toast notifications using `ToastService`.

**Files Updated**:
- `frontend/src/app/pages/soil-testing/soil-testing.ts` - 7 alerts replaced
- `frontend/src/app/pages/water-testing/water-testing.ts` - 6 alerts replaced

**Examples**:

```typescript
// BEFORE (Intrusive browser alert)
alert('Cannot start session: Backend server is not connected');

// AFTER (Graceful toast message)
this.toastService.show('Cannot start session: Backend server is not connected', 'error');
```

**Toast Types**:
- `'error'` - Red toast for errors
- `'warning'` - Yellow/orange toast for warnings
- `'success'` - Green toast for success messages
- `'info'` - Blue toast for informational messages

### Permission-Based UI Controls

**Issue**: Users could click buttons for actions they don't have permission to perform, leading to error messages.

**Solution**: Added `*hasPermission` directives to hide forbidden action buttons.

**Files Updated**:
- `frontend/src/app/pages/soil-testing/soil-testing.html`
- `frontend/src/app/pages/water-testing/water-testing.html`
- `frontend/src/app/pages/soil-testing/soil-testing.ts` (added HasPermissionDirective import)
- `frontend/src/app/pages/water-testing/water-testing.ts` (added HasPermissionDirective import)

**Permission Mappings**:

| Button | Permission | Resource |
|--------|-----------|----------|
| Start New Session (Soil) | `soil.sessions.create` | soil-sessions |
| Start New Session (Water) | `water.sessions.create` | water-sessions |
| Save & Exit | `soil/water.sessions.update` | sessions |
| Complete Session | `soil/water.sessions.update` | sessions |
| Add Row | `soil/water.samples.create` | samples |
| Delete Selected | `soil/water.samples.delete` | samples |
| Export to CSV | `soil/water.samples.view` | samples |
| Download All PDFs | `soil/water.reports.download` | reports |
| Download Combined PDF | `soil/water.reports.download` | reports |

**Example Implementation**:

```html
<!-- Soil Testing - Session Actions -->
<button *hasPermission="'soil.sessions.create'"
        class="btn btn-primary"
        (click)="startNewSession()"
        [disabled]="!isBackendConnected">
  <i class="fas fa-plus"></i>
  Start New Session
</button>

<!-- Water Testing - Sample Actions -->
<button *hasPermission="'water.samples.delete'"
        class="btn btn-danger"
        (click)="deleteSelectedRows()">
  <i class="fas fa-trash"></i>
  Delete Selected
</button>

<!-- Report Generation -->
<button *hasPermission="'soil.reports.download'"
        class="btn btn-pdf"
        (click)="downloadAllPdfs()">
  <i class="fas fa-file-pdf"></i>
  Download All PDFs
</button>
```

### Permission-Based Navigation

**Issue**: All navigation items were visible regardless of user permissions, leading to 403 errors when users clicked sections they couldn't access.

**Solution**: Implemented dynamic navigation that shows/hides sections based on user permissions.

**Files Updated**:
- `frontend/src/app/components/header/header.ts` - Permission-aware navigation logic
- `frontend/src/app/components/header/header.html` - Conditional navigation rendering

**Implementation**:

```typescript
// Header Component - Permission Flags
hasSoilTestingAccess = false;
hasWaterTestingAccess = false;

ngOnInit(): void {
  // Subscribe to current user changes
  this.authService.currentUser$.subscribe(user => {
    this.currentUser = user;
    this.isAuthenticated = !!user;

    // Reload permission service to ensure it has latest data
    if (user) {
      this.permissionService.reloadPermissions();
    }
  });

  // Subscribe to permission changes to update navigation
  this.permissionService.userPermissions$.subscribe(permissions => {
    // Update permissions whenever they change
    this.updatePermissions();
  });
}

private updatePermissions(): void {
  // Check if user has ANY soil testing related permission
  this.hasSoilTestingAccess = this.permissionService.hasAnyPermission([
    'soil.sessions.view',
    'soil.sessions.create',
    'soil.sessions.update',
    'soil.samples.view',
    'soil.samples.create',
    'soil.reports.download'
  ]);

  this.hasWaterTestingAccess = this.permissionService.hasAnyPermission([
    'water.sessions.view',
    'water.sessions.create',
    'water.sessions.update',
    'water.samples.view',
    'water.samples.create',
    'water.reports.download'
  ]);
}
```

**Template Usage**:

```html
<li class="nav-item" *ngIf="isAuthenticated && hasSoilTestingAccess">
  <a class="nav-link" routerLink="/soil-testing">Soil Testing</a>
</li>
<li class="nav-item" *ngIf="isAuthenticated && hasWaterTestingAccess">
  <a class="nav-link" routerLink="/water-testing">Water Testing</a>
</li>
```

**Automatic Updates**: Navigation items appear/disappear immediately after login without requiring a page refresh, thanks to reactive subscriptions to both `currentUser$` and `userPermissions$` observables.

### Confirmation Modals

**Issue**: Browser `confirm()` dialogs for logout were basic and unprofessional.

**Solution**: Created reusable confirmation modal service with beautiful UI.

**Files Created**:
- `frontend/src/app/services/confirmation-modal.service.ts`
- `frontend/src/app/components/confirmation-modal/confirmation-modal.component.ts`
- `frontend/src/app/components/confirmation-modal/confirmation-modal.component.html`
- `frontend/src/app/components/confirmation-modal/confirmation-modal.component.css`

**Usage Example**:

```typescript
async logout(): Promise<void> {
  const confirmed = await this.confirmationService.confirm({
    title: 'Confirm Logout',
    message: 'Are you sure you want to logout? Any unsaved changes will be lost.',
    confirmText: 'Yes, Logout',
    cancelText: 'Cancel',
    confirmClass: 'btn-warning',
    icon: 'fas fa-sign-out-alt'
  });

  if (confirmed) {
    this.authService.logout().subscribe({
      next: () => {
        this.toastService.show('You have been logged out successfully', 'success');
        this.router.navigate(['/login']);
      }
    });
  }
}
```

### Global Error Handling

**Issue**: HTTP errors showed technical messages like "Failed to connect to backend" which confused users.

**Solution**: Created global error interceptor with user-friendly messages.

**File Created**:
- `frontend/src/app/interceptors/error.interceptor.ts`

**Error Message Mapping**:

| HTTP Status | User-Friendly Message |
|-------------|----------------------|
| 403 | "You do not have permission to perform this action" |
| 401 | "Your session has expired. Please login again" |
| 404 | "The requested resource was not found" |
| 500 | "An unexpected error occurred. Please try again" |
| 503 | "Service is temporarily unavailable. Please try again later" |
| Network Error | "Unable to connect. Please check your internet connection" |

**Implementation**:

```typescript
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      handleError(error, toastService, router);
      return throwError(() => error);
    })
  );
};

function handleError(error: HttpErrorResponse, toastService: ToastService, router: Router): void {
  let errorMessage = 'An unexpected error occurred';
  let errorTitle = 'Error';

  switch (error.status) {
    case 403:
      errorMessage = error.error?.error || 'You do not have permission to perform this action.';
      errorTitle = 'Access Denied';
      break;
    // ... other cases
  }

  toastService.show(`${errorTitle}: ${errorMessage}`, 'error');
}
```

### Benefits

1. **No More Intrusive Popups**: Toast messages appear at the corner and don't block user workflow
2. **Better Error Messages**: More context-aware and user-friendly error descriptions
3. **Proactive UX**: Users don't see buttons/navigation for actions they can't perform
4. **Reduced Errors**: Permission-based UI prevents unnecessary API calls and error states
5. **Professional Feel**: Modern toast notifications and confirmation modals instead of browser dialogs
6. **Automatic Updates**: Navigation and UI update immediately after login without page refresh
7. **User-Friendly Error Messages**: No technical jargon like "backend" or "server connection failed"

### User Role Experience

**Admin Users**:
- See all buttons and controls
- Can perform all actions on soil/water testing

**Regular Users** (with limited permissions):
- Only see buttons they have permission to use
- Cannot accidentally trigger forbidden actions
- Get clear toast messages if something goes wrong

**Example Scenario**:

A user with `soil.sessions.view` permission but without `soil.sessions.create`:
- ❌ Will NOT see the "Start New Session" button
- ✅ CAN view existing sessions and resume them
- ✅ CAN view session data
- ❌ Will NOT see "Delete" or "Complete Session" buttons

This creates a cleaner, more intuitive interface where users only see what they can actually do.

### Permission-Based Navigation

**Issue**: Users could see navigation items for sections they don't have access to, leading to confusion and wasted clicks.

**Solution**: Navigation items now only appear if the user has at least one permission related to that section.

**Files Updated**:
- `frontend/src/app/components/header/header.ts` - Added permission checking logic
- `frontend/src/app/components/header/header.html` - Conditional navigation based on permissions

**Implementation**:

```typescript
// Header Component - Permission Flags
hasSoilTestingAccess = false;
hasWaterTestingAccess = false;

private updatePermissions(): void {
  // Check if user has ANY soil testing related permission
  this.hasSoilTestingAccess = this.permissionService.hasAnyPermission([
    'soil.sessions.view',
    'soil.sessions.create',
    'soil.sessions.update',
    'soil.samples.view',
    'soil.samples.create',
    'soil.reports.download'
  ]);

  // Check if user has ANY water testing related permission
  this.hasWaterTestingAccess = this.permissionService.hasAnyPermission([
    'water.sessions.view',
    'water.sessions.create',
    'water.sessions.update',
    'water.samples.view',
    'water.samples.create',
    'water.reports.download'
  ]);
}
```

```html
<!-- Only show Soil Testing if user has relevant permissions -->
<li class="nav-item" *ngIf="isAuthenticated && hasSoilTestingAccess">
  <a class="nav-link" routerLink="/soil-testing">Soil Testing</a>
</li>

<!-- Only show Water Testing if user has relevant permissions -->
<li class="nav-item" *ngIf="isAuthenticated && hasWaterTestingAccess">
  <a class="nav-link" routerLink="/water-testing">Water Testing</a>
</li>
```

### Confirmation Modals

**Issue**: Browser `confirm()` dialogs were basic and didn't match the app's design.

**Solution**: Created a reusable confirmation modal service with custom styling.

**Files Created**:
- `frontend/src/app/services/confirmation-modal.service.ts` - Service for managing confirmation dialogs
- `frontend/src/app/components/confirmation-modal/confirmation-modal.component.ts` - Modal component
- `frontend/src/app/components/confirmation-modal/confirmation-modal.component.html` - Modal template
- `frontend/src/app/components/confirmation-modal/confirmation-modal.component.css` - Modal styles

**Usage Example**:

```typescript
async logout(): Promise<void> {
  const confirmed = await this.confirmationService.confirm({
    title: 'Confirm Logout',
    message: 'Are you sure you want to logout? Any unsaved changes will be lost.',
    confirmText: 'Yes, Logout',
    cancelText: 'Cancel',
    confirmClass: 'btn-warning',
    icon: 'fas fa-sign-out-alt'
  });

  if (confirmed) {
    // Proceed with logout
  }
}
```

**Files Updated to Use Confirmation Modal**:
- `frontend/src/app/components/header/header.ts` - Logout confirmation
- `frontend/src/app/pages/my-account/my-account.ts` - Logout confirmation

### Global Error Handling

**Issue**: HTTP errors showed technical messages or generic alerts, providing poor UX.

**Solution**: Created a global error interceptor that handles all HTTP errors gracefully with user-friendly messages.

**File Created**:
- `frontend/src/app/interceptors/error.interceptor.ts` - Global error handler

**Error Handling Features**:

| Error Code | User-Friendly Message | Behavior |
|------------|----------------------|----------|
| 0 | "Unable to connect to the server" | Network/CORS issue |
| 400 | "Invalid request. Please check your input." | Bad request |
| 401 | "Your session has expired. Please login again." | Unauthorized |
| 403 | "You do not have permission to perform this action." | Forbidden - Shows specific error from server |
| 404 | "The requested resource was not found." | Not found |
| 500 | "A server error occurred. Please try again later." | Internal server error |
| 503 | "The service is temporarily unavailable." | Service unavailable |

**Example**:

```typescript
// Instead of showing:
"Http failure response for http://localhost:3000/api/sessions: 403 Forbidden"

// Users see:
"Access Denied: You do not have permission to create sessions."
```

### User-Friendly Error Messages

**Issue**: Error messages referenced "backend", "server", or showed technical details.

**Solution**: All error messages updated to be user-centric and action-oriented.

**Changes**:

| Before | After |
|--------|-------|
| "Backend Connection Failed" | "Service Unavailable" |
| "Cannot connect to the backend server" | "Unable to connect to the water/soil testing service" |
| "Backend server is not connected" | "Unable to start session. Please check your connection" |
| "Connecting to Backend..." | "Loading..." |

**Files Updated**:
- `frontend/src/app/pages/soil-testing/soil-testing.html` - Updated loading and error messages
- `frontend/src/app/pages/soil-testing/soil-testing.ts` - Updated error messages
- `frontend/src/app/pages/water-testing/water-testing.html` - Updated loading and error messages
- `frontend/src/app/pages/water-testing/water-testing.ts` - Updated error messages
- `frontend/src/app/interceptors/error.interceptor.ts` - Technical term cleanup

---

## Summary

The RBAC system provides comprehensive access control with:

✅ **60+ granular permissions** across all resources
✅ **5 predefined roles** + custom role creation
✅ **Backend middleware** for API endpoint protection
✅ **Frontend directives** for UI element visibility
✅ **Admin dashboard** for role management
✅ **Reusable migration** script for database updates
✅ **CI/CD integration** via GitHub Actions
✅ **Toast notifications** replacing browser alerts
✅ **Permission-based UI** hiding forbidden actions
✅ **Full documentation** and examples

All components are production-ready and tested for the Shiv Agri application.

---

**Last Updated**: December 27, 2024
**Version**: 1.2.0
**Feature**: SHI-20

---

## Migration & Updates

### Applying Permission Updates to Users

After running migrations:

**Option 1: Users logout and login again** ✅ Recommended
- Simplest approach
- Backend sends fresh `roleRef` with updated permissions
- Frontend automatically updates navigation

**Option 2: Clear localStorage**
- Open DevTools → Application → Local Storage
- Delete `currentUser` key
- Refresh page

**What happens during login:**
1. Backend fetches user from database
2. Populates `roleRef` with latest permissions from Role document
3. Returns user object with nested `roleRef.permissions` array
4. Frontend stores in localStorage
5. PermissionService reads permissions from `roleRef`
6. Header component checks permissions and shows/hides navigation items
7. Permission directives control button visibility

### Automatic Permission Reload

The system now automatically reloads permissions when user logs in:
- `AuthService.setSession()` triggers `currentUser$` observable
- `HeaderComponent` subscribes to `currentUser$` changes
- Calls `permissionService.reloadPermissions()` on user change
- Navigation updates immediately without refresh

### Troubleshooting Permission Issues

**Navigation items don't appear after login:**

1. Check browser console for permission logs:
```
✅ User logged in: user@example.com
📋 Permissions loaded: 21
✅ Loaded user permissions: [array of permissions]
```

2. Verify backend response includes `roleRef`:
   - Open DevTools → Network tab
   - Look for `/auth/google` request
   - Check response includes `user.roleRef.permissions`

3. Check if migration ran successfully:
```bash
# You should see output like:
✓ Created role: assistant (21 permissions)
✓ Migration completed successfully
```

**Still seeing old permissions:**
- Logout and login again
- Clear browser cache and localStorage
- Verify migration script ran without errors
