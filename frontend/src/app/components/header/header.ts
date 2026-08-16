import { Component, AfterViewInit, HostListener, OnInit } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import { AuthService, User } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { ToastService } from '../../services/toast.service';
import { NotificationBellComponent } from './notification-bell/notification-bell';

declare var $: any;

@Component({
  selector: 'app-header',
  imports: [RouterLink, CommonModule, NgOptimizedImage, NotificationBellComponent],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements AfterViewInit, OnInit {
  currentUser: User | null = null;
  isAuthenticated = false;
  profileImageLoadError = false;
  isAdminMenuOpen = false;

  // Permission flags for navigation items
  hasLabTestingAccess = false;
  hasManagerialWorkAccess = false;
  hasFarmDashboardAccess = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private permissionService: PermissionService,
    private confirmationService: ConfirmationModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    // Collapse the mobile menu on every completed navigation.
    //
    // This replaces per-link click listeners attached once in ngAfterViewInit:
    // those were bound to whichever .nav-link elements existed at that moment, so
    // links rendered later by *ngIf (Lab, Farms, Managerial Work, the Admin
    // submenu — all permission-gated) never got a listener and left the menu open.
    // Reacting to the router covers every link, now and later, plus programmatic
    // navigation.
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.closeMobileMenu());

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
      this.hasLabTestingAccess = false;
      this.hasManagerialWorkAccess = false;
      this.hasFarmDashboardAccess = false;
      return;
    }

    // Check if user has ANY lab testing related permission (soil or water)
    this.hasLabTestingAccess = this.permissionService.hasAnyPermission([
      'soil.sessions.view',
      'soil.sessions.create',
      'soil.sessions.update',
      'soil.samples.view',
      'soil.samples.create',
      'soil.reports.download',
      'water.sessions.view',
      'water.sessions.create',
      'water.sessions.update',
      'water.samples.view',
      'water.samples.create',
      'water.reports.download'
    ]);

    // Check if user has ANY managerial work related permission
    this.hasManagerialWorkAccess = this.permissionService.hasAnyPermission([
      'managerial.receipts.view',
      'managerial.invoices.view',
      'managerial.letters.view'
    ]);

    // Check if user has ANY farm management dashboard related permission
    this.hasFarmDashboardAccess = this.permissionService.hasAnyPermission([
      'farm.dashboard.view',
      'farms.view',
      'farm.projects.view',
      'farm.visits.view',
      'farm.expenses.view',
      'farm.budget.view',
      'farm.activities.view'
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

  /** Collapse the mobile nav, wherever it was opened from. */
  private closeMobileMenu(): void {
    const menu = document.querySelector('#navbarSupportedContent');
    const toggler = document.querySelector('.navbar-toggler');
    menu?.classList.remove('show');
    toggler?.setAttribute('aria-expanded', 'false');
    this.closeAdminMenu();
  }

  onProfileImageError(): void {
    this.profileImageLoadError = true;
  }

  /**
   * Opens/closes the Admin submenu.
   *
   * stopImmediatePropagation is deliberate: ngAfterViewInit attaches a raw listener to
   * every .nav-link that collapses the mobile menu. Without this the toggle would close
   * the whole menu instead of revealing the submenu. Angular's binding is registered at
   * element creation, so it runs first and suppresses that listener.
   */
  toggleAdminMenu(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.isAdminMenuOpen = !this.isAdminMenuOpen;
  }

  closeAdminMenu(): void {
    this.isAdminMenuOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    // The toggle stops propagation, so this only fires for clicks elsewhere.
    this.closeAdminMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeAdminMenu();
  }
}
