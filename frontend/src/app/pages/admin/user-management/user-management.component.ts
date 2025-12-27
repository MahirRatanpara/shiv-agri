import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { PermissionService, Role } from '../../../services/permission.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmationModalService } from '../../../services/confirmation-modal.service';
import { RoleSelectionModalComponent } from '../../../components/role-selection-modal/role-selection-modal.component';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  profilePhoto?: string;
  roleRef?: {
    name: string;
    displayName: string;
  };
  createdAt: Date;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RoleSelectionModalComponent],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {
  @ViewChild(RoleSelectionModalComponent) roleSelectionModal!: RoleSelectionModalComponent;

  users: User[] = [];
  roles: Role[] = [];
  isLoading = false;
  searchQuery = '';
  selectedRole = '';

  // Pagination
  currentPage = 1;
  totalPages = 1;
  totalUsers = 0;

  constructor(
    private userService: UserService,
    private permissionService: PermissionService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadRoles();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.userService.getAllUsers({
      page: this.currentPage,
      search: this.searchQuery,
      role: this.selectedRole
    }).subscribe({
      next: (response) => {
        this.users = response.users;
        this.totalUsers = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.isLoading = false;
      },
      error: (error) => {
        this.toastService.show('Failed to load users', 'error');
        this.isLoading = false;
      }
    });
  }

  loadRoles(): void {
    this.permissionService.getAllRoles({ includeInactive: false }).subscribe({
      next: (response) => {
        this.roles = response.roles;
      },
      error: (error) => {
        this.toastService.show('Failed to load roles', 'error');
      }
    });
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  onRoleFilterChange(): void {
    this.currentPage = 1;
    this.loadUsers();
  }

  async changeUserRole(user: User): Promise<void> {
    // Show role selection modal
    const selectedRole = await this.roleSelectionModal.show({
      title: 'Change User Role',
      userName: user.name,
      currentRole: user.role,
      availableRoles: this.roles.map(role => ({
        name: role.name,
        displayName: role.displayName,
        description: role.description
      }))
    });

    if (!selectedRole || selectedRole === user.role) {
      return;
    }

    // Confirm the change
    const confirmed = await this.confirmationService.confirm({
      title: 'Confirm Role Change',
      message: `Are you sure you want to change ${user.name}'s role? This will immediately update their permissions.`,
      confirmText: 'Yes, Change Role',
      cancelText: 'Cancel',
      confirmClass: 'btn-primary',
      icon: 'fas fa-user-tag'
    });

    if (!confirmed) {
      return;
    }

    this.userService.updateUserRole(user._id, selectedRole).subscribe({
      next: (response) => {
        this.toastService.show(`${user.name}'s role updated to ${response.role.displayName}`, 'success');
        this.loadUsers();
      },
      error: (error) => {
        this.toastService.show('Failed to update user role', 'error');
      }
    });
  }

  async deleteUser(user: User): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: 'Delete User',
      message: `Are you sure you want to delete ${user.name}? This action cannot be undone.`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash-alt'
    });

    if (!confirmed) {
      return;
    }

    this.userService.deleteUser(user._id).subscribe({
      next: (response) => {
        this.toastService.show(`User ${user.name} deleted successfully`, 'success');
        this.loadUsers();
      },
      error: (error) => {
        this.toastService.show(error.error?.error || 'Failed to delete user', 'error');
      }
    });
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'badge-admin';
      case 'assistant':
        return 'badge-assistant';
      case 'viewer':
        return 'badge-viewer';
      default:
        return 'badge-user';
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadUsers();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadUsers();
    }
  }
}
