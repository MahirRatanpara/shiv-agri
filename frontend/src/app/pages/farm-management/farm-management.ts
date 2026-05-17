import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { FarmManagementService, FarmProject, FarmRegistrationPayload } from '../../services/farm-management.service';
import { ToastService } from '../../services/toast.service';
import { FarmRegistrationFormComponent } from '../../components/farm-registration-form/farm-registration-form';

@Component({
  selector: 'app-farm-management',
  standalone: true,
  imports: [CommonModule, FormsModule, FarmRegistrationFormComponent],
  templateUrl: './farm-management.html',
  styleUrl: './farm-management.css'
})
export class FarmManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  currentUser: User | null = null;
  farms: FarmProject[] = [];
  filteredFarms: FarmProject[] = [];
  districtOptions: string[] = [];
  isLoading = true;
  isSubmitting = false;
  showForm = false;
  pendingCount = 0;
  activeTab: 'all' | 'pending' | 'mine' = 'all';
  searchQuery = '';
  selectedStatus = '';
  selectedDistrict = '';
  selectedSource = '';
  showLandscapingOnly = false;
  sortBy: 'updatedAt' | 'name' | 'submittedAt' = 'updatedAt';
  formMode: 'create' | 'edit' = 'create';
  editingFarm: FarmProject | null = null;

  constructor(
    private authService: AuthService,
    private permissionService: PermissionService,
    private farmService: FarmManagementService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        this.currentUser = user;
        if (user) this.loadFarms();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isFarmer(): boolean {
    return this.currentUser?.role === 'user' || this.currentUser?.role === 'end_user';
  }

  get canApprove(): boolean {
    return this.permissionService.hasPermission('farm.projects.approve');
  }

  get canCreateDirectly(): boolean {
    return !this.isFarmer && (
      this.permissionService.hasPermission('farm.projects.create') ||
      this.permissionService.hasPermission('project.create')
    );
  }

  get showLinkedMobileStat(): boolean {
    return this.isFarmer;
  }

  loadFarms(): void {
    this.isLoading = true;
    const statusFilter = this.isFarmer
      ? this.selectedStatus
      : (this.activeTab === 'pending'
          ? 'pending_approval,pending_quotation,pending_acceptance'
          : this.selectedStatus);
    const submittedFilter = (this.isFarmer || this.activeTab === 'mine') ? 'me' as const : undefined;

    const options = {
      status: statusFilter || undefined,
      submittedBy: submittedFilter,
      search: this.searchQuery || undefined,
      district: this.selectedDistrict || undefined,
      sortBy: this.sortBy,
      sortOrder: this.sortBy === 'name' ? 'asc' as const : 'desc' as const
    };

    this.farmService.getFarms(options)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.farms = result.farms;
          this.pendingCount = result.farms.filter((farm) =>
            farm.status === 'pending_approval' ||
            farm.status === 'pending_quotation' ||
            farm.status === 'pending_acceptance'
          ).length;
          this.districtOptions = [...new Set(this.farms.map((farm) => farm.location?.district?.trim()).filter(Boolean) as string[])];
          this.applyClientFilters();
          this.isLoading = false;
        },
        error: () => {
          this.toastService.error('Unable to load farms. Please try again.');
          this.isLoading = false;
        }
      });
  }

  applyClientFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const status = this.selectedStatus;
    const source = this.selectedSource;
    const district = this.selectedDistrict.trim().toLowerCase();
    const base = [...this.farms];

    this.filteredFarms = base.filter((farm) => {
      const matchesText = !query ||
        farm.name.toLowerCase().includes(query) ||
        (farm.clientName || '').toLowerCase().includes(query) ||
        (farm.location?.district || '').toLowerCase().includes(query) ||
        (farm.clientPhone || '').toLowerCase().includes(query);

      const matchesStatus = !status || farm.status === status;
      const matchesSource = !source || farm.registrationSource === source;
      const matchesLandscaping = !this.showLandscapingOnly || farm.needsLandscapingConsultancy === true;
      const matchesDistrict = !district || (farm.location?.district || '').toLowerCase() === district;

      return matchesText && matchesStatus && matchesSource && matchesLandscaping && matchesDistrict;
    });
  }

  switchTab(tab: 'all' | 'pending' | 'mine'): void {
    if (this.isFarmer) return;
    this.activeTab = tab;
    this.selectedStatus = '';
    this.loadFarms();
  }

  applyFilters(): void {
    this.loadFarms();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedStatus = '';
    this.selectedDistrict = '';
    this.selectedSource = '';
    this.showLandscapingOnly = false;
    this.sortBy = 'updatedAt';
    this.loadFarms();
  }

  openForm(mode: 'create' | 'edit' = 'create', farm: FarmProject | null = null): void {
    if (mode === 'create') {
      this.router.navigate(['/farm-management/new']);
    } else {
      this.formMode = mode;
      this.editingFarm = farm;
      this.showForm = true;
    }
  }

  closeForm(): void {
    if (this.isSubmitting) return;
    this.showForm = false;
    this.formMode = 'create';
    this.editingFarm = null;
  }

  submitFarm(payload: FarmRegistrationPayload): void {
    this.isSubmitting = true;
    const request$ = this.formMode === 'edit' && this.editingFarm?.id
      ? this.farmService.requestFarmEdit(this.editingFarm.id, payload)
      : this.farmService.registerFarm(payload);

    request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const successMessage = this.formMode === 'edit'
            ? 'Project update submitted for approval.'
            : this.isFarmer
              ? "Submitted for approval. You'll be notified once reviewed."
              : 'Farm created.';
          this.toastService.success(successMessage);
          this.showForm = false;
          this.isSubmitting = false;
          this.formMode = 'create';
          this.editingFarm = null;
          this.loadFarms();
        },
        error: (error) => {
          this.toastService.error(error?.error?.message || 'Unable to save farm. Please check the form and try again.');
          this.isSubmitting = false;
        }
      });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending_approval: 'Pending Approval',
      pending_quotation: 'Pending Quotation',
      pending_acceptance: 'Pending Acceptance',
      approved: 'Approved',
      rejected: 'Rejected',
      Running: 'Running',
      Completed: 'Completed',
      Upcoming: 'Upcoming',
      'On Hold': 'On Hold',
      Cancelled: 'Cancelled'
    };
    return labels[status] || status;
  }

  cropNames(farm: FarmProject): string {
    const crops = farm.crops || [];
    if (!crops.length) return 'No crops added';
    return crops.map((crop) => crop.name).filter(Boolean).join(', ');
  }

  isLandscapingProject(farm: FarmProject): boolean {
    return farm.needsLandscapingConsultancy === true;
  }

  landscapingLabel(farm: FarmProject): string {
    return 'Landscaping';
  }

  trackFarm(_: number, farm: FarmProject): string {
    return farm.id || farm._id || farm.name;
  }

  openProject(farm: FarmProject): void {
    this.router.navigate(['/farm-management/project', farm.id || farm._id]);
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
