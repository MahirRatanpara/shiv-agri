import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, throwError } from 'rxjs';
import { environment } from '../environments/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  profilePhoto?: string;
  roleRef?: {
    id: string;
    name: string;
    displayName: string;
    permissions: Array<{
      id: string;
      name: string;
      resource: string;
      action: string;
    }>;
  };
}

export interface AuthResponse {
  message: string;
  accessToken?: string;
  refreshToken?: string;
  user?: User;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  // Signal for reactive state
  public isAuthenticated = signal(false);

  // Token refresh timer
  private tokenRefreshTimer: any = null;
  private readonly TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes (refresh before 1h expiry)

  constructor(private http: HttpClient) {
    this.loadStoredUser();
    this.startTokenRefreshTimer();
  }

  /**
   * Load user from localStorage on app init
   * Also checks if tokens are expired and attempts refresh
   */
  private loadStoredUser(): void {
    const storedUser = localStorage.getItem('currentUser');
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (storedUser && accessToken) {
      const user = JSON.parse(storedUser);

      // Check if access token is expired
      if (this.isTokenExpired(accessToken)) {
        console.log('Access token expired, attempting to refresh...');

        // If we have a refresh token, try to refresh
        if (refreshToken && !this.isTokenExpired(refreshToken)) {
          this.refreshToken().subscribe({
            next: () => {
              console.log('Token refreshed successfully on app init');
              this.currentUserSubject.next(user);
              this.isAuthenticated.set(true);
            },
            error: (error) => {
              console.error('Failed to refresh token on app init, logging out:', error);
              this.clearSession();
            }
          });
        } else {
          console.log('Refresh token missing or expired, clearing session');
          this.clearSession();
        }
      } else {
        // Access token is still valid
        this.currentUserSubject.next(user);
        this.isAuthenticated.set(true);

        // Check if token will expire soon and refresh proactively
        if (this.isTokenExpiringSoon(accessToken)) {
          console.log('Access token expiring soon, refreshing proactively...');
          this.refreshToken().subscribe({
            next: () => console.log('Token refreshed proactively'),
            error: (error) => console.error('Proactive refresh failed:', error)
          });
        }
      }
    }
  }

  /**
   * Google OAuth login
   */
  googleLogin(credential: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/google`, { credential }, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.accessToken && response.user) {
          this.setSession(response);
        }
      })
    );
  }

  /**
   * Set user session
   */
  private setSession(authResult: AuthResponse): void {
    if (authResult.accessToken && authResult.user) {
      localStorage.setItem('accessToken', authResult.accessToken);
      if (authResult.refreshToken) {
        localStorage.setItem('refreshToken', authResult.refreshToken);
      }
      localStorage.setItem('currentUser', JSON.stringify(authResult.user));
      this.currentUserSubject.next(authResult.user);
      this.isAuthenticated.set(true);

      // Start token refresh timer after login
      this.startTokenRefreshTimer();
    }
  }

  /**
   * Logout
   */
  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, {
      withCredentials: true
    }).pipe(
      tap(() => {
        this.clearSession();
      }),
      // Always clear session even if API call fails
      catchError((error) => {
        this.clearSession();
        return throwError(() => error);
      })
    );
  }

  /**
   * Clear session data - can be called directly for immediate logout
   */
  clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('attemptedUrl'); // Also clear redirect URL
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);

    // Stop token refresh timer
    this.stopTokenRefreshTimer();
  }

  /**
   * Get current user
   */
  getCurrentUser(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.apiUrl}/auth/me`, {
      withCredentials: true
    }).pipe(
      tap(response => {
        this.currentUserSubject.next(response.user);
        localStorage.setItem('currentUser', JSON.stringify(response.user));
        this.isAuthenticated.set(true);
      })
    );
  }

  /**
   * Refresh access token
   */
  refreshToken(): Observable<AuthResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/refresh`, { refreshToken }, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.accessToken) {
          localStorage.setItem('accessToken', response.accessToken);
        }
      })
    );
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  /**
   * Get current user value
   */
  get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Start automatic token refresh timer
   * Refreshes token every 50 minutes (before 1h expiry)
   */
  private startTokenRefreshTimer(): void {
    // Clear any existing timer
    this.stopTokenRefreshTimer();

    // Only start timer if user is authenticated
    if (!this.isAuthenticated()) {
      return;
    }

    // Set up periodic refresh
    this.tokenRefreshTimer = setInterval(() => {
      const refreshToken = localStorage.getItem('refreshToken');
      const accessToken = localStorage.getItem('accessToken');

      // Only refresh if we have both tokens and user is still authenticated
      if (refreshToken && accessToken && this.isAuthenticated()) {
        console.log('Proactively refreshing access token...');
        this.refreshToken().subscribe({
          next: () => {
            console.log('Access token refreshed successfully');
          },
          error: (error) => {
            console.error('Failed to refresh token, logging out:', error);
            this.clearSession();
          }
        });
      } else {
        // Stop timer if tokens are missing
        this.stopTokenRefreshTimer();
      }
    }, this.TOKEN_REFRESH_INTERVAL);

    console.log('Token refresh timer started (will refresh every 50 minutes)');
  }

  /**
   * Stop the token refresh timer
   */
  private stopTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
      console.log('Token refresh timer stopped');
    }
  }

  /**
   * Decode JWT token to get payload
   * Note: This does NOT verify the token, only decodes it
   */
  private decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    // JWT exp is in seconds, Date.now() is in milliseconds
    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();

    return currentTime >= expirationTime;
  }

  /**
   * Check if token will expire soon (within 10 minutes)
   */
  private isTokenExpiringSoon(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    // JWT exp is in seconds, Date.now() is in milliseconds
    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    // Returns true if token expires within the next 10 minutes
    return (expirationTime - currentTime) <= tenMinutes;
  }

  /**
   * Get token expiration date
   */
  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  }
}
