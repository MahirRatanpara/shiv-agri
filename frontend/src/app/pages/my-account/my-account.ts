import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { ToastService } from '../../services/toast.service';

type PhoneOtpStep = 'idle' | 'enter-phone' | 'enter-otp';

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
  profileImageLoadError = false;

  // Phone-attach (OTP) flow — a number can only be ADDED, never edited once set.
  readonly OTP_LENGTH = 4;
  phoneOtpStep: PhoneOtpStep = 'idle';
  phoneCountryCode = '+91';
  phoneNumber = '';
  otpCode = '';
  isSubmittingPhone = false;
  phoneError = '';
  resendCountdown = 0;
  private resendTimer: any = null;

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
      this.profileImageLoadError = false;
    });
  }

  /** A phone can be added only when none exists yet. Once set it is locked for users. */
  get canAddPhone(): boolean {
    return !this.user?.phoneNumber;
  }

  get isPhoneNumberValid(): boolean {
    return /^\d{7,12}$/.test(this.phoneNumber);
  }

  get isOtpValid(): boolean {
    return new RegExp(`^\\d{${this.OTP_LENGTH}}$`).test(this.otpCode);
  }

  startAddPhone(): void {
    this.phoneError = '';
    this.phoneNumber = '';
    this.otpCode = '';
    this.phoneOtpStep = 'enter-phone';
  }

  cancelAddPhone(): void {
    this.phoneError = '';
    this.phoneNumber = '';
    this.otpCode = '';
    this.phoneOtpStep = 'idle';
    this.clearResendTimer();
  }

  onPhoneInput(event: Event): void {
    this.phoneNumber = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12);
  }

  onOtpInput(event: Event): void {
    this.otpCode = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, this.OTP_LENGTH);
  }

  requestPhoneOtp(): void {
    if (!this.isPhoneNumberValid || this.isSubmittingPhone) return;

    this.phoneError = '';
    this.isSubmittingPhone = true;

    this.authService.requestProfilePhoneOtp(this.phoneCountryCode, this.phoneNumber).subscribe({
      next: (res) => {
        this.isSubmittingPhone = false;
        this.otpCode = '';
        this.phoneOtpStep = 'enter-otp';
        this.toastService.success(`Code sent on WhatsApp to ${res.phoneCountryCode} ${res.phoneNumber}`);
        this.startResendCountdown(res.resendAfterSeconds);
      },
      error: (error) => {
        this.isSubmittingPhone = false;
        const retry = error?.error?.retryAfterSeconds;
        this.phoneError = error?.error?.error || 'Could not send the code. Please try again.';
        if (retry) this.phoneError += ` Try again in ${retry}s.`;
      }
    });
  }

  resendPhoneOtp(): void {
    if (this.resendCountdown > 0 || this.isSubmittingPhone) return;
    this.requestPhoneOtp();
  }

  verifyPhoneOtp(): void {
    if (!this.isOtpValid || this.isSubmittingPhone) return;

    this.phoneError = '';
    this.isSubmittingPhone = true;

    this.authService.verifyProfilePhoneOtp(this.phoneCountryCode, this.phoneNumber, this.otpCode).subscribe({
      next: () => {
        this.isSubmittingPhone = false;
        this.phoneOtpStep = 'idle';
        this.clearResendTimer();
        this.toastService.success('Mobile number verified and added.');
      },
      error: (error) => {
        this.isSubmittingPhone = false;
        this.phoneError = error?.error?.error || 'Incorrect code. Please try again.';
      }
    });
  }

  private startResendCountdown(seconds: number): void {
    this.clearResendTimer();
    this.resendCountdown = seconds || 0;
    this.resendTimer = setInterval(() => {
      this.resendCountdown = Math.max(0, this.resendCountdown - 1);
      if (this.resendCountdown <= 0) this.clearResendTimer();
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
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
        error: () => {
          this.isLoading = false;
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
