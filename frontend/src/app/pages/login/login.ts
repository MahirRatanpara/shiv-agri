import { Component, OnInit, PLATFORM_ID, Inject } from '@angular/core';
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

  constructor(
    private authService: AuthService,
    private router: Router,
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
      this.renderGoogleButton();
    };
    document.head.appendChild(script);
  }

  renderGoogleButton(): void {
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => this.handleCredentialResponse(response)
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

  handleCredentialResponse(response: any): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.googleLogin(response.credential).subscribe({
      next: (result) => {
        this.isLoading = false;

        if (result.requiresApproval) {
          this.successMessage = result.message || 'Account created. Waiting for admin approval.';
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 3000);
        } else {
          this.successMessage = 'Login successful! Redirecting...';

          // Get redirect URL or default to home
          const redirectUrl = localStorage.getItem('redirectUrl') || '/';
          localStorage.removeItem('redirectUrl');

          setTimeout(() => {
            this.router.navigate([redirectUrl]);
          }, 1000);
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Login error:', error);

        if (error.error?.requiresApproval) {
          this.errorMessage = error.error.error || 'Account pending approval';
        } else {
          this.errorMessage = error.error?.error || 'Login failed. Please try again.';
        }
      }
    });
  }
}
