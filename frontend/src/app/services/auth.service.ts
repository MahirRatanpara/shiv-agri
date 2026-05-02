import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, throwError, shareReplay } from 'rxjs';
import { environment } from '../environments/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  department?: string;
  designation?: string;
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

  // Token refresh scheduling
  private refreshTimeout: any = null;

  // Shared refresh observable to dedup concurrent refresh calls
  private refreshInProgress$: Observable<AuthResponse> | null = null;

  constructor(private http: HttpClient) {
    this.loadStoredUser();
    this.setupVisibilityListener();
  }

  /**
   * Load user from localStorage on app init
   */
  private loadStoredUser(): void {
    const storedUser = localStorage.getItem('currentUser');
    const accessToken = localStorage.getItem('accessToken');

    if (storedUser && accessToken) {
      const user = JSON.parse(storedUser);

      if (this.isTokenExpired(accessToken)) {
        // Token expired — attempt refresh via Google refresh token on backend
        this.refreshToken().subscribe({
          next: () => {
            this.currentUserSubject.next(user);
            this.isAuthenticated.set(true);
            this.scheduleNextRefresh();
          },
          error: () => {
            this.clearSession();
          }
        });
      } else {
        // Token still valid
        this.currentUserSubject.next(user);
        this.isAuthenticated.set(true);
        this.scheduleNextRefresh();

        if (this.isTokenExpiringSoon(accessToken)) {
          this.refreshToken().subscribe({
            next: () => this.scheduleNextRefresh(),
            error: (err) => console.error('Proactive refresh failed:', err)
          });
        }
      }
    }
  }

  /**
   * Listen for tab visibility changes to refresh token when user returns
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!this.isAuthenticated()) return;

      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) return;

      if (this.isTokenExpired(accessToken) || this.isTokenExpiringSoon(accessToken)) {
        this.refreshToken().subscribe({
          next: () => this.scheduleNextRefresh(),
          error: () => this.clearSession()
        });
      }
    });
  }

  /**
   * Schedule a token refresh 5 minutes before expiry
   */
  private scheduleNextRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }

    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken || !this.isAuthenticated()) return;

    const decoded = this.decodeToken(accessToken);
    if (!decoded?.exp) return;

    const expiresAt = decoded.exp * 1000;
    const fiveMinutes = 5 * 60 * 1000;
    const delay = expiresAt - Date.now() - fiveMinutes;

    if (delay <= 0) {
      // Already within the refresh window
      return;
    }

    this.refreshTimeout = setTimeout(() => {
      if (this.isAuthenticated()) {
        this.refreshToken().subscribe({
          next: () => this.scheduleNextRefresh(),
          error: () => this.clearSession()
        });
      }
    }, delay);
  }

  /**
   * Google OAuth login with authorization code
   */
  googleLoginWithCode(code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/google-code`, { code }, {
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
   * Legacy Google OAuth login (ID token flow)
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
      localStorage.setItem('currentUser', JSON.stringify(authResult.user));
      this.currentUserSubject.next(authResult.user);
      this.isAuthenticated.set(true);
      this.scheduleNextRefresh();
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
      catchError((error) => {
        this.clearSession();
        return throwError(() => error);
      })
    );
  }

  /**
   * Clear session data
   */
  clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken'); // clean up legacy key
    localStorage.removeItem('currentUser');
    localStorage.removeItem('attemptedUrl');
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    this.refreshInProgress$ = null;
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
   * Update editable profile fields for the current user
   */
  updateProfile(profile: { phoneCountryCode: string; phoneNumber: string }): Observable<{ message: string; user: User }> {
    const currentUser = this.currentUserSubject.value;
    const payload = {
      ...profile,
      userId: currentUser?.id,
      email: currentUser?.email
    };

    return this.http.patch<{ message: string; user: User }>(`${this.apiUrl}/auth/profile`, payload, {
      withCredentials: true
    }).pipe(
      tap(response => {
        this.currentUserSubject.next(response.user);
        localStorage.setItem('currentUser', JSON.stringify(response.user));
      })
    );
  }

  /**
   * Refresh access token
   * Backend uses stored Google refresh token — no client-side token needed in body
   * Uses shareReplay to dedup concurrent refresh calls
   */
  refreshToken(): Observable<AuthResponse> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    this.refreshInProgress$ = this.http.post<AuthResponse>(`${this.apiUrl}/auth/refresh`, {}, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.accessToken) {
          localStorage.setItem('accessToken', response.accessToken);
        }
        this.refreshInProgress$ = null;
      }),
      catchError(error => {
        this.refreshInProgress$ = null;
        return throwError(() => error);
      }),
      shareReplay(1)
    );

    return this.refreshInProgress$;
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
   * Decode JWT token payload (does NOT verify)
   */
  private decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Check if token will expire within 10 minutes
   */
  private isTokenExpiringSoon(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded?.exp) return true;
    const tenMinutes = 10 * 60 * 1000;
    return (decoded.exp * 1000 - Date.now()) <= tenMinutes;
  }

  /**
   * Get token expiration date
   */
  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded?.exp) return null;
    return new Date(decoded.exp * 1000);
  }
}
