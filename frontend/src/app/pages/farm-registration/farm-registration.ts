import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService, User } from '../../services/auth.service';
import { FarmManagementService, FarmProject, FarmRegistrationPayload } from '../../services/farm-management.service';
import { ToastService } from '../../services/toast.service';
import { FarmRegistrationFormComponent } from '../../components/farm-registration-form/farm-registration-form';
import { QuotationPayload, QuotationService } from '../../services/quotation.service';

@Component({
  selector: 'app-farm-registration-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FarmRegistrationFormComponent],
  templateUrl: './farm-registration.html',
  styleUrl: './farm-registration.css'
})
export class FarmRegistrationPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  currentUser: User | null = null;
  isSubmitting = false;

  // Inline quotation (manager mode only)
  includeQuotation = false;
  quotationContent = '';
  quotationAmountPerYear: number | null = null;
  quotationStartDate = '';
  // When true the farm is moved past 'approved' into 'Running' (ready) after
  // the quotation is created — saves the manager an extra click.
  activateAfterCreate = true;

  @ViewChild('inlineQuotationEditor') quotationEditor?: ElementRef<HTMLDivElement>;

  constructor(
    private authService: AuthService,
    private farmService: FarmManagementService,
    private quotationService: QuotationService,
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

  get isManagerMode(): boolean {
    return !this.isFarmer;
  }

  get needsPhoneNumber(): boolean {
    return this.isFarmer && !this.currentUser?.phoneNumber;
  }

  goToAccount(): void {
    this.router.navigate(['/my-account']);
  }

  toggleIncludeQuotation(): void {
    this.includeQuotation = !this.includeQuotation;
    if (this.includeQuotation) {
      // Seed the editor with a sensible default scope template
      const today = new Date().toISOString().slice(0, 10);
      if (!this.quotationStartDate) this.quotationStartDate = today;
      setTimeout(() => {
        if (this.quotationEditor?.nativeElement && !this.quotationContent) {
          this.quotationEditor.nativeElement.innerHTML = '';
        }
        const el = document.querySelector('.inline-quotation-block');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  }

  applyQuotationFormat(command: string, value: string | undefined = undefined): void {
    const editor = this.quotationEditor?.nativeElement;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    this.syncQuotationContent();
  }

  syncQuotationContent(): void {
    const editor = this.quotationEditor?.nativeElement;
    if (!editor) return;
    this.quotationContent = editor.innerHTML;
  }

  /**
   * Validate the inline quotation block before submit. Returns null if valid,
   * or an error message string. Only checks when includeQuotation is true.
   */
  private validateInlineQuotation(): string | null {
    if (!this.includeQuotation) return null;
    const plain = (this.quotationContent || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plain) return 'Please enter the quotation details or uncheck "Add quotation".';
    const amount = Number(this.quotationAmountPerYear);
    if (!Number.isFinite(amount) || amount <= 0) return 'Please enter a valid annual quotation amount.';
    return null;
  }

  /**
   * Submit handler. For managers/admins, optionally chains:
   *   create farm → create annual quotation → mark Running
   * If `includeQuotation=false`, this is exactly the legacy flow.
   */
  submitFarm(payload: FarmRegistrationPayload): void {
    this.syncQuotationContent();

    if (this.isManagerMode && this.includeQuotation) {
      const err = this.validateInlineQuotation();
      if (err) {
        this.toastService.warning(err);
        return;
      }
    }

    this.isSubmitting = true;

    this.farmService.registerFarm(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (farm) => {
          if (!this.isManagerMode || !this.includeQuotation) {
            const successMessage = this.isFarmer
              ? "Submitted for approval. You'll be notified once reviewed."
              : 'Farm created.';
            this.toastService.success(successMessage);
            this.isSubmitting = false;
            this.router.navigate(['/farm-management']);
            return;
          }
          // Manager flow: chain quotation + activation
          this.submitInlineQuotationFor(farm);
        },
        error: (error: HttpErrorResponse) => {
          this.toastService.error(error?.error?.message || 'Unable to save farm. Please check the form and try again.');
          this.isSubmitting = false;
        }
      });
  }

  /**
   * After the farm is created with status='approved' (manager-direct flow),
   * submit the annual quotation against it. Manager-direct farms are already
   * approved, so the quotation creation will normally throw "already approved".
   * To work around this we use the project-status patch path instead — set
   * the farm to pending_quotation first, then submit the quotation, then
   * (optionally) activate to Running.
   */
  private submitInlineQuotationFor(farm: FarmProject): void {
    const projectId = farm.id || farm._id;
    if (!projectId) {
      this.toastService.success('Farm created.');
      this.isSubmitting = false;
      this.router.navigate(['/farm-management']);
      return;
    }

    const quotationPayload: QuotationPayload = {
      content: this.quotationContent,
      amountPerYear: Number(this.quotationAmountPerYear),
      startDate: this.quotationStartDate || undefined,
      attachInitial: true
    };

    this.quotationService.submit(projectId, quotationPayload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (!this.activateAfterCreate) {
            this.toastService.success('Farm created and quotation sent.');
            this.isSubmitting = false;
            this.router.navigate(['/farm-management', 'project', projectId]);
            return;
          }
          // Move to "Running" (= ready) directly — admin/manager has authority.
          this.farmService.updateFarmStatus(projectId, 'Running')
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.toastService.success('Farm created, quotation sent, and farm activated.');
                this.isSubmitting = false;
                this.router.navigate(['/farm-management', 'project', projectId]);
              },
              error: (err: HttpErrorResponse) => {
                this.isSubmitting = false;
                // Farm + quotation were saved; failure to activate is non-fatal.
                this.toastService.warning(
                  err?.error?.message || 'Farm and quotation saved, but could not activate. Open the farm to continue.'
                );
                this.router.navigate(['/farm-management', 'project', projectId]);
              }
            });
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmitting = false;
          // Common case: manager-direct farms are already 'approved', which
          // currently rejects new quotations. Surface the server message
          // verbatim so the user can act on it.
          this.toastService.error(
            err?.error?.message || 'Farm was created but the quotation failed to save. Open the farm to retry.'
          );
          this.router.navigate(['/farm-management', 'project', projectId]);
        }
      });
  }

  cancel(): void {
    if (this.isSubmitting) return;
    this.router.navigate(['/farm-management']);
  }
}
