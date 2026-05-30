import { Component, ElementRef, Inject, NgZone, OnDestroy, OnInit, PLATFORM_ID, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';

declare const google: any;

type LoginTab = 'google' | 'phone';
type PhoneStep = 'enter-phone' | 'enter-otp';

const COUNTRY_CODES = [
  { dial: '+91', label: 'IN +91', country: 'India' },
  { dial: '+1', label: 'US +1', country: 'United States' },
  { dial: '+44', label: 'UK +44', country: 'United Kingdom' },
  { dial: '+971', label: 'AE +971', country: 'United Arab Emirates' },
  { dial: '+65', label: 'SG +65', country: 'Singapore' },
  { dial: '+61', label: 'AU +61', country: 'Australia' },
  { dial: '+880', label: 'BD +880', country: 'Bangladesh' },
  { dial: '+94', label: 'LK +94', country: 'Sri Lanka' }
];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  readonly OTP_LENGTH = 4;
  readonly countryCodes = COUNTRY_CODES;

  // Top-level state — Google is the default sign-in method, phone OTP is secondary.
  activeTab: LoginTab = 'google';
  phoneStep: PhoneStep = 'enter-phone';
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Phone form
  selectedCountryCode = '+91';
  phoneNumber = '';

  // OTP form
  otpDigits: string[] = Array(this.OTP_LENGTH).fill('');
  resendCountdown = 0;
  expiryCountdown = 0;
  attemptsRemaining: number | null = null;

  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  private codeClient: any = null;
  private resendTimer: any = null;
  private expiryTimer: any = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Load auth feature flags so we know whether to show the phone OTP tab.
    this.authService.loadAuthConfig().subscribe({
      next: () => {
        if (!this.otpLoginEnabled) {
          this.activeTab = 'google';
        }
      },
      error: () => { /* keep optimistic default */ }
    });

    if (isPlatformBrowser(this.platformId)) {
      this.initializeGoogleSignIn();
    }
  }

  /** Whether phone + WhatsApp OTP login is enabled (driven by backend feature flag). */
  get otpLoginEnabled(): boolean {
    return this.authService.otpLoginEnabled();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  // ---------- Tab control ----------
  switchTab(tab: LoginTab): void {
    if (this.isLoading) return;
    // Phone tab is unavailable when OTP login is disabled.
    if (tab === 'phone' && !this.otpLoginEnabled) return;
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
  }

  // ---------- Google sign-in ----------
  private initializeGoogleSignIn(): void {
    if (document.getElementById('gsi-client-script')) {
      this.setupCodeClient();
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.setupCodeClient();
    document.head.appendChild(script);
  }

  private setupCodeClient(): void {
    if (typeof google === 'undefined') return;
    this.codeClient = google.accounts.oauth2.initCodeClient({
      client_id: environment.googleClientId,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: (response: any) => {
        this.ngZone.run(() => this.handleGoogleCodeResponse(response));
      }
    });
  }

  triggerGoogleSignIn(): void {
    if (!this.codeClient) {
      this.errorMessage = 'Google Sign-In is still loading. Please try again in a moment.';
      return;
    }
    this.codeClient.requestCode();
  }

  private handleGoogleCodeResponse(response: any): void {
    if (response.error) {
      this.errorMessage = 'Google sign-in was cancelled or failed.';
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.googleLoginWithCode(response.code).subscribe({
      next: () => this.onLoginSuccess(),
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Login failed. Please try again.';
      }
    });
  }

  // ---------- Phone OTP flow ----------
  onPhoneNumberInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.phoneNumber = value.replace(/\D/g, '').slice(0, 12);
  }

  get isPhoneNumberValid(): boolean {
    return /^\d{7,12}$/.test(this.phoneNumber);
  }

  get isOtpComplete(): boolean {
    return this.otpDigits.every(d => /^\d$/.test(d));
  }

  requestOtp(): void {
    if (!this.isPhoneNumberValid || this.isLoading) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.requestPhoneOtp(this.selectedCountryCode, this.phoneNumber).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.phoneStep = 'enter-otp';
        this.otpDigits = Array(this.OTP_LENGTH).fill('');
        this.attemptsRemaining = res.maxAttempts;
        this.successMessage = `Code sent to WhatsApp at ${res.phoneCountryCode} ${res.phoneNumber}`;
        this.startResendCountdown(res.resendAfterSeconds);
        this.startExpiryCountdown(res.expiresInSeconds);
        setTimeout(() => this.focusOtpInput(0), 0);
      },
      error: (error) => {
        this.isLoading = false;
        const retry = error.error?.retryAfterSeconds;
        this.errorMessage = error.error?.error || 'Could not send the code. Please try again.';
        if (retry) {
          this.errorMessage += ` Try again in ${retry}s.`;
        }
      }
    });
  }

  resendOtp(): void {
    if (this.resendCountdown > 0 || this.isLoading) return;
    this.requestOtp();
  }

  onOtpInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    if (value.length === 0) {
      this.otpDigits[index] = '';
      return;
    }
    // If user pasted multiple digits, distribute them across remaining boxes.
    const chars = value.split('').slice(0, this.OTP_LENGTH - index);
    chars.forEach((ch, offset) => {
      this.otpDigits[index + offset] = ch;
    });
    const next = Math.min(index + chars.length, this.OTP_LENGTH - 1);
    this.focusOtpInput(next);
    if (this.isOtpComplete) {
      this.verifyOtp();
    }
  }

  onOtpKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.otpDigits[index] && index > 0) {
      event.preventDefault();
      this.otpDigits[index - 1] = '';
      this.focusOtpInput(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focusOtpInput(index - 1);
    } else if (event.key === 'ArrowRight' && index < this.OTP_LENGTH - 1) {
      this.focusOtpInput(index + 1);
    } else if (event.key === 'Enter' && this.isOtpComplete) {
      this.verifyOtp();
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text') || '';
    const digits = pasted.replace(/\D/g, '').slice(0, this.OTP_LENGTH);
    if (!digits) return;
    event.preventDefault();
    for (let i = 0; i < this.OTP_LENGTH; i++) {
      this.otpDigits[i] = digits[i] || '';
    }
    const lastFilled = Math.min(digits.length - 1, this.OTP_LENGTH - 1);
    this.focusOtpInput(lastFilled);
    if (this.isOtpComplete) {
      this.verifyOtp();
    }
  }

  verifyOtp(): void {
    if (!this.isOtpComplete || this.isLoading) return;
    const code = this.otpDigits.join('');

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.verifyPhoneOtp(this.selectedCountryCode, this.phoneNumber, code).subscribe({
      next: () => this.onLoginSuccess(),
      error: (error) => {
        this.isLoading = false;
        const remaining = error.error?.attemptsRemaining;
        if (remaining !== undefined && remaining !== null) {
          this.attemptsRemaining = remaining;
        }
        this.errorMessage = error.error?.error || 'Incorrect code. Please try again.';
        if (remaining === 0 || error.error?.reason === 'TOO_MANY_ATTEMPTS' || error.error?.reason === 'EXPIRED') {
          // Reset back to phone step so the user can request a fresh code.
          setTimeout(() => this.resetToPhoneStep(), 1500);
        } else {
          this.otpDigits = Array(this.OTP_LENGTH).fill('');
          this.focusOtpInput(0);
        }
      }
    });
  }

  changePhoneNumber(): void {
    if (this.isLoading) return;
    this.resetToPhoneStep();
  }

  private resetToPhoneStep(): void {
    this.phoneStep = 'enter-phone';
    this.otpDigits = Array(this.OTP_LENGTH).fill('');
    this.attemptsRemaining = null;
    this.clearTimers();
    this.resendCountdown = 0;
    this.expiryCountdown = 0;
  }

  // ---------- Timers ----------
  private startResendCountdown(seconds: number): void {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendCountdown = seconds;
    this.resendTimer = setInterval(() => {
      this.ngZone.run(() => {
        this.resendCountdown = Math.max(0, this.resendCountdown - 1);
        if (this.resendCountdown <= 0 && this.resendTimer) {
          clearInterval(this.resendTimer);
          this.resendTimer = null;
        }
      });
    }, 1000);
  }

  private startExpiryCountdown(seconds: number): void {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryCountdown = seconds;
    this.expiryTimer = setInterval(() => {
      this.ngZone.run(() => {
        this.expiryCountdown = Math.max(0, this.expiryCountdown - 1);
        if (this.expiryCountdown <= 0 && this.expiryTimer) {
          clearInterval(this.expiryTimer);
          this.expiryTimer = null;
        }
      });
    }, 1000);
  }

  private clearTimers(): void {
    if (this.resendTimer) { clearInterval(this.resendTimer); this.resendTimer = null; }
    if (this.expiryTimer) { clearInterval(this.expiryTimer); this.expiryTimer = null; }
  }

  get expiryDisplay(): string {
    const m = Math.floor(this.expiryCountdown / 60);
    const s = this.expiryCountdown % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ---------- Focus helper ----------
  private focusOtpInput(index: number): void {
    setTimeout(() => {
      const el = this.otpInputs?.toArray()[index]?.nativeElement;
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
  }

  // ---------- Success ----------
  private onLoginSuccess(): void {
    this.isLoading = false;
    this.successMessage = 'Signed in. Redirecting…';

    // First-time farmers missing their other identity (email/phone) must complete it first.
    if (this.authService.isProfileIncomplete()) {
      setTimeout(() => this.router.navigate(['/complete-profile']), 700);
      return;
    }

    const redirectUrl = localStorage.getItem('redirectUrl') || '/';
    localStorage.removeItem('redirectUrl');
    setTimeout(() => this.router.navigate([redirectUrl]), 700);
  }
}
