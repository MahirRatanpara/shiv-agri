import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const accessToken = authService.getAccessToken();

  // Skip auth logic for auth endpoints
  if (req.url.includes('/auth/')) {
    return next(req.clone({ withCredentials: true }));
  }

  // If we have an access token, check if it's expired or expiring soon
  if (accessToken) {
    const tokenExpiration = authService.getTokenExpiration(accessToken);

    if (tokenExpiration) {
      const now = Date.now();
      const timeUntilExpiry = tokenExpiration.getTime() - now;
      const fiveMinutes = 5 * 60 * 1000;

      // If token is expired or will expire in less than 5 minutes, refresh it first
      if (timeUntilExpiry <= fiveMinutes) {
        const refreshToken = localStorage.getItem('refreshToken');

        if (refreshToken) {
          console.log('Token expired or expiring soon, refreshing before request...');

          // Refresh token first, then make the original request
          return authService.refreshToken().pipe(
            switchMap(() => {
              // Get the new token and make the original request
              const newToken = authService.getAccessToken();
              const authReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`
                },
                withCredentials: true
              });
              return next(authReq);
            }),
            catchError((refreshError) => {
              // If refresh fails, clear session and redirect
              console.error('Token refresh failed before request, logging out');
              authService.clearSession();
              router.navigate(['/login']);
              return throwError(() => refreshError);
            })
          );
        } else {
          // No refresh token, clear session and redirect
          console.error('No refresh token available');
          authService.clearSession();
          router.navigate(['/login']);
          return throwError(() => new Error('No refresh token available'));
        }
      }
    }

    // Token is valid, proceed with request
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`
      },
      withCredentials: true
    });

    return next(authReq).pipe(
      catchError((error) => {
        // If 401 error, try to refresh token once
        if (error.status === 401) {
          const refreshToken = localStorage.getItem('refreshToken');

          // Only attempt refresh if we have a refresh token
          if (refreshToken) {
            return authService.refreshToken().pipe(
              switchMap(() => {
                // Retry original request with new token
                const newToken = authService.getAccessToken();
                const retryReq = req.clone({
                  setHeaders: {
                    Authorization: `Bearer ${newToken}`
                  },
                  withCredentials: true
                });
                return next(retryReq);
              }),
              catchError((refreshError) => {
                // If refresh fails, clear session and redirect to login
                console.error('Token refresh failed after 401, logging out user');
                authService.clearSession();
                router.navigate(['/login']);
                return throwError(() => refreshError);
              })
            );
          } else {
            // No refresh token available, clear session and redirect
            console.error('401 error with no refresh token, logging out user');
            authService.clearSession();
            router.navigate(['/login']);
            return throwError(() => error);
          }
        }

        return throwError(() => error);
      })
    );
  }

  // No access token, just proceed with request (will likely get 401)
  return next(req.clone({ withCredentials: true }));
};
