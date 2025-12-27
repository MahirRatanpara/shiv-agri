import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PermissionService, Role, Permission } from '../../../services/permission.service';
import { ToastService } from '../../../services/toast.service';
import { HasPermissionDirective } from '../../../directives/has-permission.directive';

interface RoleFormData {
  name: string;
  displayName: string;
  description: string;
  selectedPermissions: string[];
  color: string;
  icon: string;
  priority: number;
}

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  templateUrl: './role-management.component.html',
  styleUrls: ['./role-management.component.css']
})
export class RoleManagementComponent implements OnInit {
  roles: Role[] = [];
  permissions: Permission[] = [];
  groupedPermissions: Record<string, Permission[]> = {};

  loading = false;
  showCreateModal = false;
  showEditModal = false;
  showDeleteModal = false;
  showPermissionsModal = false;

  selectedRole: Role | null = null;
  roleToDelete: Role | null = null;

  // Form data
  roleForm: RoleFormData = {
    name: '',
    displayName: '',
    description: '',
    selectedPermissions: [],
    color: '#6366f1',
    icon: 'user',
    priority: 100
  };

  // Filter and search
  searchTerm = '';
  filterByActive = true;

  constructor(
    private permissionService: PermissionService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadRoles();
    this.loadPermissions();
  }

  /**
   * Load all roles
   */
  loadRoles(): void {
    this.loading = true;
    this.permissionService.getAllRoles({
      includeInactive: !this.filterByActive,
      includePermissions: true
    }).subscribe({
      next: (response) => {
        this.roles = response.roles;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading roles:', error);
        this.toastService.show('Failed to load roles', 'error');
        this.loading = false;
      }
    });
  }

  /**
   * Load all permissions
   */
  loadPermissions(): void {
    this.permissionService.getAllPermissions().subscribe({
      next: (response) => {
        this.permissions = response.permissions;
        this.groupedPermissions = response.groupedByResource;
      },
      error: (error) => {
        console.error('Error loading permissions:', error);
        this.toastService.show('Failed to load permissions', 'error');
      }
    });
  }

  /**
   * Get filtered roles based on search term
   */
  get filteredRoles(): Role[] {
    if (!this.searchTerm) {
      return this.roles;
    }

    const term = this.searchTerm.toLowerCase();
    return this.roles.filter(role =>
      role.name.toLowerCase().includes(term) ||
      role.displayName.toLowerCase().includes(term) ||
      role.description.toLowerCase().includes(term)
    );
  }

  /**
   * Open create role modal
   */
  openCreateModal(): void {
    this.resetForm();
    this.showCreateModal = true;
  }

  /**
   * Open edit role modal
   */
  openEditModal(role: Role): void {
    this.selectedRole = role;
    this.roleForm = {
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      selectedPermissions: role.permissions.map(p => p.id),
      color: role.color || '#6366f1',
      icon: role.icon || 'user',
      priority: role.priority || 100
    };
    this.showEditModal = true;
  }

  /**
   * Open permissions view modal
   */
  openPermissionsModal(role: Role): void {
    this.selectedRole = role;
    this.showPermissionsModal = true;
  }

  /**
   * Open delete confirmation modal
   */
  openDeleteModal(role: Role): void {
    this.roleToDelete = role;
    this.showDeleteModal = true;
  }

  /**
   * Create new role
   */
  createRole(): void {
    if (!this.validateForm()) {
      return;
    }

    this.loading = true;
    this.permissionService.createRole({
      name: this.roleForm.name,
      displayName: this.roleForm.displayName,
      description: this.roleForm.description,
      permissions: this.roleForm.selectedPermissions,
      metadata: {
        color: this.roleForm.color,
        icon: this.roleForm.icon,
        priority: this.roleForm.priority
      }
    }).subscribe({
      next: (response) => {
        this.toastService.show(response.message, 'success');
        this.closeModal();
        this.loadRoles();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error creating role:', error);
        this.toastService.show(
          error.error?.error || 'Failed to create role',
          'error'
        );
        this.loading = false;
      }
    });
  }

  /**
   * Update existing role
   */
  updateRole(): void {
    if (!this.selectedRole || !this.validateForm()) {
      return;
    }

    this.loading = true;
    this.permissionService.updateRole(this.selectedRole.id, {
      displayName: this.roleForm.displayName,
      description: this.roleForm.description,
      permissions: this.roleForm.selectedPermissions,
      metadata: {
        color: this.roleForm.color,
        icon: this.roleForm.icon,
        priority: this.roleForm.priority
      }
    }).subscribe({
      next: (response) => {
        this.toastService.show(
          `${response.message}. ${response.usersUpdated} users updated.`,
          'success'
        );
        this.closeModal();
        this.loadRoles();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error updating role:', error);
        this.toastService.show(
          error.error?.error || 'Failed to update role',
          'error'
        );
        this.loading = false;
      }
    });
  }

  /**
   * Delete role
   */
  deleteRole(): void {
    if (!this.roleToDelete) {
      return;
    }

    this.loading = true;
    this.permissionService.deleteRole(this.roleToDelete.id).subscribe({
      next: (response) => {
        this.toastService.show(response.message, 'success');
        this.closeModal();
        this.loadRoles();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error deleting role:', error);
        this.toastService.show(
          error.error?.error || error.error?.message || 'Failed to delete role',
          'error'
        );
        this.loading = false;
      }
    });
  }

  /**
   * Toggle permission selection
   */
  togglePermission(permissionId: string): void {
    const index = this.roleForm.selectedPermissions.indexOf(permissionId);
    if (index > -1) {
      this.roleForm.selectedPermissions.splice(index, 1);
    } else {
      this.roleForm.selectedPermissions.push(permissionId);
    }
  }

  /**
   * Check if permission is selected
   */
  isPermissionSelected(permissionId: string): boolean {
    return this.roleForm.selectedPermissions.includes(permissionId);
  }

  /**
   * Select all permissions in a resource group
   */
  toggleResourceGroup(resource: string): void {
    const groupPermissions = this.groupedPermissions[resource];
    if (!groupPermissions) return;

    const allSelected = groupPermissions.every(p =>
      this.isPermissionSelected(p.id)
    );

    if (allSelected) {
      // Deselect all
      groupPermissions.forEach(p => {
        const index = this.roleForm.selectedPermissions.indexOf(p.id);
        if (index > -1) {
          this.roleForm.selectedPermissions.splice(index, 1);
        }
      });
    } else {
      // Select all
      groupPermissions.forEach(p => {
        if (!this.isPermissionSelected(p.id)) {
          this.roleForm.selectedPermissions.push(p.id);
        }
      });
    }
  }

  /**
   * Check if all permissions in a resource group are selected
   */
  isResourceGroupSelected(resource: string): boolean {
    const groupPermissions = this.groupedPermissions[resource];
    if (!groupPermissions) return false;

    return groupPermissions.every(p => this.isPermissionSelected(p.id));
  }

  /**
   * Validate form data
   */
  validateForm(): boolean {
    if (!this.roleForm.displayName || !this.roleForm.description) {
      this.toastService.show('Please fill in all required fields', 'error');
      return false;
    }

    if (this.showCreateModal && !this.roleForm.name) {
      this.toastService.show('Role name is required', 'error');
      return false;
    }

    if (this.roleForm.selectedPermissions.length === 0) {
      this.toastService.show('Please select at least one permission', 'error');
      return false;
    }

    return true;
  }

  /**
   * Reset form
   */
  resetForm(): void {
    this.roleForm = {
      name: '',
      displayName: '',
      description: '',
      selectedPermissions: [],
      color: '#6366f1',
      icon: 'user',
      priority: 100
    };
  }

  /**
   * Close all modals
   */
  closeModal(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.showDeleteModal = false;
    this.showPermissionsModal = false;
    this.selectedRole = null;
    this.roleToDelete = null;
    this.resetForm();
  }

  /**
   * Get object keys for template iteration
   */
  objectKeys(obj: any): string[] {
    return Object.keys(obj);
  }
}
