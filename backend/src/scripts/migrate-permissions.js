#!/usr/bin/env node

/**
 * Permission and Role Migration Script
 *
 * This script synchronizes permissions and roles from the YAML configuration
 * to the MongoDB database. It can be run multiple times safely (idempotent).
 *
 * Usage:
 *   node migrate-permissions.js [--dry-run] [--force]
 *
 * Options:
 *   --dry-run: Preview changes without applying them
 *   --force: Force update of system roles (use with caution)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Permission = require('../models/Permission');
const Role = require('../models/Role');
const User = require('../models/User');

// Configuration
const CONFIG_PATH = path.join(__dirname, '../config/permissions.yml');
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_UPDATE = process.argv.includes('--force');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Logging utilities
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
  subheader: (msg) => console.log(`${colors.cyan}${msg}${colors.reset}`),
  data: (msg) => console.log(`  ${colors.dim}${msg}${colors.reset}`)
};

// Statistics
const stats = {
  permissions: { created: 0, updated: 0, unchanged: 0, errors: 0 },
  roles: { created: 0, updated: 0, unchanged: 0, errors: 0 },
  users: { updated: 0, errors: 0 }
};

/**
 * Load and parse YAML configuration
 */
function loadConfig() {
  try {
    log.info(`Loading configuration from ${CONFIG_PATH}`);
    const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = yaml.load(fileContents);

    if (!config.permissions || !Array.isArray(config.permissions)) {
      throw new Error('Invalid config: missing or invalid permissions array');
    }

    if (!config.roles || !Array.isArray(config.roles)) {
      throw new Error('Invalid config: missing or invalid roles array');
    }

    log.success(`Loaded ${config.permissions.length} permissions and ${config.roles.length} roles`);
    return config;
  } catch (error) {
    log.error(`Failed to load configuration: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shiv-agri';
    log.info(`Connecting to MongoDB... at ${mongoUri}`);

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    log.success('Connected to MongoDB');
  } catch (error) {
    log.error(`Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Determine permission category based on resource
 */
function determineCategory(resource) {
  const categoryMap = {
    'users': 'user-management',
    'roles': 'user-management',
    'permissions': 'user-management',
    'soil-sessions': 'testing',
    'soil-samples': 'testing',
    'soil-reports': 'testing',
    'water-sessions': 'testing',
    'water-samples': 'testing',
    'water-reports': 'testing',
    'projects': 'projects',
    'farms': 'projects',
    'billing': 'billing',
    'files': 'files',
    'reports': 'reports',
    'system-settings': 'system',
    'system-logs': 'system'
  };

  return categoryMap[resource] || 'other';
}

/**
 * Sync permissions from config to database
 */
async function syncPermissions(permissionsConfig) {
  log.header('📋 Syncing Permissions');

  const permissionMap = new Map(); // name -> ObjectId mapping

  for (const permConfig of permissionsConfig) {
    try {
      const { name, resource, action, description } = permConfig;

      if (DRY_RUN) {
        log.data(`Would process permission: ${name}`);
        permissionMap.set(name, null);
        continue;
      }

      // Find existing permission
      let permission = await Permission.findOne({ name });

      if (permission) {
        // Update existing permission
        let hasChanges = false;

        if (permission.resource !== resource) {
          permission.resource = resource;
          hasChanges = true;
        }

        if (permission.action !== action) {
          permission.action = action;
          hasChanges = true;
        }

        if (permission.description !== description) {
          permission.description = description;
          hasChanges = true;
        }

        const category = determineCategory(resource);
        if (permission.metadata?.category !== category) {
          permission.metadata = { ...permission.metadata, category };
          hasChanges = true;
        }

        if (hasChanges) {
          await permission.save();
          log.success(`Updated permission: ${name}`);
          stats.permissions.updated++;
        } else {
          log.data(`Permission unchanged: ${name}`);
          stats.permissions.unchanged++;
        }
      } else {
        // Create new permission
        permission = new Permission({
          name,
          resource,
          action,
          description,
          metadata: {
            category: determineCategory(resource),
            tags: []
          }
        });

        await permission.save();
        log.success(`Created permission: ${name}`);
        stats.permissions.created++;
      }

      permissionMap.set(name, permission._id);

    } catch (error) {
      log.error(`Failed to process permission ${permConfig.name}: ${error.message}`);
      stats.permissions.errors++;
    }
  }

  return permissionMap;
}

/**
 * Sync roles from config to database
 */
async function syncRoles(rolesConfig, permissionMap) {
  log.header('👥 Syncing Roles');

  const roleMap = new Map(); // name -> ObjectId mapping

  for (const roleConfig of rolesConfig) {
    try {
      const { name, displayName, description, permissions, isSystem } = roleConfig;

      // Resolve permission names to ObjectIds
      const permissionIds = permissions
        .map(permName => permissionMap.get(permName))
        .filter(id => id != null);

      if (permissionIds.length !== permissions.length && !DRY_RUN) {
        const missing = permissions.filter(p => !permissionMap.has(p));
        log.warning(`Role ${name} references unknown permissions: ${missing.join(', ')}`);
      }

      if (DRY_RUN) {
        log.data(`Would process role: ${name} (${permissionIds.length} permissions)`);
        continue;
      }

      // Find existing role
      let role = await Role.findOne({ name });

      if (role) {
        // Check if we can update system roles
        if (role.isSystem && !FORCE_UPDATE) {
          log.warning(`Skipping system role: ${name} (use --force to update)`);
          roleMap.set(name, role._id);
          stats.roles.unchanged++;
          continue;
        }

        // Update existing role
        let hasChanges = false;

        if (role.displayName !== displayName) {
          role.displayName = displayName;
          hasChanges = true;
        }

        if (role.description !== description) {
          role.description = description;
          hasChanges = true;
        }

        // Update permissions (always update to match config)
        const currentPermissions = role.permissions.map(p => p.toString()).sort();
        const newPermissions = permissionIds.map(p => p.toString()).sort();

        if (JSON.stringify(currentPermissions) !== JSON.stringify(newPermissions)) {
          role.permissions = permissionIds;
          hasChanges = true;
        }

        if (hasChanges) {
          await role.save();
          log.success(`Updated role: ${name} (${permissionIds.length} permissions)`);
          stats.roles.updated++;
        } else {
          log.data(`Role unchanged: ${name}`);
          stats.roles.unchanged++;
        }
      } else {
        // Create new role
        const priorityMap = {
          'admin': 1,
          'manager': 2,
          'lab_technician': 3,
          'assistant': 4,
          'user': 5
        };

        role = new Role({
          name,
          displayName,
          description,
          permissions: permissionIds,
          isSystem: isSystem || false,
          metadata: {
            priority: priorityMap[name] || 100,
            color: '#6366f1',
            icon: 'user'
          }
        });

        await role.save();
        log.success(`Created role: ${name} (${permissionIds.length} permissions)`);
        stats.roles.created++;
      }

      roleMap.set(name, role._id);

    } catch (error) {
      log.error(`Failed to process role ${roleConfig.name}: ${error.message}`);
      stats.roles.errors++;
    }
  }

  return roleMap;
}

/**
 * Sync user permissions based on their roles
 */
async function syncUserPermissions(roleMap) {
  log.header('👤 Syncing User Permissions');

  if (DRY_RUN) {
    log.data('Would sync user permissions based on roles');
    return;
  }

  try {
    // Get all users
    const users = await User.find({});
    log.info(`Found ${users.length} users`);

    for (const user of users) {
      try {
        const roleId = roleMap.get(user.role);

        if (!roleId) {
          log.warning(`User ${user.email} has unknown role: ${user.role}`);
          stats.users.errors++;
          continue;
        }

        // Get role with permissions
        const role = await Role.findById(roleId).populate('permissions');

        if (!role) {
          log.warning(`Role not found for user ${user.email}`);
          stats.users.errors++;
          continue;
        }

        // Update user's roleRef only (permissions come from role)
        let hasChanges = false;

        if (!user.roleRef || user.roleRef.toString() !== roleId.toString()) {
          user.roleRef = roleId;
          hasChanges = true;
        }

        if (hasChanges) {
          await user.save();
          log.success(`Updated user: ${user.email} (${user.role})`);
          stats.users.updated++;
        }

      } catch (error) {
        log.error(`Failed to update user ${user.email}: ${error.message}`);
        stats.users.errors++;
      }
    }

  } catch (error) {
    log.error(`Failed to sync user permissions: ${error.message}`);
  }
}

/**
 * Print summary statistics
 */
function printSummary() {
  log.header('📊 Migration Summary');

  if (DRY_RUN) {
    log.warning('DRY RUN MODE - No changes were made to the database');
  }

  console.log('\nPermissions:');
  log.success(`  Created: ${stats.permissions.created}`);
  log.info(`  Updated: ${stats.permissions.updated}`);
  log.data(`  Unchanged: ${stats.permissions.unchanged}`);
  if (stats.permissions.errors > 0) {
    log.error(`  Errors: ${stats.permissions.errors}`);
  }

  console.log('\nRoles:');
  log.success(`  Created: ${stats.roles.created}`);
  log.info(`  Updated: ${stats.roles.updated}`);
  log.data(`  Unchanged: ${stats.roles.unchanged}`);
  if (stats.roles.errors > 0) {
    log.error(`  Errors: ${stats.roles.errors}`);
  }

  if (!DRY_RUN) {
    console.log('\nUsers:');
    log.success(`  Updated: ${stats.users.updated}`);
    if (stats.users.errors > 0) {
      log.error(`  Errors: ${stats.users.errors}`);
    }
  }

  console.log('');
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    log.header('🚀 Starting Permission & Role Migration');

    if (DRY_RUN) {
      log.warning('Running in DRY RUN mode - no changes will be made');
    }

    if (FORCE_UPDATE) {
      log.warning('FORCE UPDATE enabled - system roles will be updated');
    }

    // Load configuration
    const config = loadConfig();

    // Connect to database
    await connectDB();

    // Sync permissions
    const permissionMap = await syncPermissions(config.permissions);

    // Sync roles
    const roleMap = await syncRoles(config.roles, permissionMap);

    // Sync user permissions
    await syncUserPermissions(roleMap);

    // Print summary
    printSummary();

    log.success('Migration completed successfully');

  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
