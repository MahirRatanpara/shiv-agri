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
import { FarmRegistrationFormComponent } from '../../components/farm-registration-form/farm-registration-form';
import { FarmWeatherComponent } from '../../components/farm-weather/farm-weather';
import {
  FarmMediaQuota,
  FarmMediaRef,
  FarmMediaService
} from '../../services/farm-media.service';

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

  projectId = '';
  project: FarmProject | null = null;
  isLoading = true;
  isSubmitting = false;
  showEditForm = false;
  rejectionReason = '';
  currentUser: User | null = null;
  activeTab: 'overview' | 'media' = 'overview';

  mediaItems: FarmMediaRef[] = [];
  mediaLoading = false;
  quota: FarmMediaQuota | null = null;
  uploadingBatch: UploadProgressItem[] = [];
  isUploading = false;
  lightboxItem: FarmMediaRef | null = null;
  readonly maxFilesPerBatch = MAX_FILES_PER_BATCH;
  readonly maxFileSizeMb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));

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
    private farmMediaService: FarmMediaService
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
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
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
          this.quota = response.quota;

          const message = fresh.length === 1
            ? 'New photo added to your farm. Tap Photos & Videos to view.'
            : `${fresh.length} new photos added to your farm.`;
          this.toastService.info(message, 5000);

          // If they're already on the media tab, the new tiles will appear at the top.
          // If they're on Overview, surface the count via the tab badge.
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
      !['pending_approval', 'rejected'].includes(this.project.status);
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
    if (['pending_approval', 'rejected'].includes(this.project.status)) return false;
    if (this.permissionService.hasPermission('farm.projects.update')) return true;
    return this.isFarmOwner;
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
        },
        error: () => {
          this.isLoading = false;
          this.toastService.error('Unable to load project details.');
          this.router.navigate(['/farm-management']);
        }
      });
  }

  switchTab(tab: 'overview' | 'media'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'media' && this.mediaItems.length === 0 && !this.mediaLoading) {
      this.loadMedia();
    } else if (tab === 'media' && !this.quota) {
      this.refreshQuota();
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
          this.quota = response.quota;
          this.knownMediaIds = new Set(response.items.map((m) => m.mediaId));
          this.mediaLoading = false;
        },
        error: () => {
          this.mediaLoading = false;
          this.toastService.error('Unable to load farm media.');
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
    if (this.quota && this.quota.used >= this.quota.limit) {
      this.toastService.warning(`Weekly upload limit of ${this.quota.limit} reached. Resets ${this.quotaResetsLabel}.`);
      return;
    }
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

    if (this.quota && this.quota.used + files.length > this.quota.limit) {
      const remaining = Math.max(this.quota.limit - this.quota.used, 0);
      this.toastService.warning(
        remaining > 0
          ? `Only ${remaining} more upload(s) allowed this week.`
          : `Weekly upload limit reached.`
      );
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
}
