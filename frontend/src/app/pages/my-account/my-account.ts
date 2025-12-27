import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-account.html',
  styleUrl: './my-account.css',
})
export class MyAccountComponent implements OnInit {
  user: User | null = null;
  isLoading = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private confirmationService: ConfirmationModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
    });
  }

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
      this.isLoading = true;
      this.authService.logout().subscribe({
        next: () => {
          this.isLoading = false;
          this.toastService.show('You have been logged out successfully', 'success');
          this.router.navigate(['/login']);
        },
        error: (error) => {
          this.isLoading = false;
          // Still redirect to login even if API call fails
          this.toastService.show('Logged out locally', 'info');
          this.router.navigate(['/login']);
        }
      });
    }
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'badge-admin';
      case 'assistant':
        return 'badge-assistant';
      default:
        return 'badge-user';
    }
  }
}
