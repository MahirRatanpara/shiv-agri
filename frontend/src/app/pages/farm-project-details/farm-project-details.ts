import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, interval, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { FarmManagementService, FarmProject, FarmRegistrationPayload } from '../../services/farm-management.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { FarmRegistrationFormComponent } from '../../components/farm-registration-form/farm-registration-form';
import { FarmWeatherComponent } from '../../components/farm-weather/farm-weather';
import {
  FarmMediaQuota,
  FarmMediaRef,
  FarmMediaService
} from '../../services/farm-media.service';
import {
  FarmDesignRef,
  FarmDesignService
} from '../../services/farm-design.service';
import {
  PrescriptionRef,
  StructuredPrescription,
  FarmPrescriptionService
} from '../../services/farm-prescription.service';
import {
  FarmTransaction,
  FarmTransactionPayload,
  FarmTransactionSummary,
  FarmAdminTransactionService
} from '../../services/farm-admin-transaction.service';
import {
  FarmReport,
  FarmReportType,
  FarmReportService
} from '../../services/farm-report.service';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import {
  Quotation,
  QuotationPayload,
  QuotationService
} from '../../services/quotation.service';

interface UploadProgressItem {
  filename: string;
  size: number;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  message?: string;
}

const MAX_FILES_PER_BATCH = 5;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const FARMER_POLL_INTERVAL_MS = 25_000;

const PRESCRIPTION_ACCEPT = 'image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,.md';
const PRESCRIPTION_MIME_PATTERN = /^(image\/.*|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword|text\/(plain|markdown))$/i;
const DESIGN_MIME_PATTERN = /^(image|video)\//i;

type TabKey = 'overview' | 'media' | 'designs' | 'prescriptions' | 'reports' | 'transactions' | 'quotation';

@Component({
  selector: 'app-farm-project-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FarmRegistrationFormComponent, FarmWeatherComponent],
  templateUrl: './farm-project-details.html',
  styleUrl: './farm-project-details.css'
})
export class FarmProjectDetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('mediaInput') mediaInput?: ElementRef<HTMLInputElement>;
  @ViewChild('designInput') designInput?: ElementRef<HTMLInputElement>;
  @ViewChild('prescriptionInput') prescriptionInput?: ElementRef<HTMLInputElement>;

  projectId = '';
  project: FarmProject | null = null;
  isLoading = true;
  isSubmitting = false;
  showEditForm = false;
  rejectionReason = '';
  currentUser: User | null = null;
  activeTab: TabKey = 'overview';

  // Unattended media — shown as thumbnails immediately.
  mediaItems: FarmMediaRef[] = [];
  // Attended media — fetched lazily when the user expands the drawer.
  attendedMediaItems: FarmMediaRef[] = [];
  attendedMediaTotal = 0;
  attendedMediaPage = 1;
  attendedMediaTotalPages = 1;
  attendedMediaLoading = false;
  showAttendedMedia = false;
  readonly attendedPageSize = 12;

  mediaLoading = false;
  quota: FarmMediaQuota | null = null;
  uploadingBatch: UploadProgressItem[] = [];
  isUploading = false;
  lightboxItem: FarmMediaRef | null = null;
  deletingMediaIds = new Set<string>();
  attendingMediaIds = new Set<string>();
  isAttendingAll = false;
  isArchiving = false;
  readonly maxFilesPerBatch = MAX_FILES_PER_BATCH;
  readonly maxFileSizeMb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));

  // Designs (landscaping)
  designItems: FarmDesignRef[] = [];
  designsLoading = false;
  isUploadingDesigns = false;
  designUploadingBatch: UploadProgressItem[] = [];
  designLightboxItem: FarmDesignRef | null = null;

  // Prescriptions
  prescriptionItems: PrescriptionRef[] = [];
  prescriptionsLoading = false;
  isUploadingPrescriptions = false;
  prescriptionUploadingBatch: UploadProgressItem[] = [];
  expandedPrescriptionId: string | null = null;

  // Prescription PDF overlay (mirrors reports overlay)
  activePrescription: PrescriptionRef | null = null;
  prescriptionPreviewUrl: SafeResourceUrl | null = null;
  private prescriptionPreviewBlobUrl: string | null = null;
  isLoadingPrescriptionPreview = false;

  // Add prescription dummy modal toggles (legacy text builder — kept for backwards compat)
  showTextPrescriptionForm = false;
  textPrescriptionTitle = '';
  textPrescriptionBody = '';
  isSavingTextPrescription = false;

  // Structured visit-prescription form (Shiv Agri standard slip)
  showStructuredPrescriptionForm = false;
  isSavingStructuredPrescription = false;
  structuredSaveProgress = 0;
  structuredPrescriptionImages: File[] = [];
  structuredPrescriptionImagePreviews: string[] = [];
  structuredPrescription: StructuredPrescription = this.emptyStructuredPrescription();
  downloadingPrescriptionId: string | null = null;

  readonly prescriptionAccept = PRESCRIPTION_ACCEPT;
  readonly structuredImageAccept = 'image/*';

  // Lab reports (auto-linked from soil/water/fertilizer testing PDFs)
  reports: FarmReport[] = [];
  reportsLoading = false;
  reportFilter: 'all' | FarmReportType = 'all';
  activeReport: FarmReport | null = null;
  reportPreviewUrl: SafeResourceUrl | null = null;
  private reportPreviewBlobUrl: string | null = null;
  isLoadingReportPreview = false;
  isDownloadingReportId: string | null = null;

  // Admin-only transactions
  transactions: FarmTransaction[] = [];
  transactionsLoading = false;
  transactionsSummary: FarmTransactionSummary | null = null;
  showTransactionForm = false;
  editingTransactionId: string | null = null;
  isSavingTransaction = false;
  isDeletingTransactionId: string | null = null;
  transactionForm: FarmTransactionPayload = {
    description: '',
    amount: 0,
    type: 'credit',
    category: '',
    date: '',
    notes: ''
  };

  // Quotations
  activeQuotation: Quotation | null = null;
  quotationHistory: Quotation[] = [];
  quotationLoading = false;
  isSubmittingQuotation = false;
  isAcceptingQuotation = false;
  isRejectingQuotation = false;
  showQuotationForm = false;
  showQuotationRejectForm = false;
  isDownloadingQuotationId: string | null = null;
  quotationRejectReason = '';
  quotationForm: { content: string; amountPerYear: number | null; startDate: string } = {
    content: '',
    amountPerYear: null,
    startDate: ''
  };
  quotationContentSafe: SafeHtml | null = null;
  selectedQuotationDetail: Quotation | null = null;
  selectedQuotationDetailSafe: SafeHtml | null = null;

  @ViewChild('quotationEditor') quotationEditor?: ElementRef<HTMLDivElement>;

  private knownMediaIds = new Set<string>();
  private pollSubscription?: Subscription;

  lifecycleStatuses: Array<{ value: 'approved' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled'; label: string }> = [
    { value: 'approved', label: 'Approved / Not Started' },
    { value: 'Running', label: 'Running' },
    { value: 'Completed', label: 'Completed' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private permissionService: PermissionService,
    private farmService: FarmManagementService,
    private toastService: ToastService,
    private farmMediaService: FarmMediaService,
    private confirmationModalService: ConfirmationModalService,
    private farmDesignService: FarmDesignService,
    private farmPrescriptionService: FarmPrescriptionService,
    private farmAdminTransactionService: FarmAdminTransactionService,
    private farmReportService: FarmReportService,
    private sanitizer: DomSanitizer,
    private quotationService: QuotationService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((user) => {
      this.currentUser = user;
      this.startFarmerPollingIfNeeded();
    });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.projectId = params['id'];
      this.loadProject();
      this.startFarmerPollingIfNeeded();
    });

    // Auto-open the right tab when arriving from a notification.
    // The notification bell appends a `t=<timestamp>` nonce so this fires
    // every click even when the user is already on this URL.
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((qp) => {
      if (qp['tab'] === 'media') {
        this.switchTab('media');
      } else if (qp['tab'] === 'reports') {
        this.switchTab('reports');
      } else if (qp['tab'] === 'quotation') {
        this.switchTab('quotation');
      }

      // If we're being re-opened from a notification, refresh project + quotations
      // so the user sees the latest server state (new quotation, status change,
      // etc.) without a manual reload.
      if (qp['from'] === 'notification' && this.projectId) {
        this.loadProject();
      }
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.revokeReportPreview();
    this.revokePrescriptionPreview();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startFarmerPollingIfNeeded(): void {
    // Only farmers viewing their farm need to be notified of new uploads.
    // Managers see uploads they themselves trigger.
    if (this.pollSubscription || !this.projectId || !this.currentUser) return;
    if (!this.isFarmer) return;

    // Prime the known set so the first arrival doesn't fire a toast.
    this.farmMediaService.listMedia(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.knownMediaIds = new Set(response.items.map((m) => m.mediaId));
          if (this.activeTab === 'media') {
            this.mediaItems = response.items;
            this.attendedMediaTotal = response.attendedTotal;
            this.quota = response.quota;
          }
        },
        error: () => {/* silent */}
      });

    this.pollSubscription = interval(FARMER_POLL_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.pollForNewMedia());
  }

  private pollForNewMedia(): void {
    if (!this.projectId || this.isUploading) return;

    this.farmMediaService.listMedia(this.projectId)
      .subscribe({
        next: (response) => {
          const fresh = response.items.filter((item) => !this.knownMediaIds.has(item.mediaId));
          if (fresh.length === 0) return;

          fresh.forEach((item) => this.knownMediaIds.add(item.mediaId));

          this.mediaItems = response.items;
          this.attendedMediaTotal = response.attendedTotal;
          this.quota = response.quota;

          const message = fresh.length === 1
            ? 'New photo added to your farm. Tap Photos & Videos to view.'
            : `${fresh.length} new photos added to your farm.`;
          this.toastService.info(message, 5000);
        },
        error: () => {/* silent — keep retrying on next tick */}
      });
  }

  get canApprove(): boolean {
    return this.permissionService.hasPermission('farm.projects.approve');
  }

  get isFarmer(): boolean {
    return this.currentUser?.role === 'user' || this.currentUser?.role === 'end_user';
  }

  get canEdit(): boolean {
    return this.canApprove || this.permissionService.hasPermission('farm.projects.update') || this.isFarmer;
  }

  get canManageLifecycle(): boolean {
    return !this.isFarmer && (
      this.permissionService.hasPermission('farm.projects.update') ||
      this.currentUser?.role === 'admin'
    );
  }

  get canChangeLifecycleStatus(): boolean {
    return !!this.project &&
      this.canManageLifecycle &&
      !this.project.isArchived &&
      !['pending_approval', 'rejected'].includes(this.project.status);
  }

  get attendedPageNumbers(): number[] {
    const total = this.attendedMediaTotalPages;
    if (total <= 1) return [];
    const max = 5;
    const half = Math.floor(max / 2);
    let start = Math.max(1, this.attendedMediaPage - half);
    let end = Math.min(total, start + max - 1);
    start = Math.max(1, end - max + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  get isFarmOwner(): boolean {
    if (!this.project || !this.currentUser) return false;
    const me = (this.currentUser.id || '').toString();
    if (!me) return false;
    const candidates = [this.project.submittedBy, this.project.clientId, this.project.createdBy];
    return candidates.some((value) => {
      if (!value) return false;
      if (typeof value === 'string') return value === me;
      const id = (value._id || value.id || '').toString();
      return id === me;
    });
  }

  get canUploadMedia(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (this.isPreApproval) return false;
    // Photos & Videos: ONLY the farm owner who registered the farm.
    return this.isFarmOwner;
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get canDeleteMedia(): boolean {
    return this.isAdmin;
  }

  get canArchiveProject(): boolean {
    return this.isAdmin;
  }

  /**
   * Mark-as-attended actions are limited to admins and farm managers
   * (anyone holding farm.projects.approve). The backend enforces the same.
   */
  get canAttendMedia(): boolean {
    return this.isAdmin || this.permissionService.hasPermission('farm.projects.approve');
  }

  get isManagerOrAdmin(): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'admin') return true;
    return this.permissionService.hasPermission('farm.projects.update');
  }

  get canUploadDesigns(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (this.isPreApproval) return false;
    return this.isManagerOrAdmin;
  }

  get canUploadPrescriptions(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (this.isPreApproval) return false;
    return this.isManagerOrAdmin;
  }

  get isLandscapingProject(): boolean {
    if (!this.project) return false;
    const cat = (this.project.category || '').toUpperCase();
    if (cat === 'LANDSCAPING') return true;
    const pt = (this.project.projectType || '').toLowerCase();
    if (pt === 'landscaping') return true;
    return !!this.project.needsLandscapingConsultancy;
  }

  get showDesignsTab(): boolean {
    return this.isLandscapingProject;
  }

  get showTransactionsTab(): boolean {
    // Admin-only — managers and other roles do not see this tab.
    return this.isAdmin;
  }

  // ========================
  // Quotation workflow visibility
  // ========================

  /** True while the farm is in any pre-approval state (no BAU tabs yet). */
  get isPreApproval(): boolean {
    const status = this.project?.status;
    return status === 'pending_quotation' ||
           status === 'pending_acceptance' ||
           status === 'pending_approval' ||
           status === 'rejected';
  }

  /** Whether to show full BAU tabs (photos/designs/prescriptions/reports/transactions). */
  get showFullTabs(): boolean {
    if (!this.project) return false;
    return !this.isPreApproval;
  }

  /** Manager/admin can submit a quotation when farm is in pending_quotation state. */
  get canSubmitQuotation(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (!this.isManagerOrAdmin) return false;
    return this.project.status === 'pending_quotation' ||
           this.project.status === 'pending_acceptance';
  }

  /** Farmer can accept/reject when a quotation is currently submitted. */
  get canRespondToQuotation(): boolean {
    if (!this.project || !this.activeQuotation) return false;
    if (this.project.isArchived) return false;
    if (this.project.status !== 'pending_acceptance') return false;
    if (this.activeQuotation.status !== 'submitted') return false;
    return this.isFarmOwner;
  }

  /** Whether the Quotation tab in the tab bar should appear. */
  get showQuotationTab(): boolean {
    if (!this.project) return false;
    // Always show for farm projects — the tab is the home for quotation history
    // and (post-approval) future payments.
    const isFarm = (this.project.category || '').toUpperCase() === 'FARM' ||
                   (this.project.projectType || '').toLowerCase() === 'farm';
    return isFarm;
  }

  /** Whether the inline quotation banner appears on Overview. */
  get shouldShowQuotationCallout(): boolean {
    if (!this.project) return false;
    const status = this.project.status;
    return status === 'pending_quotation' ||
           status === 'pending_acceptance';
  }

  get quotaPercent(): number {
    if (!this.quota || this.quota.limit === 0) return 0;
    return Math.min(100, Math.round((this.quota.used / this.quota.limit) * 100));
  }

  get quotaStatus(): 'normal' | 'warning' | 'critical' {
    if (!this.quota) return 'normal';
    if (this.quota.used >= this.quota.limit) return 'critical';
    if (this.quota.used / this.quota.limit >= 0.8) return 'warning';
    return 'normal';
  }

  get quotaResetsLabel(): string {
    if (!this.quota?.resetsAt) return 'Monday';
    const reset = new Date(this.quota.resetsAt);
    const today = new Date();
    const days = Math.ceil((reset.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'soon';
    if (days === 1) return 'tomorrow';
    return reset.toLocaleDateString(undefined, { weekday: 'long' });
  }

  loadProject(): void {
    if (!this.projectId) return;
    this.isLoading = true;
    this.farmService.getFarmById(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (project) => {
          this.project = project;
          this.isLoading = false;
          // Auto-load quotations whenever the project loads so we can show
          // banners on Overview without waiting for tab activation.
          this.loadQuotations();
        },
        error: () => {
          this.isLoading = false;
          this.toastService.error('Unable to load project details.');
          this.router.navigate(['/farm-management']);
        }
      });
  }

  // ========================
  // Quotation methods
  // ========================

  loadQuotations(): void {
    if (!this.projectId) return;
    this.quotationLoading = true;
    this.quotationService.list(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quotations) => {
          this.quotationHistory = quotations;
          const active = quotations.find((q) => q.status === 'submitted' || q.status === 'accepted') || null;
          this.activeQuotation = active;
          this.quotationContentSafe = active
            ? this.sanitizer.bypassSecurityTrustHtml(active.content)
            : null;
          this.quotationLoading = false;
        },
        error: () => {
          this.quotationLoading = false;
        }
      });
  }

  openQuotationForm(): void {
    if (!this.canSubmitQuotation) return;

    // When revising an existing quotation, prefill with the previous quotation's
    // content, amount, and first-instalment date. Falls back to today's date
    // for a brand-new quotation.
    const existing = this.activeQuotation;
    const existingStart = existing?.startDate
      ? new Date(existing.startDate).toISOString().slice(0, 10)
      : this.todayIso();

    this.showQuotationForm = true;
    this.quotationForm = {
      content: existing?.content || '',
      amountPerYear: existing?.amountPerYear ?? null,
      startDate: existingStart
    };

    setTimeout(() => {
      if (this.quotationEditor?.nativeElement) {
        this.quotationEditor.nativeElement.innerHTML = this.quotationForm.content || '';
      }
      // Scroll the form into view so the manager can see it right below the
      // trigger button without hunting for it.
      const formEl = document.querySelector('.quotation-form-card');
      formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  /**
   * Download the quotation as a PDF on the company letterhead.
   */
  downloadQuotationPdf(quotation: Quotation | null): void {
    if (!quotation || !this.projectId) return;
    if (this.isDownloadingQuotationId) return;

    this.isDownloadingQuotationId = quotation._id;
    this.quotationService.downloadPdf(this.projectId, quotation._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const farm = (this.project?.name || 'farm').replace(/\s+/g, '_');
          const dateStr = new Date(quotation.createdAt).toISOString().slice(0, 10);
          const filename = `Quotation_${farm}_${dateStr}.pdf`;

          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(url);
          this.isDownloadingQuotationId = null;
        },
        error: (err: HttpErrorResponse) => {
          this.isDownloadingQuotationId = null;
          this.toastService.error(err?.error?.message || 'Unable to download quotation PDF.');
        }
      });
  }

  cancelQuotationForm(): void {
    this.showQuotationForm = false;
    this.quotationForm = { content: '', amountPerYear: null, startDate: '' };
  }

  /** Toolbar handler: applies document.execCommand for the rich-text editor. */
  applyFormat(command: string, value: string | undefined = undefined): void {
    const editor = this.quotationEditor?.nativeElement;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    this.syncEditorContent();
  }

  syncEditorContent(): void {
    const editor = this.quotationEditor?.nativeElement;
    if (!editor) return;
    this.quotationForm.content = editor.innerHTML;
  }

  submitQuotation(): void {
    if (!this.projectId || !this.canSubmitQuotation) return;

    this.syncEditorContent();
    const content = (this.quotationForm.content || '').trim();
    const amount = Number(this.quotationForm.amountPerYear);

    const plain = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plain) {
      this.toastService.warning('Please enter the quotation details.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      this.toastService.warning('Please enter a valid annual amount.');
      return;
    }

    const payload: QuotationPayload = {
      content,
      amountPerYear: amount,
      startDate: this.quotationForm.startDate || undefined
    };

    this.isSubmittingQuotation = true;
    this.quotationService.submit(this.projectId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastService.success('Quotation sent to the farmer for review.');
          this.isSubmittingQuotation = false;
          this.showQuotationForm = false;
          this.loadProject();
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmittingQuotation = false;
          this.toastService.error(err?.error?.message || 'Unable to submit quotation.');
        }
      });
  }

  acceptQuotation(): void {
    if (!this.projectId || !this.activeQuotation || !this.canRespondToQuotation) return;

    this.isAcceptingQuotation = true;
    this.quotationService.accept(this.projectId, this.activeQuotation._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastService.success('Quotation accepted. Your farm is now approved.');
          this.isAcceptingQuotation = false;
          this.loadProject();
        },
        error: (err: HttpErrorResponse) => {
          this.isAcceptingQuotation = false;
          this.toastService.error(err?.error?.message || 'Unable to accept quotation.');
        }
      });
  }

  openQuotationRejectForm(): void {
    if (!this.canRespondToQuotation) return;
    this.showQuotationRejectForm = true;
    this.quotationRejectReason = '';
  }

  cancelQuotationReject(): void {
    this.showQuotationRejectForm = false;
    this.quotationRejectReason = '';
  }

  rejectQuotation(): void {
    if (!this.projectId || !this.activeQuotation || !this.canRespondToQuotation) return;

    this.isRejectingQuotation = true;
    this.quotationService.reject(this.projectId, this.activeQuotation._id, this.quotationRejectReason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastService.warning('Quotation rejected. The team has been notified.');
          this.isRejectingQuotation = false;
          this.showQuotationRejectForm = false;
          this.quotationRejectReason = '';
          this.loadProject();
        },
        error: (err: HttpErrorResponse) => {
          this.isRejectingQuotation = false;
          this.toastService.error(err?.error?.message || 'Unable to reject quotation.');
        }
      });
  }

  openQuotationDetail(quotation: Quotation): void {
    this.selectedQuotationDetail = quotation;
    this.selectedQuotationDetailSafe = this.sanitizer.bypassSecurityTrustHtml(quotation.content);
    document.body.style.overflow = 'hidden';
  }

  closeQuotationDetail(): void {
    this.selectedQuotationDetail = null;
    this.selectedQuotationDetailSafe = null;
    document.body.style.overflow = '';
  }

  trackQuotation(_: number, quotation: Quotation): string {
    return quotation._id;
  }

  quotationStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      submitted: 'Awaiting acceptance',
      accepted: 'Accepted',
      rejected: 'Rejected',
      superseded: 'Superseded'
    };
    return labels[status] || status;
  }

  installmentStatusLabel(installment: { status: string; dueDate: string }): string {
    if (installment.status === 'paid') return 'Paid';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(installment.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due.getTime() < today.getTime()) return 'Overdue';
    if (due.getTime() === today.getTime()) return 'Due today';
    return 'Upcoming';
  }

  switchTab(tab: TabKey): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'media') {
      if (this.mediaItems.length === 0 && !this.mediaLoading) {
        this.loadMedia();
      } else if (!this.quota) {
        this.refreshQuota();
      }
    } else if (tab === 'designs' && this.designItems.length === 0 && !this.designsLoading) {
      this.loadDesigns();
    } else if (tab === 'prescriptions') {
      // Always reload on tab switch to surface any new prescriptions
      // (e.g., created in another tab, by another manager, etc.).
      if (!this.prescriptionsLoading) {
        this.loadPrescriptions();
      }
    } else if (tab === 'reports' && this.reports.length === 0 && !this.reportsLoading) {
      this.loadReports();
    } else if (tab === 'transactions' && this.showTransactionsTab) {
      if (this.transactions.length === 0 && !this.transactionsLoading) {
        this.loadTransactions();
      }
      if (!this.transactionsSummary) {
        this.refreshTransactionsSummary();
      }
    } else if (tab === 'quotation') {
      this.loadQuotations();
    }
  }

  loadMedia(): void {
    if (!this.projectId) return;
    this.mediaLoading = true;
    this.farmMediaService.listMedia(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.mediaItems = response.items;
          this.attendedMediaTotal = response.attendedTotal;
          this.quota = response.quota;
          this.knownMediaIds = new Set(response.items.map((m) => m.mediaId));
          this.mediaLoading = false;

          // If the attended drawer is already open (e.g. after a mark/delete), refresh it.
          if (this.showAttendedMedia) this.loadAttendedMedia(this.attendedMediaPage);
        },
        error: () => {
          this.mediaLoading = false;
          this.toastService.error('Unable to load farm media.');
        }
      });
  }

  toggleAttendedMedia(): void {
    this.showAttendedMedia = !this.showAttendedMedia;
    if (this.showAttendedMedia && this.attendedMediaItems.length === 0) {
      this.loadAttendedMedia(1);
    }
  }

  loadAttendedMedia(page: number): void {
    if (!this.projectId || page < 1) return;
    this.attendedMediaLoading = true;
    this.attendedMediaPage = page;
    this.farmMediaService.listAttendedMedia(this.projectId, page, this.attendedPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.attendedMediaItems = response.items;
          this.attendedMediaTotal = response.pagination.total;
          this.attendedMediaTotalPages = response.pagination.totalPages;
          this.attendedMediaLoading = false;
        },
        error: () => {
          this.attendedMediaLoading = false;
          this.toastService.error('Unable to load attended photos.');
        }
      });
  }

  goToAttendedPage(page: number): void {
    if (page < 1 || page > this.attendedMediaTotalPages || page === this.attendedMediaPage) return;
    this.loadAttendedMedia(page);
  }

  markAsAttended(item: FarmMediaRef, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.canAttendMedia) return;
    if (this.attendingMediaIds.has(item.mediaId)) return;

    this.attendingMediaIds.add(item.mediaId);
    this.farmMediaService.markAttended(this.projectId, item.mediaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.attendingMediaIds.delete(item.mediaId);
          this.mediaItems = this.mediaItems.filter((m) => m.mediaId !== item.mediaId);
          this.knownMediaIds.delete(item.mediaId);
          this.attendedMediaTotal += 1;
          if (this.showAttendedMedia) this.loadAttendedMedia(1);
          this.toastService.success('Marked as attended');
        },
        error: (err) => {
          this.attendingMediaIds.delete(item.mediaId);
          this.toastService.error(err?.error?.message || 'Could not mark as attended.');
        }
      });
  }

  markAllAsAttended(): void {
    if (!this.canAttendMedia || this.isAttendingAll || this.mediaItems.length === 0) return;

    this.isAttendingAll = true;
    this.farmMediaService.markAllAttended(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ attendedCount }) => {
          this.isAttendingAll = false;
          if (attendedCount === 0) {
            this.toastService.info('No unattended photos to mark.');
            return;
          }
          this.mediaItems.forEach((m) => this.knownMediaIds.delete(m.mediaId));
          this.mediaItems = [];
          this.attendedMediaTotal += attendedCount;
          if (this.showAttendedMedia) this.loadAttendedMedia(1);
          this.toastService.success(
            attendedCount === 1
              ? '1 photo marked as attended.'
              : `${attendedCount} photos marked as attended.`
          );
        },
        error: (err) => {
          this.isAttendingAll = false;
          this.toastService.error(err?.error?.message || 'Could not mark all as attended.');
        }
      });
  }

  async confirmDeleteMedia(item: FarmMediaRef, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.canDeleteMedia || this.deletingMediaIds.has(item.mediaId)) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Delete this photo?',
      message: `This will permanently remove the ${item.type} from the farm record. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash-alt'
    });
    if (!confirmed) return;

    this.deletingMediaIds.add(item.mediaId);
    this.farmMediaService.deleteMedia(this.projectId, item.mediaId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingMediaIds.delete(item.mediaId);
          const wasAttended = this.attendedMediaItems.some((m) => m.mediaId === item.mediaId);
          this.attendedMediaItems = this.attendedMediaItems.filter((m) => m.mediaId !== item.mediaId);
          this.mediaItems = this.mediaItems.filter((m) => m.mediaId !== item.mediaId);
          this.knownMediaIds.delete(item.mediaId);
          if (wasAttended) {
            this.attendedMediaTotal = Math.max(0, this.attendedMediaTotal - 1);
          }

          if (this.showAttendedMedia && this.attendedMediaItems.length === 0 && this.attendedMediaPage > 1) {
            this.loadAttendedMedia(this.attendedMediaPage - 1);
          }
          this.toastService.success('Photo removed.');
        },
        error: (err) => {
          this.deletingMediaIds.delete(item.mediaId);
          this.toastService.error(err?.error?.message || 'Unable to delete this photo.');
        }
      });
  }

  async confirmArchiveProject(): Promise<void> {
    if (!this.project || !this.canArchiveProject || this.isArchiving) return;

    const archived = !!this.project.isArchived;
    const confirmed = await this.confirmationModalService.confirm({
      title: archived ? 'Restore this project?' : 'Archive this project?',
      message: archived
        ? 'Restoring will allow uploads and lifecycle changes again.'
        : 'Archived projects become read-only — no further uploads or status changes will be accepted. You can restore later.',
      confirmText: archived ? 'Restore' : 'Archive',
      cancelText: 'Cancel',
      confirmClass: archived ? 'btn-primary' : 'btn-danger',
      icon: archived ? 'fas fa-rotate-left' : 'fas fa-box-archive'
    });
    if (!confirmed) return;

    this.isArchiving = true;
    const projectId = this.project.id || this.project._id || '';
    const request$ = archived
      ? this.farmService.unarchiveFarm(projectId)
      : this.farmService.archiveFarm(projectId);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (project) => {
        this.project = project;
        this.isArchiving = false;
        this.toastService.success(archived ? 'Project restored.' : 'Project archived.');
      },
      error: (err) => {
        this.isArchiving = false;
        this.toastService.error(err?.error?.message || 'Unable to update archive state.');
      }
    });
  }

  refreshQuota(): void {
    if (!this.projectId) return;
    this.farmMediaService.getQuota(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quota) => (this.quota = quota),
        error: () => {/* silent */}
      });
  }

  triggerFilePicker(): void {
    if (!this.canUploadMedia || this.isUploading) return;
    this.mediaInput?.nativeElement.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    input.value = '';

    if (files.length > MAX_FILES_PER_BATCH) {
      this.toastService.warning(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time.`);
      return;
    }

    const oversize = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      this.toastService.error(`${oversize.name} is larger than ${this.maxFileSizeMb}MB.`);
      return;
    }

    const invalid = files.find((f) => !/^(image|video)\//i.test(f.type));
    if (invalid) {
      this.toastService.error(`${invalid.name} is not a supported image or video.`);
      return;
    }

    this.uploadFiles(files);
  }

  private uploadFiles(files: File[]): void {
    if (!this.projectId) return;
    this.isUploading = true;
    this.uploadingBatch = files.map((file) => ({
      filename: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0
    }));

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    this.farmMediaService.uploadFiles(this.projectId, files)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            const ratio = totalBytes > 0 ? event.loaded / totalBytes : 0;
            // Distribute progress across the batch evenly so each file's
            // progress bar advances together — keeps the UI honest since the
            // request is a single multipart payload.
            this.uploadingBatch = this.uploadingBatch.map((item) =>
              item.status === 'uploading'
                ? { ...item, progress: Math.min(99, Math.round(ratio * 100)) }
                : item
            );
          } else if (event.kind === 'done') {
            const { uploaded, failures, quota } = event.result;
            this.quota = quota;

            const failedNames = new Set(failures.map((f) => f.filename));
            this.uploadingBatch = this.uploadingBatch.map((item) => {
              if (failedNames.has(item.filename)) {
                const failure = failures.find((f) => f.filename === item.filename);
                return { ...item, status: 'error', progress: 100, message: failure?.message };
              }
              return { ...item, status: 'success', progress: 100 };
            });

            // Prepend new media to the grid (newest first)
            this.mediaItems = [...uploaded, ...this.mediaItems];
            uploaded.forEach((item) => this.knownMediaIds.add(item.mediaId));

            if (uploaded.length) {
              this.toastService.success(
                uploaded.length === 1
                  ? '1 file uploaded'
                  : `${uploaded.length} files uploaded`
              );
            }
            if (failures.length) {
              this.toastService.error(
                `${failures.length} file${failures.length > 1 ? 's' : ''} failed to upload.`
              );
            }

            // Clear progress strip after a short delay
            setTimeout(() => {
              this.uploadingBatch = [];
            }, 2200);

            this.isUploading = false;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isUploading = false;
          if (err.status === 429) {
            const message = err.error?.message || 'Weekly upload limit reached.';
            this.toastService.error(message);
            if (err.error?.quota) this.quota = err.error.quota;
          } else if (err.status === 413) {
            this.toastService.error(`Files cannot be larger than ${this.maxFileSizeMb}MB.`);
          } else {
            this.toastService.error(err.error?.message || 'Upload failed. Please try again.');
          }
          this.uploadingBatch = this.uploadingBatch.map((item) => ({
            ...item,
            status: 'error',
            progress: 100,
            message: 'Upload failed'
          }));
          setTimeout(() => (this.uploadingBatch = []), 2500);
        }
      });
  }

  openLightbox(item: FarmMediaRef): void {
    this.lightboxItem = item;
    document.body.style.overflow = 'hidden';
  }

  closeLightbox(): void {
    this.lightboxItem = null;
    document.body.style.overflow = '';
  }

  trackMedia(_: number, item: FarmMediaRef): string {
    return item.mediaId;
  }

  trackUpload(_: number, item: UploadProgressItem): string {
    return item.filename;
  }

  // ========================
  // Designs (Landscaping)
  // ========================

  loadDesigns(): void {
    if (!this.projectId) return;
    this.designsLoading = true;
    this.farmDesignService.listDesigns(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.designItems = response.items;
          this.designsLoading = false;
        },
        error: () => {
          this.designsLoading = false;
          this.toastService.error('Unable to load landscaping designs.');
        }
      });
  }

  triggerDesignPicker(): void {
    if (!this.canUploadDesigns || this.isUploadingDesigns) return;
    this.designInput?.nativeElement.click();
  }

  onDesignFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    input.value = '';

    if (files.length > MAX_FILES_PER_BATCH) {
      this.toastService.warning(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time.`);
      return;
    }

    const oversize = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      this.toastService.error(`${oversize.name} is larger than ${this.maxFileSizeMb}MB.`);
      return;
    }

    const invalid = files.find((f) => !DESIGN_MIME_PATTERN.test(f.type));
    if (invalid) {
      this.toastService.error(`${invalid.name} is not a supported image or video.`);
      return;
    }

    this.uploadDesignFiles(files);
  }

  private uploadDesignFiles(files: File[]): void {
    if (!this.projectId) return;
    this.isUploadingDesigns = true;
    this.designUploadingBatch = files.map((file) => ({
      filename: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0
    }));

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    this.farmDesignService.uploadDesigns(this.projectId, files)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            const ratio = totalBytes > 0 ? event.loaded / totalBytes : 0;
            this.designUploadingBatch = this.designUploadingBatch.map((item) =>
              item.status === 'uploading'
                ? { ...item, progress: Math.min(99, Math.round(ratio * 100)) }
                : item
            );
          } else if (event.kind === 'done') {
            const { uploaded, failures } = event.result;

            const failedNames = new Set(failures.map((f) => f.filename));
            this.designUploadingBatch = this.designUploadingBatch.map((item) => {
              if (failedNames.has(item.filename)) {
                const failure = failures.find((f) => f.filename === item.filename);
                return { ...item, status: 'error', progress: 100, message: failure?.message };
              }
              return { ...item, status: 'success', progress: 100 };
            });

            this.designItems = [...uploaded, ...this.designItems];

            if (uploaded.length) {
              this.toastService.success(
                uploaded.length === 1
                  ? '1 design uploaded'
                  : `${uploaded.length} designs uploaded`
              );
            }
            if (failures.length) {
              this.toastService.error(
                `${failures.length} file${failures.length > 1 ? 's' : ''} failed to upload.`
              );
            }

            setTimeout(() => (this.designUploadingBatch = []), 2200);
            this.isUploadingDesigns = false;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isUploadingDesigns = false;
          this.toastService.error(err.error?.message || 'Upload failed. Please try again.');
          this.designUploadingBatch = this.designUploadingBatch.map((item) => ({
            ...item,
            status: 'error',
            progress: 100,
            message: 'Upload failed'
          }));
          setTimeout(() => (this.designUploadingBatch = []), 2500);
        }
      });
  }

  openDesignLightbox(item: FarmDesignRef): void {
    this.designLightboxItem = item;
    document.body.style.overflow = 'hidden';
  }

  closeDesignLightbox(): void {
    this.designLightboxItem = null;
    document.body.style.overflow = '';
  }

  trackDesign(_: number, item: FarmDesignRef): string {
    return item.mediaId;
  }

  // ========================
  // Prescriptions
  // ========================

  loadPrescriptions(): void {
    if (!this.projectId) return;
    this.prescriptionsLoading = true;
    this.farmPrescriptionService.listPrescriptions(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.prescriptionItems = response.items;
          this.prescriptionsLoading = false;
        },
        error: () => {
          this.prescriptionsLoading = false;
          this.toastService.error('Unable to load prescriptions.');
        }
      });
  }

  triggerPrescriptionPicker(): void {
    if (!this.canUploadPrescriptions || this.isUploadingPrescriptions) return;
    this.prescriptionInput?.nativeElement.click();
  }

  onPrescriptionFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    input.value = '';

    if (files.length > MAX_FILES_PER_BATCH) {
      this.toastService.warning(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time.`);
      return;
    }

    const oversize = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      this.toastService.error(`${oversize.name} is larger than ${this.maxFileSizeMb}MB.`);
      return;
    }

    const invalid = files.find((f) => !PRESCRIPTION_MIME_PATTERN.test(f.type));
    if (invalid) {
      this.toastService.error(`${invalid.name} is not a supported document type.`);
      return;
    }

    this.uploadPrescriptionFiles(files);
  }

  private uploadPrescriptionFiles(files: File[]): void {
    if (!this.projectId) return;
    this.isUploadingPrescriptions = true;
    this.prescriptionUploadingBatch = files.map((file) => ({
      filename: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0
    }));

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    this.farmPrescriptionService.uploadPrescriptions(this.projectId, files)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            const ratio = totalBytes > 0 ? event.loaded / totalBytes : 0;
            this.prescriptionUploadingBatch = this.prescriptionUploadingBatch.map((item) =>
              item.status === 'uploading'
                ? { ...item, progress: Math.min(99, Math.round(ratio * 100)) }
                : item
            );
          } else if (event.kind === 'done') {
            const { uploaded, failures } = event.result;

            const failedNames = new Set(failures.map((f) => f.filename));
            this.prescriptionUploadingBatch = this.prescriptionUploadingBatch.map((item) => {
              if (failedNames.has(item.filename)) {
                const failure = failures.find((f) => f.filename === item.filename);
                return { ...item, status: 'error', progress: 100, message: failure?.message };
              }
              return { ...item, status: 'success', progress: 100 };
            });

            this.prescriptionItems = [...uploaded, ...this.prescriptionItems];

            if (uploaded.length) {
              this.toastService.success(
                uploaded.length === 1
                  ? '1 document uploaded'
                  : `${uploaded.length} documents uploaded`
              );
            }
            if (failures.length) {
              this.toastService.error(
                `${failures.length} file${failures.length > 1 ? 's' : ''} failed to upload.`
              );
            }

            setTimeout(() => (this.prescriptionUploadingBatch = []), 2200);
            this.isUploadingPrescriptions = false;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isUploadingPrescriptions = false;
          this.toastService.error(err.error?.message || 'Upload failed. Please try again.');
          this.prescriptionUploadingBatch = this.prescriptionUploadingBatch.map((item) => ({
            ...item,
            status: 'error',
            progress: 100,
            message: 'Upload failed'
          }));
          setTimeout(() => (this.prescriptionUploadingBatch = []), 2500);
        }
      });
  }

  // Opens the structured visit-prescription form (Shiv Agri standard slip).
  openAddPrescriptionForm(): void {
    if (!this.canUploadPrescriptions) return;
    this.showStructuredPrescriptionForm = true;
    this.structuredPrescription = this.emptyStructuredPrescription();
    if (this.project?.name) {
      this.structuredPrescription.farmerName = this.project.name;
    }
    this.clearStructuredImages();
  }

  cancelStructuredPrescription(): void {
    this.showStructuredPrescriptionForm = false;
    this.structuredPrescription = this.emptyStructuredPrescription();
    this.clearStructuredImages();
  }

  cancelTextPrescription(): void {
    this.showTextPrescriptionForm = false;
    this.textPrescriptionTitle = '';
    this.textPrescriptionBody = '';
  }

  private emptyStructuredPrescription(): StructuredPrescription {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10); // yyyy-mm-dd for <input type="date">
    return {
      farmerName: '',
      visitDate: iso,
      lastVisitReview: '',
      landPreparation: '',
      sowingPlanting: '',
      farmingOperations: {
        leveling: false,
        marking: false,
        digging: false,
        soilFilling: false,
        tractor: false,
        supports: false,
        fillGaps: false,
        pruning: false,
        other: ''
      },
      irrigation: '',
      weedControl: '',
      fertilizers: { farmyardManure: false, chemical: false, organic: false, jivamrut: false, spray: false },
      pests: { soilBorne: false, root: false, stem: false, leaf: false, flower: false, fruit: false },
      diseases: { soilBorne: false, stem: false, branch: false, leaf: false, flower: false, fruit: false, other: false },
      hormoneTreatment: false,
      fruitHarvesting: false,
      grading: false,
      packing: false,
      otherNotes: ''
    };
  }

  onStructuredImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    input.value = '';

    if (this.structuredPrescriptionImages.length + files.length > MAX_FILES_PER_BATCH) {
      this.toastService.warning(`You can attach up to ${MAX_FILES_PER_BATCH} images per prescription.`);
      return;
    }

    const oversize = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      this.toastService.error(`${oversize.name} is larger than ${this.maxFileSizeMb}MB.`);
      return;
    }

    files.forEach((file) => {
      this.structuredPrescriptionImages.push(file);
      const reader = new FileReader();
      reader.onload = () => this.structuredPrescriptionImagePreviews.push(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  removeStructuredImage(index: number): void {
    this.structuredPrescriptionImages.splice(index, 1);
    this.structuredPrescriptionImagePreviews.splice(index, 1);
  }

  private clearStructuredImages(): void {
    this.structuredPrescriptionImages = [];
    this.structuredPrescriptionImagePreviews = [];
    this.structuredSaveProgress = 0;
  }

  saveStructuredPrescription(): void {
    if (!this.projectId || !this.canUploadPrescriptions) return;
    if (this.isSavingStructuredPrescription) return;

    // Coerce visitDate from yyyy-mm-dd input to ISO string for backend
    const payload: StructuredPrescription = JSON.parse(JSON.stringify(this.structuredPrescription || {}));
    if (payload.visitDate) {
      const d = new Date(payload.visitDate);
      if (!isNaN(d.getTime())) payload.visitDate = d.toISOString();
    }

    this.isSavingStructuredPrescription = true;
    this.structuredSaveProgress = 0;

    this.farmPrescriptionService.addStructuredPrescription(
      this.projectId,
      { structured: payload },
      this.structuredPrescriptionImages
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            this.structuredSaveProgress = Math.min(99, Math.round((event.loaded / event.total) * 100));
          } else if (event.kind === 'done') {
            this.structuredSaveProgress = 100;
            const created = event.prescription;
            if (created) {
              // Prepend immediately for snappy UX
              this.prescriptionItems = [created, ...this.prescriptionItems];
            }
            this.toastService.success('Prescription saved.');
            this.showStructuredPrescriptionForm = false;
            this.structuredPrescription = this.emptyStructuredPrescription();
            this.clearStructuredImages();
            this.isSavingStructuredPrescription = false;

            // Safety net: always re-sync the list from the server so the new
            // entry is guaranteed to appear (and gets the canonical _id/fields
            // for View/Download PDF actions).
            this.loadPrescriptions();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isSavingStructuredPrescription = false;
          this.structuredSaveProgress = 0;
          this.toastService.error(err.error?.error || err.error?.message || 'Unable to save prescription.');
        }
      });
  }

  /**
   * Open the prescription in a full-screen PDF overlay (same UX as reports).
   * For structured prescriptions, fetches the generated PDF from the backend.
   * For uploaded files, embeds the file URL directly.
   */
  openPrescriptionOverlay(item: PrescriptionRef): void {
    if (!this.projectId) return;
    this.activePrescription = item;
    this.isLoadingPrescriptionPreview = true;
    this.revokePrescriptionPreview();
    document.body.style.overflow = 'hidden';

    // For non-structured prescriptions, just embed the file URL.
    if (item.docType !== 'structured') {
      if (item.url) {
        this.prescriptionPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(item.url);
      }
      this.isLoadingPrescriptionPreview = false;
      return;
    }

    const rxId = item._id;
    if (!rxId) {
      this.isLoadingPrescriptionPreview = false;
      this.toastService.error('This prescription cannot be previewed.');
      this.closePrescriptionOverlay();
      return;
    }

    this.farmPrescriptionService.downloadPrescriptionPdf(this.projectId, rxId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          this.prescriptionPreviewBlobUrl = url;
          this.prescriptionPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.isLoadingPrescriptionPreview = false;
        },
        error: () => {
          this.isLoadingPrescriptionPreview = false;
          this.toastService.error('Unable to load the prescription PDF.');
          this.closePrescriptionOverlay();
        }
      });
  }

  closePrescriptionOverlay(): void {
    this.activePrescription = null;
    this.revokePrescriptionPreview();
    document.body.style.overflow = '';
  }

  private revokePrescriptionPreview(): void {
    if (this.prescriptionPreviewBlobUrl) {
      window.URL.revokeObjectURL(this.prescriptionPreviewBlobUrl);
      this.prescriptionPreviewBlobUrl = null;
    }
    this.prescriptionPreviewUrl = null;
  }

  /**
   * Trigger a browser download for any prescription. Structured prescriptions
   * use the generated PDF endpoint; file uploads use their direct URL.
   */
  downloadPrescriptionFromRow(item: PrescriptionRef): void {
    if (!this.projectId) return;
    const rxKey = this.prescriptionId(item);

    if (item.docType !== 'structured') {
      if (!item.url) {
        this.toastService.error('No file available to download.');
        return;
      }
      // Direct file — open in new tab; the browser will offer to save.
      const a = document.createElement('a');
      a.href = item.url;
      a.download = item.fileName || item.title || 'prescription';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const rxId = item._id;
    if (!rxId) {
      this.toastService.error('This prescription cannot be downloaded yet.');
      return;
    }

    this.downloadingPrescriptionId = rxKey;
    this.farmPrescriptionService.downloadPrescriptionPdf(this.projectId, rxId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const safeName = (item.title || 'prescription').replace(/[^a-z0-9\-_ ]+/gi, '').replace(/\s+/g, '_').slice(0, 60) || 'prescription';
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${safeName}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
          this.downloadingPrescriptionId = null;
        },
        error: () => {
          this.downloadingPrescriptionId = null;
          this.toastService.error('Unable to download prescription PDF.');
        }
      });
  }

  saveTextPrescription(): void {
    if (!this.projectId || !this.canUploadPrescriptions) return;
    const text = this.textPrescriptionBody.trim();
    if (!text) {
      this.toastService.warning('Please enter the prescription text before saving.');
      return;
    }

    this.isSavingTextPrescription = true;
    this.farmPrescriptionService.addTextPrescription(this.projectId, {
      title: this.textPrescriptionTitle.trim() || undefined,
      textContent: text
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.prescriptionItems = [response.prescription, ...this.prescriptionItems];
          this.toastService.success('Prescription added.');
          this.showTextPrescriptionForm = false;
          this.textPrescriptionTitle = '';
          this.textPrescriptionBody = '';
          this.isSavingTextPrescription = false;
        },
        error: (err: HttpErrorResponse) => {
          this.isSavingTextPrescription = false;
          this.toastService.error(err.error?.error || err.error?.message || 'Unable to save prescription.');
        }
      });
  }

  togglePrescription(item: PrescriptionRef): void {
    const id = this.prescriptionId(item);
    this.expandedPrescriptionId = this.expandedPrescriptionId === id ? null : id;
  }

  prescriptionId(item: PrescriptionRef): string {
    if (!item) return '';
    const raw = item._id || item.mediaId || `${item.uploadedAt}-${item.title || 'rx'}`;
    return typeof raw === 'string' ? raw : String(raw ?? '');
  }

  trackPrescription(_: number, item: PrescriptionRef): string {
    return this.prescriptionId(item);
  }

  prescriptionIcon(item: PrescriptionRef): string {
    switch (item.docType) {
      case 'image': return 'fa-file-image';
      case 'pdf': return 'fa-file-pdf';
      case 'docx': return 'fa-file-word';
      case 'text': return 'fa-file-lines';
      case 'manual': return 'fa-prescription';
      case 'structured': return 'fa-file-prescription';
      default: return 'fa-file';
    }
  }

  // Flat list of checked-item labels for the structured prescription expanded view.
  prescriptionCheckedItems(item: PrescriptionRef): string[] {
    const s = item.structured;
    if (!s) return [];
    const fo = s.farmingOperations || {};
    const f = s.fertilizers || {};
    const p = s.pests || {};
    const d = s.diseases || {};
    const tags: string[] = [];

    const push = (cond: any, label: string) => { if (cond) tags.push(label); };

    // Section 3 — Farming Operations
    push(fo.leveling, 'લેવલીંગ / Leveling');
    push(fo.marking, 'નિશાન / Marking');
    push(fo.digging, 'ખાડા ખોદવા / Digging Holes');
    push(fo.soilFilling, 'માટી ભરવી / Soil Filling');
    push(fo.tractor, 'ટ્રેક્ટર ચલાવવું / Tractor');
    push(fo.supports, 'ટેકા સરખા કરવા / Fix Supports');
    push(fo.fillGaps, 'ખાલા પુરવા / Fill Gaps');
    push(fo.pruning, 'પ્રુનીંગ / Pruning');
    if (fo.other && fo.other.trim()) tags.push(`અન્ય / Other: ${fo.other.trim()}`);

    // Section 6 — Fertilizers
    push(f.farmyardManure, 'છાણીયું ખાતર / Farmyard Manure');
    push(f.chemical, 'રાસાયણીક ખાતર / Chemical');
    push(f.organic, 'જૈવિક ખાતર / Organic');
    push(f.jivamrut, 'જીવામૃત / Jivamrut');
    push(f.spray, 'સ્પ્રે ખાતરો / Spray');

    // Section 7 — Pests
    push(p.soilBorne, 'જમીન જન્ય જીવાત / Soil-borne Pest');
    push(p.root, 'મુળની જીવાત / Root Pest');
    push(p.stem, 'થડની જીવાત / Stem Pest');
    push(p.leaf, 'પાનની જીવાત / Leaf Pest');
    push(p.flower, 'ફુલની જીવાત / Flower Pest');
    push(p.fruit, 'ફળની જીવાત / Fruit Pest');

    // Section 8 — Diseases
    push(d.soilBorne, 'જમીન જન્ય રોગ / Soil-borne Disease');
    push(d.stem, 'થડનો રોગ / Stem Disease');
    push(d.branch, 'ડાળીનો રોગ / Branch Disease');
    push(d.leaf, 'પાનનો રોગ / Leaf Disease');
    push(d.flower, 'ફુલનો રોગ / Flower Disease');
    push(d.fruit, 'ફળનો રોગ / Fruit Disease');
    push(d.other, 'અન્ય રોગ / Other Disease');

    // Sections 9-12
    push(s.hormoneTreatment, 'કલ્ટાર / Hormone Treatment');
    push(s.fruitHarvesting, 'ફળ ઉતારવા / Harvesting');
    push(s.grading, 'ગ્રેડીંગ / Grading');
    push(s.packing, 'પેકીંગ / Packing');

    return tags;
  }

  prescriptionTypeLabel(item: PrescriptionRef): string {
    switch (item.docType) {
      case 'image': return 'Image';
      case 'pdf': return 'PDF';
      case 'docx': return 'Word doc';
      case 'text': return 'Text';
      case 'manual': return 'Prescription';
      case 'structured': return 'Visit Prescription';
      default: return 'Document';
    }
  }

  formatSize(bytes?: number): string {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${Math.max(1, Math.round(kb))} KB`;
  }

  approve(): void {
    if (!this.project) return;
    this.isSubmitting = true;
    this.farmService.approveFarm(this.project.id || this.project._id || '').pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Project approved.');
        this.isSubmitting = false;
        this.loadProject();
      },
      error: (error) => {
        this.toastService.error(error?.error?.message || 'Unable to approve this project.');
        this.isSubmitting = false;
      }
    });
  }

  reject(): void {
    if (!this.project) return;
    this.isSubmitting = true;
    this.farmService.rejectFarm(this.project.id || this.project._id || '', this.rejectionReason).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.warning('Project rejected.');
        this.isSubmitting = false;
        this.rejectionReason = '';
        this.loadProject();
      },
      error: (error) => {
        this.toastService.error(error?.error?.message || 'Unable to reject this project.');
        this.isSubmitting = false;
      }
    });
  }

  changeLifecycleStatus(status: string): void {
    if (!this.project || status === this.project.status) return;
    this.isSubmitting = true;
    this.farmService.updateFarmStatus(
      this.project.id || this.project._id || '',
      status as 'approved' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled'
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (project) => {
        this.project = project;
        this.toastService.success('Project state updated.');
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastService.error(error?.error?.message || 'Unable to update project state.');
        this.isSubmitting = false;
      }
    });
  }

  submitEditRequest(payload: FarmRegistrationPayload): void {
    if (!this.project) return;
    this.isSubmitting = true;
    this.farmService.requestFarmEdit(this.project.id || this.project._id || '', payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Update request submitted for approval.');
        this.showEditForm = false;
        this.isSubmitting = false;
        this.loadProject();
      },
      error: (error) => {
        this.toastService.error(error?.error?.message || 'Unable to submit project edit request.');
        this.isSubmitting = false;
      }
    });
  }

  statusLabel(status?: string): string {
    if (!status) return 'Unknown';
    const labels: Record<string, string> = {
      pending_approval: 'Pending Approval',
      pending_quotation: 'Pending Quotation',
      pending_acceptance: 'Pending Acceptance',
      approved: 'Approved',
      rejected: 'Rejected',
      Running: 'Running',
      Completed: 'Completed',
      'On Hold': 'On Hold',
      Cancelled: 'Cancelled',
      Upcoming: 'Upcoming'
    };
    return labels[status] || status;
  }

  cropSummary(): string {
    if (!this.project?.crops?.length) return '-';
    return this.project.crops.map((crop) => crop.name).filter(Boolean).join(', ');
  }

  get farmLatitude(): number | null {
    const coords = this.project?.location?.coordinates?.coordinates;
    return Array.isArray(coords) && coords.length === 2 ? coords[1] : null;
  }

  get farmLongitude(): number | null {
    const coords = this.project?.location?.coordinates?.coordinates;
    return Array.isArray(coords) && coords.length === 2 ? coords[0] : null;
  }

  get weatherLocationLabel(): string {
    const parts = [
      this.project?.location?.taluka,
      this.project?.location?.district,
      this.project?.location?.state
    ].filter(Boolean);
    return parts.join(', ');
  }

  areaUnitLabel(unit?: string): string {
    const labels: Record<string, string> = {
      acres: 'Acres',
      hectares: 'Hectares',
      sqmeters: 'Sq. meters',
      'vigha-16': 'Vigha (16 gutha)',
      'vigha-24': 'Vigha (24 gutha)'
    };
    return unit ? labels[unit] || unit : '';
  }

  // ========================
  // Admin-only Transactions
  // ========================

  loadTransactions(): void {
    if (!this.projectId || !this.showTransactionsTab) return;
    this.transactionsLoading = true;
    this.farmAdminTransactionService.list(this.projectId, 1, 100)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.transactions = response.transactions;
          this.transactionsLoading = false;
        },
        error: () => {
          this.transactionsLoading = false;
          this.toastService.error('Unable to load transactions.');
        }
      });
  }

  refreshTransactionsSummary(): void {
    if (!this.projectId || !this.showTransactionsTab) return;
    this.farmAdminTransactionService.getSummary(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summary) => (this.transactionsSummary = summary),
        error: () => { /* silent */ }
      });
  }

  startNewTransaction(): void {
    if (!this.showTransactionsTab) return;
    this.editingTransactionId = null;
    this.transactionForm = {
      description: '',
      amount: 0,
      type: 'credit',
      category: '',
      date: this.todayIso(),
      notes: ''
    };
    this.showTransactionForm = true;
  }

  startEditTransaction(tx: FarmTransaction): void {
    if (!this.showTransactionsTab) return;
    this.editingTransactionId = tx._id;
    this.transactionForm = {
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category || '',
      date: tx.date ? tx.date.substring(0, 10) : this.todayIso(),
      notes: tx.notes || ''
    };
    this.showTransactionForm = true;
  }

  cancelTransactionForm(): void {
    this.showTransactionForm = false;
    this.editingTransactionId = null;
    this.isSavingTransaction = false;
  }

  saveTransaction(): void {
    if (!this.projectId || !this.showTransactionsTab) return;

    const description = this.transactionForm.description?.trim();
    const amount = Number(this.transactionForm.amount);

    if (!description) {
      this.toastService.warning('Please enter a description.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      this.toastService.warning('Please enter a valid amount.');
      return;
    }

    const payload: FarmTransactionPayload = {
      description,
      amount,
      type: this.transactionForm.type,
      category: this.transactionForm.category?.trim() || undefined,
      date: this.transactionForm.date || undefined,
      notes: this.transactionForm.notes?.trim() || undefined
    };

    this.isSavingTransaction = true;

    const request$ = this.editingTransactionId
      ? this.farmAdminTransactionService.update(this.projectId, this.editingTransactionId, payload)
      : this.farmAdminTransactionService.create(this.projectId, payload);

    request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saved) => {
          if (this.editingTransactionId) {
            this.transactions = this.transactions.map((tx) => (tx._id === saved._id ? saved : tx));
            this.toastService.success('Transaction updated.');
          } else {
            this.transactions = [saved, ...this.transactions];
            this.toastService.success('Transaction recorded.');
          }
          this.refreshTransactionsSummary();
          this.cancelTransactionForm();
        },
        error: (err: HttpErrorResponse) => {
          this.isSavingTransaction = false;
          this.toastService.error(err.error?.error || err.error?.message || 'Unable to save transaction.');
        }
      });
  }

  async deleteTransaction(tx: FarmTransaction): Promise<void> {
    if (!this.projectId || !this.showTransactionsTab) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Delete transaction?',
      message: `Are you sure you want to delete "${tx.description}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash'
    });
    if (!confirmed) return;

    this.isDeletingTransactionId = tx._id;
    this.farmAdminTransactionService.delete(this.projectId, tx._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.transactions = this.transactions.filter((t) => t._id !== tx._id);
          this.toastService.success('Transaction deleted.');
          this.refreshTransactionsSummary();
          this.isDeletingTransactionId = null;
          if (this.editingTransactionId === tx._id) {
            this.cancelTransactionForm();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isDeletingTransactionId = null;
          this.toastService.error(err.error?.error || err.error?.message || 'Unable to delete transaction.');
        }
      });
  }

  trackTransaction(_: number, tx: FarmTransaction): string {
    return tx._id;
  }

  formatCurrency(value: number | undefined | null): string {
    const num = Number(value || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  }

  private todayIso(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ====================================================================
  // Reports — auto-linked soil / water / fertilizer testing PDFs
  // ====================================================================

  loadReports(): void {
    if (!this.projectId) return;
    this.reportsLoading = true;
    this.farmReportService.listReports(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.reports = response.reports;
          this.reportsLoading = false;
        },
        error: () => {
          this.reportsLoading = false;
          this.toastService.error('Unable to load reports.');
        }
      });
  }

  refreshReports(): void {
    this.reports = [];
    this.loadReports();
  }

  setReportFilter(filter: 'all' | FarmReportType): void {
    this.reportFilter = filter;
  }

  get filteredReports(): FarmReport[] {
    if (this.reportFilter === 'all') return this.reports;
    return this.reports.filter((r) => r.sampleType === this.reportFilter);
  }

  get reportCounts(): { all: number; soil: number; water: number; fertilizer: number } {
    const counts = { all: this.reports.length, soil: 0, water: 0, fertilizer: 0 };
    for (const r of this.reports) {
      if (r.sampleType === 'soil') counts.soil++;
      else if (r.sampleType === 'water') counts.water++;
      else if (r.sampleType === 'fertilizer') counts.fertilizer++;
    }
    return counts;
  }

  reportTypeLabel(type: FarmReportType): string {
    if (type === 'soil') return 'Soil';
    if (type === 'water') return 'Water';
    return 'Fertilizer';
  }

  reportTypeIcon(type: FarmReportType): string {
    if (type === 'soil') return 'fa-mound';
    if (type === 'water') return 'fa-droplet';
    return 'fa-flask';
  }

  reportFileName(report: FarmReport): string {
    const base = this.reportTypeLabel(report.sampleType).toLowerCase();
    const farmer = (report.farmerName || 'Unknown').replace(/\s+/g, '_');
    const sample = report.sampleNumber ? `${report.sampleNumber}_` : '';
    return `${base}_report_${sample}${farmer}.pdf`;
  }

  trackReport(_: number, r: FarmReport): string {
    return r.reportId;
  }

  openReportOverlay(report: FarmReport): void {
    if (!this.projectId) return;
    this.activeReport = report;
    this.isLoadingReportPreview = true;
    this.revokeReportPreview();
    document.body.style.overflow = 'hidden';

    this.farmReportService.viewReportPdf(this.projectId, report.reportId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          this.reportPreviewBlobUrl = url;
          this.reportPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.isLoadingReportPreview = false;
        },
        error: () => {
          this.isLoadingReportPreview = false;
          this.toastService.error('Unable to load the report PDF.');
          this.closeReportOverlay();
        }
      });
  }

  closeReportOverlay(): void {
    this.activeReport = null;
    this.revokeReportPreview();
    document.body.style.overflow = '';
  }

  private revokeReportPreview(): void {
    if (this.reportPreviewBlobUrl) {
      window.URL.revokeObjectURL(this.reportPreviewBlobUrl);
      this.reportPreviewBlobUrl = null;
    }
    this.reportPreviewUrl = null;
  }

  downloadReport(report: FarmReport): void {
    if (!this.projectId) return;
    this.isDownloadingReportId = report.reportId;
    this.farmReportService.downloadReportPdf(this.projectId, report.reportId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.farmReportService.triggerBrowserDownload(blob, this.reportFileName(report));
          this.isDownloadingReportId = null;
        },
        error: () => {
          this.isDownloadingReportId = null;
          this.toastService.error('Unable to download the report.');
        }
      });
  }
}
