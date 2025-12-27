import { Component, AfterViewInit, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import { AuthService, User } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { ToastService } from '../../services/toast.service';

declare var $: any;

@Component({
  selector: 'app-header',
  imports: [RouterLink, CommonModule, NgOptimizedImage],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements AfterViewInit, OnInit {
  currentUser: User | null = null;
  isAuthenticated = false;
  profileImageLoadError = false;

  // Permission flags for navigation items
  hasSoilTestingAccess = false;
  hasWaterTestingAccess = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private permissionService: PermissionService,
    private confirmationService: ConfirmationModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    // Subscribe to current user changes
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.isAuthenticated = !!user;
      this.profileImageLoadError = false; // Reset error state on user change

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

  /**
   * Update permission flags based on user's permissions
   */
  private updatePermissions(): void {
    if (!this.isAuthenticated) {
      this.hasSoilTestingAccess = false;
      this.hasWaterTestingAccess = false;
      return;
    }

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
        },
        error: (error) => {
          // Still navigate to login even if logout API fails
          this.toastService.show('Logged out locally', 'info');
          this.router.navigate(['/login']);
        }
      });
    }
  }

  ngAfterViewInit(): void {
    // Manual toggle for mobile menu
    setTimeout(() => {
      const toggler = document.querySelector('.navbar-toggler') as HTMLElement;
      const menu = document.querySelector('#navbarSupportedContent') as HTMLElement;

      if (toggler && menu) {
        // Prevent default behavior and ensure toggle works
        toggler.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const isExpanded = toggler.getAttribute('aria-expanded') === 'true';
          toggler.setAttribute('aria-expanded', (!isExpanded).toString());
          menu.classList.toggle('show');
        });

        // Close menu when clicking on nav links
        const navLinks = menu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
          link.addEventListener('click', () => {
            menu.classList.remove('show');
            toggler.setAttribute('aria-expanded', 'false');
          });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (!menu.contains(target) && !toggler.contains(target)) {
            menu.classList.remove('show');
            toggler.setAttribute('aria-expanded', 'false');
          }
        });
      }
    }, 100);
  }

  onProfileImageError(): void {
    this.profileImageLoadError = true;
  }

}
