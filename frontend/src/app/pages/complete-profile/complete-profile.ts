import { Component, Inject, NgZone, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

type PhoneStep = 'enter-phone' | 'enter-otp';

const COUNTRY_CODES = [
  { dial: '+91', label: 'IN +91' },
  { dial: '+1', label: 'US +1' },
  { dial: '+44', label: 'UK +44' },
  { dial: '+971', label: 'AE +971' },
  { dial: '+61', label: 'AU +61' }
];

/**
 * First-login completion gate (farmers only).
 *   - Logged in via phone  → missing email  → collect email.
 *   - Logged in via Google → missing phone  → add + OTP-verify phone.
 * When both identities are present the user is forwarded to their original destination.
 */
@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './complete-profile.html',
  styleUrl: './complete-profile.css'
})
export class CompleteProfileComponent implements OnInit, OnDestroy {
  readonly OTP_LENGTH = 4;
  readonly countryCodes = COUNTRY_CODES;
  private destroy$ = new Subject<void>();

  user: User | null = null;
  isLoading = false;
  errorMessage = '';

  // Email step (also captures the real name for phone-OTP signups still named "New User")
  fullName = '';
  email = '';
  private namePrefilled = false;

  // Phone step
  phoneStep: PhoneStep = 'enter-phone';
  selectedCountryCode = '+91';
  phoneNumber = '';
  otpCode = '';
  resendCountdown = 0;
  private resendTimer: any = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Load feature flags — decides whether the phone step uses OTP or manual entry.
    this.authService.loadAuthConfig().pipe(takeUntil(this.destroy$)).subscribe();

    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        this.user = user;
        // Prefill the name field with the user's real name (ignore the "New User" placeholder).
        if (user && !this.namePrefilled && user.name && user.name !== 'New User') {
          this.fullName = user.name;
          this.namePrefilled = true;
        }
        // Once nothing is missing, leave the gate.
        if (user && !this.authService.isProfileIncomplete(user)) {
          this.finish();
        }
      });
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get needsEmail(): boolean {
    return !this.user?.email;
  }

  get needsPhone(): boolean {
    return !this.user?.phoneNumber;
  }

  /** When false (Google-only mode), the phone step collects the number manually without OTP. */
  get otpLoginEnabled(): boolean {
    return this.authService.otpLoginEnabled();
  }

  get isEmailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  get isNameValid(): boolean {
    return this.fullName.trim().length >= 2;
  }

  get isPhoneNumberValid(): boolean {
    return /^\d{7,12}$/.test(this.phoneNumber);
  }

  get isOtpValid(): boolean {
    return new RegExp(`^\\d{${this.OTP_LENGTH}}$`).test(this.otpCode);
  }

  // ---------- Email ----------
  submitEmail(): void {
    if (!this.isEmailValid || !this.isNameValid || this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.setProfileEmail(this.email.trim(), this.fullName.trim()).subscribe({
      next: () => {
        this.isLoading = false;
        this.toastService.success('Email added.');
        // currentUser$ emits the updated user; the subscription advances/finishes.
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.error || 'Could not save your email. Please try again.';
      }
    });
  }

  // ---------- Phone ----------
  onPhoneInput(event: Event): void {
    this.phoneNumber = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12);
  }

  onOtpInput(event: Event): void {
    this.otpCode = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, this.OTP_LENGTH);
  }

  requestOtp(): void {
    if (!this.isPhoneNumberValid || this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.requestProfilePhoneOtp(this.selectedCountryCode, this.phoneNumber).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.otpCode = '';
        this.phoneStep = 'enter-otp';
        this.toastService.success(`Code sent on WhatsApp to ${res.phoneCountryCode} ${res.phoneNumber}`);
        this.startResendCountdown(res.resendAfterSeconds);
      },
      error: (error) => {
        this.isLoading = false;
        const retry = error?.error?.retryAfterSeconds;
        this.errorMessage = error?.error?.error || 'Could not send the code. Please try again.';
        if (retry) this.errorMessage += ` Try again in ${retry}s.`;
      }
    });
  }

  resendOtp(): void {
    if (this.resendCountdown > 0 || this.isLoading) return;
    this.requestOtp();
  }

  /**
   * Manual phone save (Google-only mode, no OTP). Stores the number unverified.
   */
  saveManualPhone(): void {
    if (!this.isPhoneNumberValid || this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.setProfilePhone(this.selectedCountryCode, this.phoneNumber).subscribe({
      next: () => {
        this.isLoading = false;
        this.toastService.success('Mobile number saved.');
        // currentUser$ emits the updated user; the subscription advances/finishes.
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.error || 'Could not save your number. Please try again.';
      }
    });
  }

  verifyOtp(): void {
    if (!this.isOtpValid || this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.verifyProfilePhoneOtp(this.selectedCountryCode, this.phoneNumber, this.otpCode).subscribe({
      next: () => {
        this.isLoading = false;
        this.clearResendTimer();
        this.toastService.success('Mobile number verified.');
        // currentUser$ emits the updated user; the subscription advances/finishes.
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.error || 'Incorrect code. Please try again.';
      }
    });
  }

  changePhoneNumber(): void {
    if (this.isLoading) return;
    this.phoneStep = 'enter-phone';
    this.otpCode = '';
    this.clearResendTimer();
    this.resendCountdown = 0;
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }

  private finish(): void {
    const redirectUrl = localStorage.getItem('redirectUrl') || '/farm-management';
    localStorage.removeItem('redirectUrl');
    this.router.navigateByUrl(redirectUrl);
  }

  private startResendCountdown(seconds: number): void {
    this.clearResendTimer();
    this.resendCountdown = seconds || 0;
    this.resendTimer = setInterval(() => {
      this.ngZone.run(() => {
        this.resendCountdown = Math.max(0, this.resendCountdown - 1);
        if (this.resendCountdown <= 0) this.clearResendTimer();
      });
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }
}
