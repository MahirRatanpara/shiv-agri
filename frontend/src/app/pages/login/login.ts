import { Component, OnInit, PLATFORM_ID, Inject, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
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

  private codeClient: any = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Only initialize Google Sign-In on browser platform
    if (isPlatformBrowser(this.platformId)) {
      this.initializeGoogleSignIn();
    }
  }

  initializeGoogleSignIn(): void {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      this.setupCodeClient();
    };
    document.head.appendChild(script);
  }

  setupCodeClient(): void {
    this.codeClient = google.accounts.oauth2.initCodeClient({
      client_id: environment.googleClientId,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: (response: any) => {
        this.ngZone.run(() => {
          this.handleCodeResponse(response);
        });
      }
    });

    // Render a custom Google sign-in button
    const buttonEl = document.getElementById('googleSignInButton');
    if (buttonEl) {
      buttonEl.addEventListener('click', () => {
        this.codeClient.requestCode();
      });
    }
  }

  handleCodeResponse(response: any): void {
    if (response.error) {
      this.errorMessage = 'Google sign-in was cancelled or failed.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.googleLoginWithCode(response.code).subscribe({
      next: (result) => {
        this.isLoading = false;
        this.successMessage = 'Login successful! Redirecting...';

        // Get redirect URL or default to home
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
