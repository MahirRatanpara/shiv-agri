import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
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

  constructor(private http: HttpClient) {
    this.loadStoredUser();
  }

  /**
   * Load user from localStorage on app init
   */
  private loadStoredUser(): void {
    const storedUser = localStorage.getItem('currentUser');
    const accessToken = localStorage.getItem('accessToken');

    if (storedUser && accessToken) {
      const user = JSON.parse(storedUser);
      this.currentUserSubject.next(user);
      this.isAuthenticated.set(true);
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
      })
    );
  }

  /**
   * Clear session data
   */
  private clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);
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
}
