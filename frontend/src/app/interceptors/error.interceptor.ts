import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Skip error handling for certain URLs (to avoid duplicate toasts)
      const skipToastUrls = ['/auth/refresh', '/auth/google'];
      const shouldSkipToast = skipToastUrls.some(url => req.url.includes(url));

      if (!shouldSkipToast) {
        handleError(error, toastService, router);
      }

      return throwError(() => error);
    })
  );
};

function handleError(error: HttpErrorResponse, toastService: ToastService, router: Router): void {
  let errorMessage = 'An unexpected error occurred. Please try again.';
  let errorTitle = 'Error';

  if (error.error instanceof ErrorEvent) {
    // Client-side or network error
    errorMessage = 'Network error. Please check your connection and try again.';
  } else {
    // Server-side error
    switch (error.status) {
      case 0:
        // Network error or CORS issue
        errorMessage = 'Unable to connect to the server. Please check if the server is running.';
        errorTitle = 'Connection Error';
        break;

      case 400:
        // Bad Request
        errorMessage = error.error?.error || error.error?.message || 'Invalid request. Please check your input.';
        errorTitle = 'Invalid Request';
        break;

      case 401:
        // Unauthorized - handled by auth interceptor
        // Only show message if not already redirecting
        if (!window.location.pathname.includes('/login')) {
          errorMessage = 'Your session has expired. Please login again.';
          errorTitle = 'Session Expired';
        }
        break;

      case 403:
        // Forbidden - Permission denied
        errorMessage = error.error?.error || 'You do not have permission to perform this action.';
        errorTitle = 'Access Denied';
        toastService.show(`${errorTitle}: ${errorMessage}`, 'error');

        // Optionally navigate back or to a safe page
        // router.navigate(['/home']);
        return; // Early return to avoid showing toast twice

      case 404:
        // Not Found
        errorMessage = error.error?.error || 'The requested resource was not found.';
        errorTitle = 'Not Found';
        break;

      case 409:
        // Conflict
        errorMessage = error.error?.error || 'A conflict occurred. The resource may already exist.';
        errorTitle = 'Conflict';
        break;

      case 422:
        // Unprocessable Entity
        errorMessage = error.error?.error || 'Unable to process your request. Please check your data.';
        errorTitle = 'Validation Error';
        break;

      case 429:
        // Too Many Requests
        errorMessage = 'Too many requests. Please wait a moment and try again.';
        errorTitle = 'Rate Limit Exceeded';
        break;

      case 500:
        // Internal Server Error
        errorMessage = 'A server error occurred. Our team has been notified. Please try again later.';
        errorTitle = 'Server Error';
        break;

      case 502:
        // Bad Gateway
        errorMessage = 'The server is temporarily unavailable. Please try again in a few moments.';
        errorTitle = 'Service Unavailable';
        break;

      case 503:
        // Service Unavailable
        errorMessage = 'The service is temporarily unavailable. Please try again later.';
        errorTitle = 'Service Unavailable';
        break;

      case 504:
        // Gateway Timeout
        errorMessage = 'The request took too long to complete. Please try again.';
        errorTitle = 'Request Timeout';
        break;

      default:
        // Generic error message from server
        if (error.error?.error) {
          errorMessage = error.error.error;
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          // Clean up technical error messages
          errorMessage = cleanupErrorMessage(error.message);
        }
        break;
    }
  }

  // Show toast notification
  toastService.show(`${errorTitle}: ${errorMessage}`, 'error');
}

/**
 * Clean up technical error messages to be more user-friendly
 */
function cleanupErrorMessage(message: string): string {
  // Remove HTTP error prefix
  message = message.replace(/^Http failure response for .*?: /, '');

  // Remove status codes
  message = message.replace(/\d{3}\s/, '');

  // Replace technical terms
  const replacements: { [key: string]: string } = {
    'Unknown Error': 'An unexpected error occurred',
    'Backend returned code': 'Server error',
    'Http failure': 'Connection error',
    'CORS': 'Server connection',
    'timeout': 'Request took too long'
  };

  for (const [technical, friendly] of Object.entries(replacements)) {
    const regex = new RegExp(technical, 'gi');
    message = message.replace(regex, friendly);
  }

  // Ensure first letter is capitalized
  message = message.charAt(0).toUpperCase() + message.slice(1);

  // Ensure message ends with period
  if (!message.endsWith('.') && !message.endsWith('!') && !message.endsWith('?')) {
    message += '.';
  }

  return message;
}
