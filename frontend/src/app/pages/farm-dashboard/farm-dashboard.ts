import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil, finalize } from 'rxjs';
import { ProjectService } from '../../services/project.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmationModalService } from '../../services/confirmation-modal.service';
import { PermissionService } from '../../services/permission.service';
import { DashboardOverviewComponent } from '../../components/dashboard-overview/dashboard-overview';
import { ProjectListComponent } from '../../components/project-list/project-list';
import { ProjectFiltersComponent } from '../../components/project-filters/project-filters';
import {
  Project, ProjectFilters, ProjectSortOptions, Pagination,
  DashboardStats, ViewMode
} from '../../models/project.model';

@Component({
  selector: 'app-farm-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    DashboardOverviewComponent, ProjectListComponent, ProjectFiltersComponent
  ],
  templateUrl: './farm-dashboard.html',
  styleUrl: './farm-dashboard.css'
})
export class FarmDashboardComponent implements OnInit, OnDestroy {
  // Data
  projects: Project[] = [];
  stats: DashboardStats | null = null;
  pagination: Pagination | null = null;

  // State
  loading = true;
  statsLoading = true;
  currentPage = 1;
  viewMode: ViewMode = 'grid';
  filtersOpen = false;

  // Filters & Sort
  filters: ProjectFilters = {};
  sort: ProjectSortOptions = { sortBy: 'updatedAt', sortOrder: 'desc' };

  private destroy$ = new Subject<void>();

  constructor(
    private projectService: ProjectService,
    private toast: ToastService,
    private confirmationModal: ConfirmationModalService,
    public permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadProjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Data Loading ───

  loadStats(): void {
    this.statsLoading = true;
    this.projectService.getStats()
      .pipe(takeUntil(this.destroy$), finalize(() => this.statsLoading = false))
      .subscribe(stats => {
        this.stats = stats;
      });
  }

  loadProjects(): void {
    this.loading = true;
    this.projectService.getProjects(this.filters, this.sort, this.currentPage)
      .pipe(takeUntil(this.destroy$), finalize(() => this.loading = false))
      .subscribe(result => {
        this.projects = result.projects;
        this.pagination = result.pagination;
      });
  }

  // ─── Events from ProjectList ───

  onSearchChange(searchTerm: string): void {
    this.filters = { ...this.filters, search: searchTerm || undefined };
    this.currentPage = 1;
    this.loadProjects();
  }

  onSortChange(sort: ProjectSortOptions): void {
    this.sort = sort;
    this.currentPage = 1;
    this.loadProjects();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadProjects();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onViewModeChange(mode: ViewMode): void {
    this.viewMode = mode;
  }

  onFavoriteToggle(projectId: string): void {
    this.projectService.toggleFavorite(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          // Update project in local state
          const project = this.projects.find(p => p._id === projectId);
          if (project) {
            if (result.isFavorite) {
              project.isFavorite = ['current-user'];
            } else {
              project.isFavorite = [];
            }
          }
        },
        error: () => this.toast.error('Failed to update favorite')
      });
  }

  // ─── Filters ───

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
  }

  onFiltersChange(filters: ProjectFilters): void {
    this.filters = { ...this.filters, ...filters };
    // Remove undefined/null/empty filters
    Object.keys(this.filters).forEach(key => {
      const val = (this.filters as Record<string, unknown>)[key];
      if (val === undefined || val === null || val === '' ||
          (Array.isArray(val) && val.length === 0)) {
        delete (this.filters as Record<string, unknown>)[key];
      }
    });
    this.currentPage = 1;
    this.loadProjects();
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.filters.categoryInclude?.length) count++;
    if (this.filters.status) count++;
    if (this.filters.city) count++;
    if (this.filters.budgetMin || this.filters.budgetMax) count++;
    if (this.filters.isFavorite) count++;
    return count;
  }

  // ─── Bulk Actions ───

  async onBulkAction(event: { action: string; ids: string[] }): Promise<void> {
    if (event.action === 'delete') {
      const confirmed = await this.confirmationModal.confirm({
        title: 'Delete Projects',
        message: `Are you sure you want to delete ${event.ids.length} project(s)? This action can be undone.`,
        confirmText: 'Delete',
        confirmClass: 'btn-danger'
      });
      if (!confirmed) return;

      this.projectService.bulkDelete(event.ids)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            this.toast.success(`${result.deletedCount} project(s) deleted`);
            this.loadProjects();
            this.loadStats();
          },
          error: () => this.toast.error('Failed to delete projects')
        });
    }

    if (event.action === 'export') {
      this.projectService.exportProjects('xlsx', { projectIds: event.ids.join(',') })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'projects.xlsx';
            a.click();
            URL.revokeObjectURL(url);
            this.toast.success('Export downloaded');
          },
          error: () => this.toast.error('Export failed')
        });
    }
  }
}
