import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  FarmReportService,
  ManualReport,
  ManualReportSampleType
} from '../../services/farm-report.service';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { FileDeliveryService } from '../../services/file-delivery.service';
import {
  BopLineItem,
  BopQuotationPayload,
  OverpayEntry,
  Quotation,
  QuotationInstallment,
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

const PRESCRIPTION_ACCEPT = 'image/*,video/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,.md';
const PRESCRIPTION_MIME_PATTERN = /^(image\/.*|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword|text\/(plain|markdown))$/i;

type TabKey = 'overview' | 'media' | 'designs' | 'prescriptions' | 'reports' | 'transactions' | 'quotation';

@Component({
  selector: 'app-farm-project-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FarmRegistrationFormComponent, FarmWeatherComponent],
  templateUrl: './farm-project-details.html',
  styleUrl: './farm-project-details.css'
})
export class FarmProjectDetailsComponent implements OnInit, AfterViewChecked, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('tabBar') tabBar?: ElementRef<HTMLElement>;
  /** True while tabs remain off the right edge — drives the fade + chevron. */
  tabsCanScrollRight = false;

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
  deletingDesignIds = new Set<string>();

  // Prescriptions
  prescriptionItems: PrescriptionRef[] = [];
  prescriptionsLoading = false;
  isUploadingPrescriptions = false;
  prescriptionUploadingBatch: UploadProgressItem[] = [];
  expandedPrescriptionId: string | null = null;
  deletingPrescriptionIds = new Set<string>();

  // Prescription PDF overlay (mirrors reports overlay)
  activePrescription: PrescriptionRef | null = null;
  prescriptionPreviewUrl: SafeResourceUrl | null = null;
  private prescriptionPreviewBlobUrl: string | null = null;
  isLoadingPrescriptionPreview = false;

  /**
   * Android's WebView ships no PDF renderer, so an <iframe src="....pdf"> paints
   * a blank white box with no error. Detect the native shell and show an explicit
   * fallback instead of a dead frame. Videos and images still embed fine.
   */
  readonly isNativeApp = Capacitor.isNativePlatform();

  /**
   * Whether the file can be shown inline. The WebView renders images and video
   * natively — only PDFs and office documents have no inline renderer, and those
   * get handed to the OS viewer instead.
   */
  get canEmbedPrescriptionPreview(): boolean {
    if (!this.isNativeApp) return true;
    const docType = this.activePrescription?.docType;
    return docType === 'video' || docType === 'image';
  }

  /** Images render with <img>; everything embeddable else uses the iframe. */
  get isImagePrescription(): boolean {
    return this.activePrescription?.docType === 'image';
  }

  /** Label the action for what it actually is — not every file is a PDF. */
  get prescriptionDownloadLabel(): string {
    return this.activePrescription?.docType === 'pdf' ? 'Download PDF' : 'Download';
  }

  /** Documents with no inline WebView renderer — these go to the OS viewer. */
  private needsExternalViewer(item: PrescriptionRef): boolean {
    return item.docType !== 'image' && item.docType !== 'video';
  }

  /**
   * Fetch a remote file and hand it to the device's viewer. Used on native where
   * an <iframe> would render nothing for PDFs.
   */
  private openWithSystemViewer(url: string, fileName: string): void {
    this.fileDelivery.fetchAsBlob(url)
      .then((blob) => this.fileDelivery.open(blob, fileName))
      .then(() => {
        this.isLoadingPrescriptionPreview = false;
        this.closePrescriptionOverlay();
      })
      .catch(() => {
        this.isLoadingPrescriptionPreview = false;
        this.closePrescriptionOverlay();
        this.toastService.error('Unable to open this file.');
      });
  }

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

  // Manually-attached reports (admin/manager uploads images + PDFs)
  manualReports: ManualReport[] = [];
  manualReportsLoading = false;
  isUploadingManualReport = false;
  manualReportUploadingBatch: UploadProgressItem[] = [];
  deletingManualReportIds = new Set<string>();
  manualReportSampleType: ManualReportSampleType = 'other';
  readonly manualReportAccept = 'image/*,application/pdf';

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

  // Overpay / credit balance (admin-only). The form lets an admin add or
  // subtract from the running balance; magnitude is always positive and the
  // direction is chosen with the +/- toggle.
  overpayForm: { amount: number | null; note: string; direction: 'add' | 'subtract' } = {
    amount: null,
    note: '',
    direction: 'add'
  };
  isAdjustingOverpay = false;

  @ViewChild('quotationEditor') quotationEditor?: ElementRef<HTMLDivElement>;

  // Quotation tab has two subsections for landscaping farms:
  // 'annual' — the regular annual quotation flow (default)
  // 'bop'    — adhoc Bill-of-Project quotations
  // Non-landscaping farms see only 'annual'.
  quotationSubTab: 'annual' | 'bop' = 'annual';

  // BOP (Bill of Project) quotations — adhoc, landscaping-only.
  bopQuotations: Quotation[] = [];
  bopLoading = false;
  showBopForm = false;
  isSubmittingBop = false;
  bopForm: { title: string; content: string; items: BopLineItem[] } = {
    title: '',
    content: '',
    items: []
  };
  // Files staged on the create form. Cleared after submit/cancel.
  bopAttachmentDrafts: File[] = [];
  // Post-create attachment management. Indexed by quotation id.
  uploadingBopAttachmentsForId: string | null = null;
  deletingBopAttachmentIds = new Set<string>();
  readonly bopAttachmentAccept = 'image/*,application/pdf';
  selectedBopDetail: Quotation | null = null;
  selectedBopDetailSafe: SafeHtml | null = null;
  isDownloadingBopId: string | null = null;
  @ViewChild('bopEditor') bopEditor?: ElementRef<HTMLDivElement>;
  @ViewChild('bopAttachmentInput') bopAttachmentInput?: ElementRef<HTMLInputElement>;
  @ViewChild('bopDetailAttachmentInput') bopDetailAttachmentInput?: ElementRef<HTMLInputElement>;

  // Installment payment (Mark Paid & Download Invoice)
  payingInstallmentKey: string | null = null;
  downloadingInvoiceId: string | null = null;
  revertingInstallmentKey: string | null = null;

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
    private quotationService: QuotationService,
    private fileDelivery: FileDeliveryService
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
    // Photos & Videos: the farm owner who registered the farm, plus any
    // admin/manager. Admin rights are not tied to who created the farm —
    // any admin can upload photos to any farm. The backend enforces the
    // same gate (admin OR farm.projects.update OR farm owner).
    return this.isFarmOwner || this.isManagerOrAdmin;
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get canDeleteMedia(): boolean {
    // Back-compat: admin can delete anywhere; other modes use canDeleteMediaItem().
    return this.isAdmin;
  }

  /**
   * Per-item delete permission. Three modes:
   *  - Admin: any item, anywhere
   *  - Manager: items they uploaded themselves, anywhere
   *  - Farm owner: items they uploaded themselves AND still unattended
   *    (attended items have been triaged by the team — only admin/manager
   *    can remove those)
   *
   * Quota refund behaviour is handled server-side; owner self-deletes
   * intentionally don't refund the weekly quota.
   */
  canDeleteMediaItem(item: FarmMediaRef, opts: { isAttended?: boolean } = {}): boolean {
    if (!this.project || this.project.isArchived) return false;
    if (this.isAdmin) return true;

    const me = (this.currentUser?.id || '').toString();
    if (!me) return false;
    const uploadedByMe = String(item.uploadedBy || '') === me;
    if (!uploadedByMe) return false;

    if (this.isManagerOrAdmin) return true;
    if (this.isFarmOwner) {
      const attended = opts.isAttended ?? !!item.attended;
      return !attended;
    }
    return false;
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
    // Designs are no longer exclusive to landscaping projects — every farm
    // type (normal farm, landscaping, etc.) can have designs uploaded.
    return true;
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
           this.project.status === 'pending_acceptance' ||
           // Approved manager-direct farms without a quotation can have one
           // attached retroactively (see canAttachInitialQuotation).
           this.canAttachInitialQuotation;
  }

  /**
   * Admin/manager can retroactively attach an "initial" quotation to a farm
   * they created directly when no quotation was supplied at creation time.
   * Used by the "Add Quotation" CTA in the Quotation tab. The created
   * quotation is pre-accepted (no farmer acceptance needed) — see the
   * `attachInitial: true` path in quotationService.createQuotation.
   */
  get canAttachInitialQuotation(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (!this.isManagerOrAdmin) return false;
    if (this.activeQuotation) return false;
    if (this.quotationLoading) return false;
    // The farm must already be in (or past) the approved bucket — we don't
    // surface this CTA in pre-approval states, where canSubmitQuotation
    // already drives the normal flow.
    const status = this.project.status;
    return status === 'approved' ||
           status === 'Running' ||
           status === 'Completed' ||
           status === 'On Hold';
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
          // Annual quotations drive the active card. BOP quotations are
          // tracked separately and rendered in a dedicated panel.
          const annual = quotations.filter((q) => (q.kind || 'annual') === 'annual');
          this.quotationHistory = annual;
          this.bopQuotations = quotations.filter((q) => q.kind === 'bop');

          const active = annual.find((q) => q.status === 'submitted' || q.status === 'accepted') || null;
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

  // ========================
  // BOP Quotations (landscaping only)
  // ========================

  get canCreateBopQuotation(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (!this.isManagerOrAdmin) return false;
    // BOP is adhoc — only available after the annual quotation flow has
    // moved past pending_quotation/pending_acceptance.
    const status = this.project.status;
    return this.isLandscapingProject && !(
      status === 'pending_quotation' ||
      status === 'pending_acceptance' ||
      status === 'pending_approval' ||
      status === 'rejected'
    );
  }

  get showBopSection(): boolean {
    return this.isLandscapingProject && !!this.project;
  }

  /**
   * Switch between the Annual and BOP subsections inside the Quotation tab.
   * If the project isn't landscaping, only 'annual' is meaningful.
   */
  setQuotationSubTab(tab: 'annual' | 'bop'): void {
    if (tab === 'bop' && !this.showBopSection) return;
    this.quotationSubTab = tab;
  }

  openBopForm(): void {
    if (!this.canCreateBopQuotation) return;
    this.showBopForm = true;
    this.bopForm = {
      title: '',
      content: '',
      items: [{ description: '', quantity: 1, rate: 0, total: 0 }]
    };
    this.bopAttachmentDrafts = [];
    setTimeout(() => {
      if (this.bopEditor?.nativeElement) {
        this.bopEditor.nativeElement.innerHTML = '';
      }
      const formEl = document.querySelector('.bop-form-card');
      formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  cancelBopForm(): void {
    this.showBopForm = false;
    this.bopForm = { title: '', content: '', items: [] };
    this.bopAttachmentDrafts = [];
  }

  // ---- BOP create-form attachment helpers ----

  triggerBopAttachmentPicker(): void {
    this.bopAttachmentInput?.nativeElement.click();
  }

  onBopAttachmentsSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    input.value = '';

    if (this.bopAttachmentDrafts.length + incoming.length > MAX_FILES_PER_BATCH) {
      this.toastService.warning(`You can attach up to ${MAX_FILES_PER_BATCH} files per BOP quotation.`);
      return;
    }
    const oversize = incoming.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      this.toastService.error(`${oversize.name} is larger than ${this.maxFileSizeMb}MB.`);
      return;
    }
    const invalid = incoming.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (invalid) {
      this.toastService.error(`${invalid.name} is not a supported image or PDF.`);
      return;
    }
    this.bopAttachmentDrafts = [...this.bopAttachmentDrafts, ...incoming];
  }

  removeBopAttachmentDraft(index: number): void {
    this.bopAttachmentDrafts.splice(index, 1);
  }

  // ---- Existing-BOP attachment helpers (detail view) ----

  triggerBopDetailAttachmentPicker(): void {
    this.bopDetailAttachmentInput?.nativeElement.click();
  }

  onBopDetailAttachmentsSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0 || !this.selectedBopDetail) return;
    const incoming = Array.from(fileList);
    input.value = '';

    if (incoming.length > MAX_FILES_PER_BATCH) {
      this.toastService.warning(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time.`);
      return;
    }
    const oversize = incoming.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversize) {
      this.toastService.error(`${oversize.name} is larger than ${this.maxFileSizeMb}MB.`);
      return;
    }
    const invalid = incoming.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (invalid) {
      this.toastService.error(`${invalid.name} is not a supported image or PDF.`);
      return;
    }

    const quotationId = this.selectedBopDetail._id;
    this.uploadingBopAttachmentsForId = quotationId;
    this.quotationService.addBopAttachments(this.projectId, quotationId, incoming)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.uploadingBopAttachmentsForId = null;
          if (result.added.length) {
            this.toastService.success(
              result.added.length === 1
                ? '1 attachment added.'
                : `${result.added.length} attachments added.`
            );
            // Patch the open detail view + the list entry so we don't need a refetch.
            if (this.selectedBopDetail && this.selectedBopDetail._id === quotationId) {
              this.selectedBopDetail = result.quotation as any;
            }
            this.bopQuotations = this.bopQuotations.map((q) =>
              q._id === quotationId ? (result.quotation as any) : q
            );
          }
          if (result.failures.length) {
            this.toastService.error(`${result.failures.length} file(s) failed to upload.`);
          }
        },
        error: (err) => {
          this.uploadingBopAttachmentsForId = null;
          this.toastService.error(err?.error?.message || 'Unable to add attachments.');
        }
      });
  }

  async confirmRemoveBopAttachment(quotation: Quotation, attachment: any, event?: Event): Promise<void> {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (!attachment?._id) return;
    if (this.deletingBopAttachmentIds.has(attachment._id)) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Remove this attachment?',
      message: `"${attachment.fileName || 'Attachment'}" will be removed from this BOP quotation.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash-alt'
    });
    if (!confirmed) return;

    this.deletingBopAttachmentIds.add(attachment._id);
    this.quotationService.removeBopAttachment(this.projectId, quotation._id, attachment._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingBopAttachmentIds.delete(attachment._id);
          const filtered = (quotation.attachments || []).filter((a: any) => a._id !== attachment._id);
          (quotation as any).attachments = filtered;
          if (this.selectedBopDetail && this.selectedBopDetail._id === quotation._id) {
            (this.selectedBopDetail as any).attachments = filtered;
          }
          this.toastService.success('Attachment removed.');
        },
        error: (err) => {
          this.deletingBopAttachmentIds.delete(attachment._id);
          this.toastService.error(err?.error?.message || 'Unable to remove attachment.');
        }
      });
  }

  openBopAttachment(attachment: any): void {
    if (attachment?.url) window.open(attachment.url, '_blank', 'noopener');
  }

  bopAttachmentIcon(att: any): string {
    if (att?.mimeType === 'application/pdf') return 'fa-file-pdf';
    if (att?.mimeType?.startsWith('image/')) return 'fa-file-image';
    return 'fa-file';
  }

  addBopLineItem(): void {
    this.bopForm.items.push({ description: '', quantity: 1, rate: 0, total: 0 });
  }

  removeBopLineItem(index: number): void {
    if (this.bopForm.items.length <= 1) return;
    this.bopForm.items.splice(index, 1);
  }

  onBopLineChanged(index: number): void {
    const it = this.bopForm.items[index];
    if (!it) return;
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    // Only overwrite total when both qty and rate are set; otherwise leave
    // whatever the user typed manually so they can override the auto-calc.
    if (qty > 0 && rate > 0) {
      it.total = Math.round(qty * rate * 100) / 100;
    }
  }

  /** Recompute totals across all rows. Used right before saving so the
   * on-screen total reflects the final keystroke even when ngModelChange
   * hasn't fired (e.g. user clicks Save while still focused in an input). */
  private recomputeBopTotals(): void {
    this.bopForm.items.forEach((it, i) => this.onBopLineChanged(i));
  }

  get bopTotal(): number {
    return this.bopForm.items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  }

  applyBopFormat(command: string, value: string | undefined = undefined): void {
    const editor = this.bopEditor?.nativeElement;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    this.syncBopEditorContent();
  }

  syncBopEditorContent(): void {
    const editor = this.bopEditor?.nativeElement;
    if (!editor) return;
    this.bopForm.content = editor.innerHTML;
  }

  submitBopQuotation(): void {
    if (!this.projectId || !this.canCreateBopQuotation) return;

    this.syncBopEditorContent();
    this.recomputeBopTotals();
    // Scope/notes content is optional — line items below are the contract.
    const content = (this.bopForm.content || '').trim();

    // Normalize line items. Total is computed defensively from qty * rate
    // when the auto-compute hasn't fired (e.g., the user typed in the rate
    // and clicked Save without blurring). Items are kept as long as they
    // have a description AND any usable amount (manual total OR qty*rate).
    const items = this.bopForm.items
      .map((it) => {
        const description = String(it.description || '').trim();
        const quantity = Number(it.quantity) || 0;
        const rate = Number(it.rate) || 0;
        let total = Number(it.total) || 0;
        if (total <= 0 && quantity > 0 && rate > 0) {
          total = Math.round(quantity * rate * 100) / 100;
        }
        return { description, quantity, rate, total };
      })
      .filter((it) => it.description.length > 0 && it.total > 0);

    if (!items.length) {
      const hasAnyDescription = this.bopForm.items.some((it) => String(it.description || '').trim());
      const message = hasAnyDescription
        ? 'Each line item needs both a description and an amount (qty × rate > 0 or a non-zero total).'
        : 'Add at least one line item with a description and amount.';
      this.toastService.warning(message);
      return;
    }

    const payload: BopQuotationPayload = {
      title: this.bopForm.title.trim() || undefined,
      content,
      bopItems: items
    };

    this.isSubmittingBop = true;
    this.quotationService.createBopQuotation(this.projectId, payload, this.bopAttachmentDrafts)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastService.success('BOP quotation created.');
          if (result.attachmentFailures && result.attachmentFailures.length) {
            this.toastService.error(
              `${result.attachmentFailures.length} attachment(s) failed to upload.`
            );
          }
          this.isSubmittingBop = false;
          this.showBopForm = false;
          this.bopAttachmentDrafts = [];
          this.loadQuotations();
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmittingBop = false;
          // Surface the actual backend message so the user sees why it
          // failed (validation, permission, archive state, etc.).
          const msg = err?.error?.message
            || err?.error?.error
            || err?.message
            || 'Unable to create BOP quotation.';
          this.toastService.error(msg);
          console.error('[BOP] save failed', err);
        }
      });
  }

  openBopDetail(quotation: Quotation): void {
    this.selectedBopDetail = quotation;
    this.selectedBopDetailSafe = this.sanitizer.bypassSecurityTrustHtml(quotation.content);
    document.body.style.overflow = 'hidden';
  }

  closeBopDetail(): void {
    this.selectedBopDetail = null;
    this.selectedBopDetailSafe = null;
    document.body.style.overflow = '';
  }

  downloadBopPdf(quotation: Quotation): void {
    if (!quotation || !this.projectId) return;
    if (this.isDownloadingBopId) return;
    this.isDownloadingBopId = quotation._id;
    this.quotationService.downloadPdf(this.projectId, quotation._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const farm = (this.project?.name || 'farm').replace(/\s+/g, '_');
          const dateStr = new Date(quotation.createdAt).toISOString().slice(0, 10);
          const filename = `BOP_${farm}_${dateStr}.pdf`;
          void this.fileDelivery.download(blob, filename, 'application/pdf');
          this.isDownloadingBopId = null;
        },
        error: (err: HttpErrorResponse) => {
          this.isDownloadingBopId = null;
          this.toastService.error(err?.error?.message || 'Unable to download BOP PDF.');
        }
      });
  }

  trackBop(_: number, q: Quotation): string {
    return q._id;
  }

  // ========================
  // Installment payment + invoice download
  // ========================

  private installmentKey(q: Quotation, n: number): string {
    return `${q._id}:${n}`;
  }

  canMarkInstallmentPaid(installment: QuotationInstallment): boolean {
    if (!this.isManagerOrAdmin) return false;
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (installment.status === 'paid') return false;
    return this.project.status === 'approved' ||
      this.project.status === 'Running' ||
      this.project.status === 'Completed';
  }

  async markInstallmentPaid(quotation: Quotation, installment: QuotationInstallment): Promise<void> {
    if (!quotation || !this.projectId) return;
    if (!this.canMarkInstallmentPaid(installment)) return;
    const key = this.installmentKey(quotation, installment.installmentNumber);
    if (this.payingInstallmentKey === key) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Mark this installment as paid?',
      message: `Installment ${installment.installmentNumber} of 4 (${this.formatCurrency(installment.amount)}) will be marked paid and a new invoice will be generated for download.`,
      confirmText: 'Mark Paid',
      cancelText: 'Cancel',
      confirmClass: 'btn-primary',
      icon: 'fas fa-check'
    });
    if (!confirmed) return;

    this.payingInstallmentKey = key;
    this.quotationService.markInstallmentPaid(
      this.projectId,
      quotation._id,
      installment.installmentNumber
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.payingInstallmentKey = null;
          this.toastService.success(
            result.alreadyPaid
              ? 'This installment was already paid. Downloading existing invoice.'
              : 'Installment marked paid. Downloading invoice...'
          );
          // Refresh quotation state so the installment renders as paid + invoice link.
          this.loadQuotations();
          const invoiceId = result.invoice?.id || result.invoice?._id;
          if (invoiceId) this.downloadInvoice(invoiceId);
        },
        error: (err: HttpErrorResponse) => {
          this.payingInstallmentKey = null;
          this.toastService.error(err?.error?.message || 'Unable to mark installment paid.');
        }
      });
  }

  /**
   * Download the invoice PDF for a paid installment. Used by both the
   * post-mark-paid flow and the standalone "Download Invoice" button on
   * already-paid installments.
   */
  downloadInvoice(invoiceId: string): void {
    if (!invoiceId || this.downloadingInvoiceId === invoiceId) return;
    this.downloadingInvoiceId = invoiceId;
    this.quotationService.downloadInvoicePdf(invoiceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const farm = (this.project?.name || 'farm').replace(/\s+/g, '_');
          const filename = `Invoice_${invoiceId}_${farm}.pdf`;
          void this.fileDelivery.download(blob, filename, 'application/pdf');
          this.downloadingInvoiceId = null;
        },
        error: (err: HttpErrorResponse) => {
          this.downloadingInvoiceId = null;
          this.toastService.error(err?.error?.message || 'Unable to download invoice.');
        }
      });
  }

  isMarkingInstallmentPaid(quotation: Quotation, installment: QuotationInstallment): boolean {
    return this.payingInstallmentKey === this.installmentKey(quotation, installment.installmentNumber);
  }

  /**
   * Admin-only: whether the current user can revert a paid installment.
   * Reverting is more destructive than marking paid (it removes the invoice
   * from the customer's history) so it's gated to admins.
   */
  canRevertInstallmentPayment(installment: QuotationInstallment): boolean {
    if (!this.isAdmin) return false;
    if (!this.project || this.project.isArchived) return false;
    return installment.status === 'paid';
  }

  isRevertingInstallment(quotation: Quotation, installment: QuotationInstallment): boolean {
    return this.revertingInstallmentKey === this.installmentKey(quotation, installment.installmentNumber);
  }

  async revertInstallmentPayment(quotation: Quotation, installment: QuotationInstallment): Promise<void> {
    if (!quotation || !this.projectId) return;
    if (!this.canRevertInstallmentPayment(installment)) return;
    const key = this.installmentKey(quotation, installment.installmentNumber);
    if (this.revertingInstallmentKey === key) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: `Revert installment ${installment.installmentNumber}?`,
      message: installment.invoiceNumber
        ? `This will reset installment ${installment.installmentNumber} of 4 to pending and remove invoice ${installment.invoiceNumber} from the customer's history. The action can be undone by marking the installment paid again (a new invoice will be issued).`
        : `This will reset installment ${installment.installmentNumber} of 4 to pending.`,
      confirmText: 'Revert Payment',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-undo'
    });
    if (!confirmed) return;

    this.revertingInstallmentKey = key;
    this.quotationService.revertInstallmentPayment(
      this.projectId,
      quotation._id,
      installment.installmentNumber
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.revertingInstallmentKey = null;
          this.toastService.success(
            result.invoiceSoftDeleted
              ? `Installment reverted. Invoice ${result.invoiceNumber || ''} removed.`
              : 'Installment reverted.'
          );
          this.loadQuotations();
        },
        error: (err: HttpErrorResponse) => {
          this.revertingInstallmentKey = null;
          this.toastService.error(err?.error?.message || 'Unable to revert installment payment.');
        }
      });
  }

  // ========================
  // Overpay / credit balance (admin only)
  // ========================

  /** Only admins can view and adjust the overpay balance. */
  get canManageOverpay(): boolean {
    return this.isAdmin && !!this.project && !this.project.isArchived;
  }

  /** Current overpay balance on the active quotation (0 when unset). */
  get overpayBalance(): number {
    return this.activeQuotation?.overpay?.balance ?? 0;
  }

  /** Ledger entries for the active quotation, newest first. */
  get overpayEntries(): OverpayEntry[] {
    const entries = this.activeQuotation?.overpay?.entries ?? [];
    return [...entries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  setOverpayDirection(direction: 'add' | 'subtract'): void {
    this.overpayForm.direction = direction;
  }

  submitOverpayAdjustment(): void {
    if (!this.projectId || !this.activeQuotation || !this.canManageOverpay) return;
    if (this.isAdjustingOverpay) return;

    const magnitude = Number(this.overpayForm.amount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      this.toastService.error('Enter an amount greater than zero.');
      return;
    }

    const delta = this.overpayForm.direction === 'subtract' ? -magnitude : magnitude;

    // Guard against driving the balance negative before hitting the server.
    if (this.overpayBalance + delta < 0) {
      this.toastService.error(
        `Cannot subtract ${this.formatCurrency(magnitude)} — overpay balance is only ${this.formatCurrency(this.overpayBalance)}.`
      );
      return;
    }

    this.isAdjustingOverpay = true;
    this.quotationService.adjustOverpay(
      this.projectId,
      this.activeQuotation._id,
      delta,
      this.overpayForm.note?.trim() || undefined
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.isAdjustingOverpay = false;
          if (result.quotation) {
            this.activeQuotation = result.quotation;
          }
          this.overpayForm = { amount: null, note: '', direction: 'add' };
          this.toastService.success(
            `Overpay balance updated to ${this.formatCurrency(result.balance)}.`
          );
        },
        error: (err: HttpErrorResponse) => {
          this.isAdjustingOverpay = false;
          this.toastService.error(err?.error?.message || 'Unable to update overpay balance.');
        }
      });
  }

  /**
   * When true, submitQuotation() sends `attachInitial: true` so the new
   * quotation lands as already-accepted without flipping the project status
   * back into pending_acceptance. Used by the "Add Quotation" CTA on
   * orphan manager-direct farms.
   */
  private attachQuotationOnSubmit = false;

  openQuotationForm(opts: { attachInitial?: boolean } = {}): void {
    if (!opts.attachInitial && !this.canSubmitQuotation) return;
    if (opts.attachInitial && !this.canAttachInitialQuotation) return;

    this.attachQuotationOnSubmit = !!opts.attachInitial;

    // When revising an existing quotation, prefill with the previous quotation's
    // content, amount, and first-instalment date. Falls back to today's date
    // for a brand-new quotation.
    const existing = opts.attachInitial ? null : this.activeQuotation;
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

  /** Convenience opener for the "Add Quotation" CTA on orphan farms. */
  openAttachInitialQuotationForm(): void {
    this.openQuotationForm({ attachInitial: true });
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
          void this.fileDelivery.download(blob, filename, 'application/pdf');
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
    this.attachQuotationOnSubmit = false;
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

    // Quotation details (rich-text content) are optional — the annual
    // amount alone is enough to lock in the schedule.
    if (!Number.isFinite(amount) || amount <= 0) {
      this.toastService.warning('Please enter a valid annual amount.');
      return;
    }

    const attachInitial = this.attachQuotationOnSubmit;
    const payload: QuotationPayload = {
      content,
      amountPerYear: amount,
      startDate: this.quotationForm.startDate || undefined,
      // attachInitial=true means "this farm is already approved; attach this
      // quotation as already-accepted without flipping the status flow."
      attachInitial: attachInitial || undefined
    };

    this.isSubmittingQuotation = true;
    this.quotationService.submit(this.projectId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastService.success(
            attachInitial
              ? 'Quotation attached to this farm.'
              : 'Quotation sent to the farmer for review.'
          );
          this.isSubmittingQuotation = false;
          this.showQuotationForm = false;
          this.attachQuotationOnSubmit = false;
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

  /**
   * The tab strip appears only once the project resolves, and tabs are added as
   * permissions and counts arrive — so measure after each check rather than once.
   * The write is guarded to a real change to avoid an expression-changed loop.
   */
  ngAfterViewChecked(): void {
    this.updateTabScrollHint();
  }

  /**
   * Recomputes whether any tab is still hidden past the right edge. Called on
   * scroll, on resize, and after the tab list changes (tabs are permission- and
   * data-gated, so the count varies per user and per project).
   */
  updateTabScrollHint(): void {
    const el = this.tabBar?.nativeElement;
    // 4px slack: sub-pixel widths otherwise leave the hint stuck on at the end.
    const next = el ? el.scrollWidth - el.clientWidth - el.scrollLeft > 4 : false;
    // Only assign on change — ngAfterViewChecked runs constantly, and an
    // unconditional write would trip ExpressionChangedAfterItHasBeenChecked.
    if (next !== this.tabsCanScrollRight) {
      this.tabsCanScrollRight = next;
    }
  }

  onTabBarScroll(): void {
    this.updateTabScrollHint();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateTabScrollHint();
  }

  /** Nudge the strip along by most of a screen so the next tabs come into view. */
  scrollTabsRight(): void {
    const el = this.tabBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: Math.max(el.clientWidth * 0.7, 140), behavior: 'smooth' });
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
    if (!this.canDeleteMediaItem(item) || this.deletingMediaIds.has(item.mediaId)) return;

    // Owner self-delete shows a different message so the farmer understands
    // their weekly upload quota will NOT be returned.
    const isOwnerSelfDelete = !this.isAdmin && !this.isManagerOrAdmin && this.isFarmOwner;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Delete this photo?',
      message: isOwnerSelfDelete
        ? `This will remove the ${item.type} from the farm record. Note: deleting your own upload does NOT restore this week's upload allowance.`
        : `This will permanently remove the ${item.type} from the farm record. This cannot be undone.`,
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
      icon: archived ? 'fas fa-undo' : 'fas fa-archive'
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

    // Designs accept any file type — no MIME validation.

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
    // Non-media files (PDF, doc, zip, etc.) can't be shown in the lightbox —
    // open them in a new tab so the browser downloads/previews them.
    if (item.type !== 'image' && item.type !== 'video') {
      window.open(item.url, '_blank', 'noopener');
      return;
    }
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

  /**
   * Whether the current user can delete this design.
   * Admin: any design. Manager: only items they uploaded themselves.
   */
  canDeleteDesign(item: FarmDesignRef): boolean {
    if (!this.project || this.project.isArchived) return false;
    if (this.isAdmin) return true;
    if (!this.isManagerOrAdmin) return false;
    const me = (this.currentUser?.id || '').toString();
    return !!me && String(item.uploadedBy || '') === me;
  }

  async confirmDeleteDesign(item: FarmDesignRef, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.canDeleteDesign(item)) return;
    const designId = (item as any)._id;
    if (!designId || this.deletingDesignIds.has(designId)) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Delete this design?',
      message: `This will remove the landscaping ${item.type} from the project record. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash-alt'
    });
    if (!confirmed) return;

    this.deletingDesignIds.add(designId);
    this.farmDesignService.deleteDesign(this.projectId, designId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingDesignIds.delete(designId);
          this.designItems = this.designItems.filter((d: any) => d._id !== designId);
          if ((this.designLightboxItem as any)?._id === designId) this.closeDesignLightbox();
          this.toastService.success('Design removed.');
        },
        error: (err: HttpErrorResponse) => {
          this.deletingDesignIds.delete(designId);
          this.toastService.error(err?.error?.message || 'Unable to delete this design.');
        }
      });
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
      if (!item.url) {
        this.isLoadingPrescriptionPreview = false;
        return;
      }
      // Native + PDF/office doc: nothing renders those inline, so hand the file
      // to the OS viewer. Images and video stay inline everywhere — the WebView
      // renders them natively.
      if (this.isNativeApp && this.needsExternalViewer(item)) {
        this.openWithSystemViewer(item.url, item.fileName || item.title || 'prescription');
        return;
      }
      this.prescriptionPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(item.url);
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
          // Native: open the generated PDF in the device's viewer. The bytes go
          // to the app cache (not Documents) purely so the OS has a file handle
          // to open — nothing is saved to the user's storage.
          if (this.isNativeApp) {
            const name = `${(item.title || 'prescription').replace(/[^a-z0-9\-_ ]+/gi, '').replace(/\s+/g, '_').slice(0, 60) || 'prescription'}.pdf`;
            this.isLoadingPrescriptionPreview = false;
            this.closePrescriptionOverlay();
            this.fileDelivery.open(blob, name, 'application/pdf')
              .catch(() => this.toastService.error('No app on this device can open PDFs.'));
            return;
          }
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
      const name = item.fileName || item.title || 'prescription';
      // Native: <a download> is inert in a WebView — fetch the bytes and write a
      // real file so the OS can save/open it.
      if (this.fileDelivery.needsNativeViewer) {
        this.downloadingPrescriptionId = rxKey;
        this.fileDelivery.fetchAsBlob(item.url)
          .then((blob) => this.fileDelivery.download(blob, name))
          .then(() => { this.downloadingPrescriptionId = null; })
          .catch(() => {
            this.downloadingPrescriptionId = null;
            this.toastService.error('Unable to download this file.');
          });
        return;
      }
      // Direct file — open in new tab; the browser will offer to save.
      const a = document.createElement('a');
      a.href = item.url;
      a.download = name;
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
          void this.fileDelivery.download(blob, `${safeName}.pdf`, 'application/pdf');
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

  /**
   * Whether the current user can delete this prescription.
   * Admin: any prescription. Manager: only items they uploaded.
   */
  canDeletePrescription(item: PrescriptionRef): boolean {
    if (!this.project || this.project.isArchived) return false;
    if (this.isAdmin) return true;
    if (!this.isManagerOrAdmin) return false;
    const me = (this.currentUser?.id || '').toString();
    return !!me && String(item.uploadedBy || '') === me;
  }

  async confirmDeletePrescription(item: PrescriptionRef, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.canDeletePrescription(item)) return;
    const id = item._id;
    if (!id || this.deletingPrescriptionIds.has(id)) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Delete this prescription?',
      message: `"${item.title || item.fileName || 'Prescription'}" will be removed from the farm record. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash-alt'
    });
    if (!confirmed) return;

    this.deletingPrescriptionIds.add(id);
    this.farmPrescriptionService.deletePrescription(this.projectId, id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingPrescriptionIds.delete(id);
          this.prescriptionItems = this.prescriptionItems.filter((p) => p._id !== id);
          if (this.activePrescription?._id === id) this.closePrescriptionOverlay();
          if (this.expandedPrescriptionId === id) this.expandedPrescriptionId = null;
          this.toastService.success('Prescription removed.');
        },
        error: (err: HttpErrorResponse) => {
          this.deletingPrescriptionIds.delete(id);
          this.toastService.error(err?.error?.message || 'Unable to delete this prescription.');
        }
      });
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
      case 'video': return 'fa-file-video';
      case 'pdf': return 'fa-file-pdf';
      case 'docx': return 'fa-file-word';
      case 'text': return 'fa-file-alt';
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
      case 'video': return 'Video';
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

  /**
   * Open the full-screen edit overlay. Locks page scroll so the modal owns
   * the viewport; closeEditForm() restores it. We also stash whatever the
   * caller had set on document.body.style.overflow so closing a stacked
   * modal (lightbox + edit) doesn't strand the page in `hidden`.
   */
  openEditForm(): void {
    if (!this.canEdit) return;
    this.showEditForm = true;
    document.body.style.overflow = 'hidden';
  }

  closeEditForm(): void {
    if (this.isSubmitting) return;
    this.showEditForm = false;
    document.body.style.overflow = '';
  }

  submitEditRequest(payload: FarmRegistrationPayload): void {
    if (!this.project) return;
    this.isSubmitting = true;
    this.farmService.requestFarmEdit(this.project.id || this.project._id || '', payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        // Approver edits are in-place (no re-approval); farmer edits still
        // go through the review flow. The toast wording matches both paths.
        this.toastService.success(this.isFarmer
          ? 'Update request submitted for approval.'
          : 'Project updated.');
        this.showEditForm = false;
        document.body.style.overflow = '';
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
    // Manual reports load alongside the auto-linked ones so the user sees
    // both lists when the Reports tab opens.
    this.loadManualReports();
  }

  refreshReports(): void {
    this.reports = [];
    this.manualReports = [];
    this.loadReports();
  }

  // ========================
  // Manual reports (admin/manager attach images + PDFs)
  // ========================

  get canUploadManualReports(): boolean {
    if (!this.project) return false;
    if (this.project.isArchived) return false;
    if (this.isPreApproval) return false;
    return this.isManagerOrAdmin;
  }

  canDeleteManualReport(item: ManualReport): boolean {
    if (!this.project || this.project.isArchived) return false;
    if (this.isAdmin) return true;
    if (!this.isManagerOrAdmin) return false;
    const me = (this.currentUser?.id || '').toString();
    return !!me && String(item.uploadedBy || '') === me;
  }

  loadManualReports(): void {
    if (!this.projectId) return;
    this.manualReportsLoading = true;
    this.farmReportService.listManualReports(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.manualReports = items;
          this.manualReportsLoading = false;
        },
        error: () => {
          this.manualReportsLoading = false;
        }
      });
  }

  triggerManualReportPicker(): void {
    if (!this.canUploadManualReports || this.isUploadingManualReport) return;
    const input = document.getElementById('manualReportInput') as HTMLInputElement | null;
    input?.click();
  }

  setManualReportSampleType(type: ManualReportSampleType): void {
    this.manualReportSampleType = type;
  }

  onManualReportFilesSelected(event: Event): void {
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

    const invalid = files.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (invalid) {
      this.toastService.error(`${invalid.name} is not a supported image or PDF.`);
      return;
    }

    this.uploadManualReportFiles(files);
  }

  private uploadManualReportFiles(files: File[]): void {
    if (!this.projectId) return;
    this.isUploadingManualReport = true;
    this.manualReportUploadingBatch = files.map((file) => ({
      filename: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0
    }));

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    this.farmReportService.uploadManualReports(this.projectId, files, {
      sampleType: this.manualReportSampleType
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            const ratio = totalBytes > 0 ? event.loaded / totalBytes : 0;
            this.manualReportUploadingBatch = this.manualReportUploadingBatch.map((item) =>
              item.status === 'uploading'
                ? { ...item, progress: Math.min(99, Math.round(ratio * 100)) }
                : item
            );
          } else if (event.kind === 'done') {
            const { uploaded, failures } = event.result;
            const failedNames = new Set(failures.map((f) => f.filename));
            this.manualReportUploadingBatch = this.manualReportUploadingBatch.map((item) => {
              if (failedNames.has(item.filename)) {
                const failure = failures.find((f) => f.filename === item.filename);
                return { ...item, status: 'error', progress: 100, message: failure?.message };
              }
              return { ...item, status: 'success', progress: 100 };
            });

            this.manualReports = [...uploaded, ...this.manualReports];

            if (uploaded.length) {
              this.toastService.success(
                uploaded.length === 1 ? '1 report attached' : `${uploaded.length} reports attached`
              );
            }
            if (failures.length) {
              this.toastService.error(
                `${failures.length} file${failures.length > 1 ? 's' : ''} failed to upload.`
              );
            }

            setTimeout(() => (this.manualReportUploadingBatch = []), 2200);
            this.isUploadingManualReport = false;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isUploadingManualReport = false;
          this.toastService.error(err.error?.message || 'Upload failed. Please try again.');
          this.manualReportUploadingBatch = this.manualReportUploadingBatch.map((item) => ({
            ...item,
            status: 'error',
            progress: 100,
            message: 'Upload failed'
          }));
          setTimeout(() => (this.manualReportUploadingBatch = []), 2500);
        }
      });
  }

  async confirmDeleteManualReport(item: ManualReport, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.canDeleteManualReport(item) || !item._id) return;
    if (this.deletingManualReportIds.has(item._id)) return;

    const confirmed = await this.confirmationModalService.confirm({
      title: 'Delete this report?',
      message: `"${item.title || item.fileName || 'Report'}" will be removed from the farm record.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash-alt'
    });
    if (!confirmed) return;

    const id = item._id;
    this.deletingManualReportIds.add(id);
    this.farmReportService.deleteManualReport(this.projectId, id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingManualReportIds.delete(id);
          this.manualReports = this.manualReports.filter((m) => m._id !== id);
          this.toastService.success('Report removed.');
        },
        error: (err: HttpErrorResponse) => {
          this.deletingManualReportIds.delete(id);
          this.toastService.error(err?.error?.message || 'Unable to delete this report.');
        }
      });
  }

  trackManualReport(_: number, item: ManualReport): string {
    return item._id || item.mediaId;
  }

  manualReportTypeLabel(type: ManualReportSampleType): string {
    switch (type) {
      case 'soil': return 'Soil';
      case 'water': return 'Water';
      case 'fertilizer': return 'Fertilizer';
      default: return 'Other';
    }
  }

  manualReportIcon(item: ManualReport): string {
    if (item.mimeType === 'application/pdf') return 'fa-file-pdf';
    if (item.mimeType?.startsWith('image/')) return 'fa-file-image';
    return 'fa-file';
  }

  openManualReport(item: ManualReport): void {
    if (item.url) window.open(item.url, '_blank', 'noopener');
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
    if (type === 'soil') return 'fa-mountain';
    if (type === 'water') return 'fa-tint';
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
          // Native: open in the device's PDF viewer. Cached only so the OS has a
          // file handle — nothing lands in the user's Documents.
          if (this.isNativeApp) {
            const name = `${(report.farmerName || 'report').replace(/[^a-z0-9\-_ ]+/gi, '').replace(/\s+/g, '_').slice(0, 60) || 'report'}.pdf`;
            this.isLoadingReportPreview = false;
            this.closeReportOverlay();
            this.fileDelivery.open(blob, name, 'application/pdf')
              .catch(() => this.toastService.error('No app on this device can open PDFs.'));
            return;
          }
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
