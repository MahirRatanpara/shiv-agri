import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { FarmManagementService, FarmProject, FarmRegistrationPayload } from '../../services/farm-management.service';
import { ToastService } from '../../services/toast.service';
import { FarmRegistrationFormComponent } from '../../components/farm-registration-form/farm-registration-form';

@Component({
  selector: 'app-farm-project-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FarmRegistrationFormComponent],
  templateUrl: './farm-project-details.html',
  styleUrl: './farm-project-details.css'
})
export class FarmProjectDetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  projectId = '';
  project: FarmProject | null = null;
  isLoading = true;
  isSubmitting = false;
  showEditForm = false;
  rejectionReason = '';
  currentUser: User | null = null;
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
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((user) => {
      this.currentUser = user;
    });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.projectId = params['id'];
      this.loadProject();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
}
