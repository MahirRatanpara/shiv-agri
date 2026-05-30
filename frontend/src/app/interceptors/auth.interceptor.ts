import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../environments/environment';
import { catchError, switchMap, throwError } from 'rxjs';

function isInternalRequest(url: string): boolean {
  // Relative URLs and the configured backend API are internal.
  if (!/^https?:\/\//i.test(url)) return true;
  try {
    const requestOrigin = new URL(url).origin;
    const apiOrigin = new URL(environment.apiUrl, window.location.origin).origin;
    return requestOrigin === apiOrigin || requestOrigin === window.location.origin;
  } catch {
    return false;
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const accessToken = authService.getAccessToken();

  // Don't attach auth headers or credentials to third-party APIs (e.g. Open-Meteo).
  if (!isInternalRequest(req.url)) {
    return next(req);
  }

  // Skip token attachment ONLY for public auth endpoints (no session yet).
  // Authenticated auth routes (/auth/me, /auth/logout, /auth/profile…) still need the Bearer token.
  const publicAuthEndpoints = ['/auth/google', '/auth/google-code', '/auth/refresh', '/auth/otp/'];
  if (publicAuthEndpoints.some((url) => req.url.includes(url))) {
    return next(req.clone({ withCredentials: true }));
  }

  if (accessToken) {
    const tokenExpiration = authService.getTokenExpiration(accessToken);

    if (tokenExpiration) {
      const timeUntilExpiry = tokenExpiration.getTime() - Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      // If token is expired or expiring soon, refresh first
      if (timeUntilExpiry <= fiveMinutes) {
        return authService.refreshToken().pipe(
          switchMap(() => {
            const newToken = authService.getAccessToken();
            const authReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
              withCredentials: true
            });
            return next(authReq);
          }),
          catchError((refreshError) => {
            authService.clearSession();
            router.navigate(['/login']);
            return throwError(() => refreshError);
          })
        );
      }
    }

    // Token is valid, proceed
    const authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${accessToken}` },
      withCredentials: true
    });

    return next(authReq).pipe(
      catchError((error) => {
        if (error.status === 401) {
          // Try refresh once on 401
          return authService.refreshToken().pipe(
            switchMap(() => {
              const newToken = authService.getAccessToken();
              const retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
                withCredentials: true
              });
              return next(retryReq);
            }),
            catchError((refreshError) => {
              authService.clearSession();
              router.navigate(['/login']);
              return throwError(() => refreshError);
            })
          );
        }
        return throwError(() => error);
      })
    );
  }

  // No access token, proceed without auth header
  return next(req.clone({ withCredentials: true }));
};
