import { Component, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';

declare const google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit {
  errorMessage = '';
  successMessage = '';
  isLoading = false;

  /** True inside the native iOS/Android app; drives which sign-in UI is shown. */
  isNative = Capacitor.isNativePlatform();
  private nativeAuthReady = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (this.isNative) {
      // Native app: Google's browser SDK doesn't work in a WebView, so use the
      // native account picker via @capgo/capacitor-social-login.
      this.initializeNativeGoogle();
    } else if (isPlatformBrowser(this.platformId)) {
      // Web: keep the existing Google Identity Services flow unchanged.
      this.initializeGoogleSignIn();
    }
  }

  // ---------------------------------------------------------------------------
  // Native (iOS / Android) Google Sign-In
  // ---------------------------------------------------------------------------

  private async initializeNativeGoogle(): Promise<void> {
    try {
      await SocialLogin.initialize({
        google: {
          // Web/"server" client ID: makes the ID token audience match the
          // backend's verification, and is the Credential Manager client on Android.
          webClientId: environment.googleClientId,
          // iOS-only client ID + server client ID (same web client for aud match).
          iOSClientId: environment.googleIosClientId,
          iOSServerClientId: environment.googleClientId,
          mode: 'online'
        }
      });
      this.nativeAuthReady = true;
    } catch (error: any) {
      console.error('Native Google Sign-In init failed:', error);
      this.errorMessage = `Sign-in setup failed: ${error?.message || 'unknown error'}`;
    }
  }

  async signInWithGoogleNative(): Promise<void> {
    if (!this.nativeAuthReady) {
      await this.initializeNativeGoogle();
      if (!this.nativeAuthReady) {
        // initializeNativeGoogle sets a message; make sure one is shown.
        this.errorMessage = this.errorMessage || 'Google sign-in could not start. Check the app configuration.';
        return;
      }
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // No custom `scopes` here: on Android the plugin requires modifying
      // MainActivity to request extra scopes. We only need identity sign-in,
      // and the returned ID token already carries email/name/picture claims.
      const res: any = await SocialLogin.login({
        provider: 'google',
        options: {}
      });

      // Tokens are nested under `result` (result.idToken); fall back defensively.
      const idToken = res?.result?.idToken ?? res?.idToken;
      if (!idToken) {
        throw new Error('Google returned no ID token');
      }
      // Same backend endpoint as web — the ID token replaces the web credential.
      this.completeLogin(idToken);
    } catch (error: any) {
      this.isLoading = false;
      // The plugin throws/cancels when the user dismisses the account picker.
      const msg = (error?.message || error?.toString?.() || '').toLowerCase();
      if (msg.includes('cancel')) {
        return;
      }
      console.error('Native Google Sign-In failed:', error);
      // Surface the underlying reason — critical for diagnosing OAuth/SHA-1/URL-scheme
      // setup issues on a real device.
      this.errorMessage = `Google sign-in failed: ${error?.message || 'unknown error'}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Web Google Identity Services (unchanged behavior)
  // ---------------------------------------------------------------------------

  initializeGoogleSignIn(): void {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      this.renderGoogleButton();
    };
    document.head.appendChild(script);
  }

  renderGoogleButton(): void {
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => this.completeLogin(response.credential)
    });

    google.accounts.id.renderButton(
      document.getElementById('googleSignInButton'),
      {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'signin_with'
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Shared: exchange a Google ID token for a backend session.
  // Future OTP login can add its own method and reuse the redirect handling.
  // ---------------------------------------------------------------------------

  private completeLogin(idToken: string): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.googleLogin(idToken).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'Login successful! Redirecting...';

        const redirectUrl = localStorage.getItem('redirectUrl') || '/';
        localStorage.removeItem('redirectUrl');

        setTimeout(() => {
          this.router.navigate([redirectUrl]);
        }, 1000);
      },
      error: (error) => {
        this.isLoading = false;

        if (error.error?.requiresApproval) {
          this.errorMessage = error.error.error || 'Account pending approval';
        } else {
          this.errorMessage = error.error?.error || 'Login failed. Please try again.';
        }
      }
    });
  }
}
