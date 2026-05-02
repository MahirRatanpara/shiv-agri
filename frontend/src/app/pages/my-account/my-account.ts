import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-account.html',
  styleUrl: './my-account.css',
})
export class MyAccountComponent implements OnInit {
  user: User | null = null;
  isLoading = false;
  isSavingProfile = false;
  isEditingProfile = false;
  phoneCountryCode = '+91';
  phoneNumber = '';
  profileError = '';
  profileImageLoadError = false;
  countryCodeOptions = [
    { label: 'India (+91)', value: '+91' },
    { label: 'US/Canada (+1)', value: '+1' },
    { label: 'UK (+44)', value: '+44' },
    { label: 'UAE (+971)', value: '+971' },
    { label: 'Australia (+61)', value: '+61' }
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    private confirmationService: ConfirmationModalService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      const phoneParts = this.splitPhoneNumber(user?.phoneNumber || '', user?.phoneCountryCode);
      this.phoneCountryCode = phoneParts.countryCode;
      this.phoneNumber = phoneParts.localNumber;
      this.profileImageLoadError = false; // Reset error state on user change
    });
  }

  get showPhoneProfileEditor(): boolean {
    return this.user?.role !== 'admin';
  }

  startProfileEdit(): void {
    this.profileError = '';
    const phoneParts = this.splitPhoneNumber(this.user?.phoneNumber || '', this.user?.phoneCountryCode);
    this.phoneCountryCode = phoneParts.countryCode;
    this.phoneNumber = phoneParts.localNumber;
    this.isEditingProfile = true;
  }

  cancelProfileEdit(): void {
    this.profileError = '';
    const phoneParts = this.splitPhoneNumber(this.user?.phoneNumber || '', this.user?.phoneCountryCode);
    this.phoneCountryCode = phoneParts.countryCode;
    this.phoneNumber = phoneParts.localNumber;
    this.isEditingProfile = false;
  }

  saveProfile(): void {
    const phoneNumber = this.phoneNumber.trim();

    if (!phoneNumber) {
      this.profileError = 'Mobile number is required for farm registration.';
      return;
    }

    this.profileError = '';
    this.isSavingProfile = true;

    this.authService.updateProfile({ phoneCountryCode: this.phoneCountryCode, phoneNumber }).subscribe({
      next: () => {
        this.isSavingProfile = false;
        this.isEditingProfile = false;
        this.toastService.success('Mobile number updated.');
      },
      error: (error) => {
        this.isSavingProfile = false;
        this.profileError = error?.error?.error || 'Unable to update mobile number.';
      }
    });
  }

  private splitPhoneNumber(phoneNumber: string, savedCountryCode?: string): { countryCode: string; localNumber: string } {
    const matchedCode = savedCountryCode ||
      this.countryCodeOptions
        .map((option) => option.value)
        .sort((a, b) => b.length - a.length)
        .find((code) => phoneNumber.trim().startsWith(code));
    const countryCode = matchedCode || '+91';
    const localNumber = phoneNumber.trim().startsWith(countryCode)
      ? phoneNumber.trim().slice(countryCode.length).trim()
      : phoneNumber.trim();

    return { countryCode, localNumber };
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

  onProfileImageError(): void {
    this.profileImageLoadError = true;
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
