import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface RoleSelectionOptions {
  title: string;
  userName: string;
  currentRole: string;
  availableRoles: Array<{
    name: string;
    displayName: string;
    description?: string;
  }>;
}

@Component({
  selector: 'app-role-selection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-selection-modal.component.html',
  styleUrls: ['./role-selection-modal.component.css']
})
export class RoleSelectionModalComponent {
  isVisible = false;
  selectedRole = '';
  options: RoleSelectionOptions | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  show(options: RoleSelectionOptions): Promise<string | null> {
    this.options = options;
    this.selectedRole = options.currentRole;
    this.isVisible = true;

    return new Promise<string | null>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  confirm(): void {
    if (this.resolvePromise) {
      this.resolvePromise(this.selectedRole);
    }
    this.close();
  }

  cancel(): void {
    if (this.resolvePromise) {
      this.resolvePromise(null);
    }
    this.close();
  }

  private close(): void {
    this.isVisible = false;
    this.options = null;
    this.selectedRole = '';
    this.resolvePromise = null;
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
}
