import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Blocks gated (farmer) users with an incomplete identity from using the app until they
 * add the missing email/phone. Pairs with authGuard on protected routes — runs after it.
 * The /complete-profile route itself must NOT use this guard (would loop).
 */
export const profileCompleteGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true; // authGuard handles the unauthenticated case
  }

  if (authService.isProfileIncomplete()) {
    localStorage.setItem('redirectUrl', state.url);
    router.navigate(['/complete-profile']);
    return false;
  }

  return true;
};
