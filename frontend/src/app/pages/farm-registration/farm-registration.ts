import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import { FarmManagementService, FarmRegistrationPayload } from '../../services/farm-management.service';
import { ToastService } from '../../services/toast.service';
import { FarmRegistrationFormComponent } from '../../components/farm-registration-form/farm-registration-form';

@Component({
  selector: 'app-farm-registration-page',
  standalone: true,
  imports: [CommonModule, FarmRegistrationFormComponent],
  templateUrl: './farm-registration.html',
  styleUrl: './farm-registration.css'
})
export class FarmRegistrationPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  currentUser: User | null = null;
  isSubmitting = false;

  constructor(
    private authService: AuthService,
    private farmService: FarmManagementService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        this.currentUser = user;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isFarmer(): boolean {
    return this.currentUser?.role === 'user' || this.currentUser?.role === 'end_user';
  }

  get needsPhoneNumber(): boolean {
    return this.isFarmer && !this.currentUser?.phoneNumber;
  }

  goToAccount(): void {
    this.router.navigate(['/my-account']);
  }

  submitFarm(payload: FarmRegistrationPayload): void {
    this.isSubmitting = true;
    
    this.farmService.registerFarm(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const successMessage = this.isFarmer
            ? "Submitted for approval. You'll be notified once reviewed."
            : 'Farm created.';
          this.toastService.success(successMessage);
          this.isSubmitting = false;
          this.router.navigate(['/farm-management']);
        },
        error: (error) => {
          this.toastService.error(error?.error?.message || 'Unable to save farm. Please check the form and try again.');
          this.isSubmitting = false;
        }
      });
  }

  cancel(): void {
    if (this.isSubmitting) return;
    this.router.navigate(['/farm-management']);
  }
}
