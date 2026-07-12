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
  metadata?: {
    phoneCountryCode?: string;
    phoneNumber?: string;
    phoneNumberNormalized?: string;
  };
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

  // Inline identity edit (admin-only). Tracks the currently-expanded row
  // and a draft of its fields so canceling discards changes cleanly.
  editingUserId: string | null = null;
  identityDraft: {
    name: string;
    email: string;
    phone: string;
    phoneCountryCode: string;
  } = { name: '', email: '', phone: '', phoneCountryCode: '+91' };
  isSavingIdentity = false;
  readonly countryCodeOptions: Array<{ label: string; value: string }> = [
    { label: 'India (+91)', value: '+91' },
    { label: 'US/Canada (+1)', value: '+1' },
    { label: 'UK (+44)', value: '+44' },
    { label: 'UAE (+971)', value: '+971' },
    { label: 'Australia (+61)', value: '+61' }
  ];

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

  // ========================
  // Inline identity edit (admin-only)
  // ========================

  /** Open the inline edit row for a user. Pre-fills the draft with the
   *  user's current name / email / phone. Closes any other open edit. */
  startIdentityEdit(user: User): void {
    this.editingUserId = user._id;
    const phoneRaw = (user.metadata?.phoneNumber || '').trim();
    const { countryCode, localNumber } = this.splitPhoneNumber(
      phoneRaw,
      user.metadata?.phoneCountryCode
    );
    this.identityDraft = {
      name: user.name || '',
      email: user.email || '',
      phone: localNumber,
      phoneCountryCode: countryCode
    };
  }

  cancelIdentityEdit(): void {
    this.editingUserId = null;
    this.isSavingIdentity = false;
  }

  isEditingIdentity(user: User): boolean {
    return this.editingUserId === user._id;
  }

  saveIdentity(user: User): void {
    if (this.isSavingIdentity) return;
    const draft = this.identityDraft;

    const trimmedEmail = draft.email.trim();
    const trimmedPhone = draft.phone.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      this.toastService.show('Enter a valid email address (or leave blank).', 'warning');
      return;
    }
    if (trimmedPhone && trimmedPhone.replace(/\D/g, '').length < 10) {
      this.toastService.show('Phone number must have at least 10 digits.', 'warning');
      return;
    }

    // Build payload — only send fields that actually changed, so an admin
    // editing just the email doesn't accidentally clear the phone.
    const payload: { name?: string; email?: string | null; phone?: string | null; phoneCountryCode?: string } = {};
    if (draft.name.trim() !== (user.name || '').trim()) {
      payload.name = draft.name.trim();
    }
    if (trimmedEmail !== (user.email || '').trim()) {
      payload.email = trimmedEmail; // '' clears, server understands.
    }
    const currentPhone = (user.metadata?.phoneNumber || '').trim();
    const currentCc = (user.metadata?.phoneCountryCode || '').trim();
    if (trimmedPhone !== currentPhone || draft.phoneCountryCode !== currentCc) {
      payload.phone = trimmedPhone;
      payload.phoneCountryCode = draft.phoneCountryCode;
    }

    if (!Object.keys(payload).length) {
      this.toastService.show('No changes to save.', 'info');
      this.cancelIdentityEdit();
      return;
    }

    this.isSavingIdentity = true;
    this.userService.updateUserIdentity(user._id, payload).subscribe({
      next: (response) => {
        const updated = response.projectsUpdated || 0;
        const suffix = updated > 0
          ? ` ${updated} project${updated === 1 ? '' : 's'} re-synced.`
          : '';
        this.toastService.show(`Updated identity for ${user.name}.${suffix}`, 'success');
        this.isSavingIdentity = false;
        this.editingUserId = null;
        this.loadUsers();
      },
      error: (error) => {
        this.isSavingIdentity = false;
        const status = error?.status;
        const msg = error?.error?.error || error?.error?.message;
        if (status === 409) {
          this.toastService.show(msg || 'That email or phone is already linked to another account.', 'error');
        } else {
          this.toastService.show(msg || 'Failed to update user identity.', 'error');
        }
      }
    });
  }

  /** Split a stored phone string into country code + local number, used
   *  to populate the inline edit form. */
  private splitPhoneNumber(phoneNumber: string, savedCountryCode?: string): { countryCode: string; localNumber: string } {
    const trimmed = (phoneNumber || '').trim();
    if (!trimmed) {
      return { countryCode: savedCountryCode || '+91', localNumber: '' };
    }
    const matchedCode = savedCountryCode ||
      this.countryCodeOptions
        .map((option) => option.value)
        .sort((a, b) => b.length - a.length)
        .find((code) => trimmed.startsWith(code));
    const countryCode = matchedCode || '+91';
    const localNumber = trimmed.startsWith(countryCode)
      ? trimmed.slice(countryCode.length).trim()
      : trimmed;
    return { countryCode, localNumber };
  }

  /** Format the user's phone for the table column. */
  formatUserPhone(user: User): string {
    const phone = user.metadata?.phoneNumber;
    if (!phone) return '—';
    return phone;
  }
}
