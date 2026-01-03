import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import {
  DashboardService,
  Project,
  ProjectFilters,
  ProjectSortOptions
} from '../../services/dashboard.service';
import { ToastService } from '../../services/toast.service';

type ViewMode = 'grid' | 'list' | 'map';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './projects.html',
  styleUrl: './projects.css',
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();

  // View state
  currentView: ViewMode = 'grid';
  showFilterDrawer = false;

  // Data
  projects: Project[] = [];
  selectedProjects = new Set<string>();

  // Loading states
  isLoading = true;
  isExporting = false;

  // Search
  searchQuery = '';

  // Filters
  activeFilters: ProjectFilters = {};
  filterCount = 0;

  // Available filter options
  statusOptions = ['Upcoming', 'Running', 'Completed', 'On Hold', 'Cancelled'];
  typeOptions = ['farm', 'landscaping'];
  teamMembers = ['Mahir Ratanpara', 'Ravi Patel', 'Priya Shah', 'Amit Kumar'];
  cities = ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'];

  // Selected filters (for UI binding)
  selectedStatuses: string[] = [];
  selectedTypes: string[] = [];
  selectedTeamMembers: string[] = [];
  selectedCity = '';
  budgetMin?: number;
  budgetMax?: number;
  showFavoritesOnly = false;

  // Sorting
  currentSort: ProjectSortOptions = {
    sortBy: 'updatedAt',
    sortOrder: 'desc'
  };
  sortOptions = [
    { label: 'Recently Updated', value: 'updatedAt-desc' },
    { label: 'Recently Created', value: 'createdAt-desc' },
    { label: 'Name (A-Z)', value: 'name-asc' },
    { label: 'Name (Z-A)', value: 'name-desc' },
    { label: 'Budget (High to Low)', value: 'budget-desc' },
    { label: 'Budget (Low to High)', value: 'budget-asc' },
    { label: 'Status', value: 'status-asc' },
    { label: 'Location', value: 'location-asc' },
  ];

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalProjects = 0;
  totalPages = 0;

  // Summary stats
  totalBudget = 0;
  activeProjects = 0;
  completedProjects = 0;

  // Empty states
  showEmptyState = false;
  emptyStateMessage = '';

  // Bulk actions
  showBulkActions = false;
  bulkActionInProgress = false;

  // Status badge colors
  statusColors: { [key: string]: string } = {
    'Upcoming': '#2196F3',
    'Running': '#4CAF50',
    'Completed': '#7B1FA2',
    'On Hold': '#FF9800',
    'Cancelled': '#F44336'
  };

  constructor(
    private dashboardService: DashboardService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.setupSearch();
    this.loadProjects();
    this.loadViewPreference();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========================
  // Data Loading
  // ========================

  setupSearch(): void {
    this.searchSubject$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((query) => {
        this.searchQuery = query;
        this.currentPage = 1;
        this.loadProjects();
      });
  }

  loadProjects(): void {
    this.isLoading = true;

    this.dashboardService
      .getProjectList(
        this.currentPage,
        this.pageSize,
        this.searchQuery,
        this.activeFilters,
        this.currentSort
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.projects = response.projects;
          this.totalProjects = response.total;
          this.totalPages = response.totalPages;
          this.currentPage = response.page;

          this.calculateSummaryStats();
          this.updateEmptyState();
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading projects:', err);
          this.toastService.error('Failed to load projects');
          this.isLoading = false;
        }
      });
  }

  calculateSummaryStats(): void {
    this.totalBudget = this.projects.reduce((sum, p) => sum + p.budget, 0);
    this.activeProjects = this.projects.filter(p => p.status === 'Running').length;
    this.completedProjects = this.projects.filter(p => p.status === 'Completed').length;
  }

  updateEmptyState(): void {
    if (this.projects.length === 0) {
      this.showEmptyState = true;
      if (this.searchQuery) {
        this.emptyStateMessage = `No projects found matching "${this.searchQuery}"`;
      } else if (this.filterCount > 0) {
        this.emptyStateMessage = 'No projects match these filters';
      } else {
        this.emptyStateMessage = 'No projects yet. Create your first project!';
      }
    } else {
      this.showEmptyState = false;
    }
  }

  // ========================
  // Search
  // ========================

  onSearchChange(query: string): void {
    this.searchSubject$.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.onSearchChange('');
  }

  // ========================
  // Filtering
  // ========================

  toggleFilterDrawer(): void {
    this.showFilterDrawer = !this.showFilterDrawer;
  }

  applyFilters(): void {
    this.activeFilters = {
      status: this.selectedStatuses.length > 0 ? this.selectedStatuses : undefined,
      type: this.selectedTypes.length > 0 ? this.selectedTypes : undefined,
      assignedTo: this.selectedTeamMembers.length > 0 ? this.selectedTeamMembers : undefined,
      city: this.selectedCity || undefined,
      budgetMin: this.budgetMin,
      budgetMax: this.budgetMax,
      isFavorite: this.showFavoritesOnly ? true : undefined
    };

    this.calculateFilterCount();
    this.currentPage = 1;
    this.loadProjects();
    this.showFilterDrawer = false;
  }

  clearFilters(): void {
    this.selectedStatuses = [];
    this.selectedTypes = [];
    this.selectedTeamMembers = [];
    this.selectedCity = '';
    this.budgetMin = undefined;
    this.budgetMax = undefined;
    this.showFavoritesOnly = false;
    this.activeFilters = {};
    this.filterCount = 0;
    this.currentPage = 1;
    this.loadProjects();
  }

  clearAllFilters(): void {
    this.clearFilters();
    this.clearSearch();
  }

  removeFilter(filterKey: string, value?: string): void {
    switch (filterKey) {
      case 'status':
        if (value) {
          this.selectedStatuses = this.selectedStatuses.filter(s => s !== value);
        }
        break;
      case 'type':
        if (value) {
          this.selectedTypes = this.selectedTypes.filter(t => t !== value);
        }
        break;
      case 'assignedTo':
        if (value) {
          this.selectedTeamMembers = this.selectedTeamMembers.filter(m => m !== value);
        }
        break;
      case 'city':
        this.selectedCity = '';
        break;
      case 'budget':
        this.budgetMin = undefined;
        this.budgetMax = undefined;
        break;
      case 'favorites':
        this.showFavoritesOnly = false;
        break;
    }
    this.applyFilters();
  }

  calculateFilterCount(): void {
    this.filterCount = 0;
    if (this.activeFilters.status?.length) this.filterCount += this.activeFilters.status.length;
    if (this.activeFilters.type?.length) this.filterCount += this.activeFilters.type.length;
    if (this.activeFilters.assignedTo?.length) this.filterCount += this.activeFilters.assignedTo.length;
    if (this.activeFilters.city) this.filterCount++;
    if (this.activeFilters.budgetMin !== undefined || this.activeFilters.budgetMax !== undefined) this.filterCount++;
    if (this.activeFilters.isFavorite) this.filterCount++;
  }

  toggleArrayFilter(array: string[], value: string): void {
    const index = array.indexOf(value);
    if (index > -1) {
      array.splice(index, 1);
    } else {
      array.push(value);
    }
  }

  // Quick filters
  showMyProjects(): void {
    this.selectedTeamMembers = ['Mahir Ratanpara']; // TODO: Get current user
    this.applyFilters();
  }

  showActiveProjects(): void {
    this.selectedStatuses = ['Running'];
    this.applyFilters();
  }

  showCompletedProjects(): void {
    this.selectedStatuses = ['Completed'];
    this.applyFilters();
  }

  // ========================
  // Sorting
  // ========================

  onSortChange(sortValue: string): void {
    const [sortBy, sortOrder] = sortValue.split('-') as [any, 'asc' | 'desc'];
    this.currentSort = { sortBy, sortOrder };
    this.currentPage = 1;
    this.loadProjects();
  }

  // ========================
  // View Modes
  // ========================

  setView(view: ViewMode): void {
    this.currentView = view;
    this.saveViewPreference();
  }

  loadViewPreference(): void {
    const saved = localStorage.getItem('projectViewMode');
    if (saved && ['grid', 'list', 'map'].includes(saved)) {
      this.currentView = saved as ViewMode;
    }
  }

  saveViewPreference(): void {
    localStorage.setItem('projectViewMode', this.currentView);
  }

  // ========================
  // Project Actions
  // ========================

  viewProject(projectId: string): void {
    this.router.navigate(['/project-details', projectId]);
  }

  toggleFavorite(project: Project, event: Event): void {
    event.stopPropagation();

    this.dashboardService.toggleFavorite(project.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          project.isFavorite = !project.isFavorite;
          this.toastService.success(
            project.isFavorite ? 'Added to favorites' : 'Removed from favorites'
          );
        },
        error: () => {
          this.toastService.error('Failed to update favorite');
        }
      });
  }

  // ========================
  // Selection & Bulk Actions
  // ========================

  toggleSelection(projectId: string, event: Event): void {
    event.stopPropagation();

    if (this.selectedProjects.has(projectId)) {
      this.selectedProjects.delete(projectId);
    } else {
      this.selectedProjects.add(projectId);
    }

    this.showBulkActions = this.selectedProjects.size > 0;
  }

  toggleSelectAll(event: Event): void {
    const checkbox = event.target as HTMLInputElement;

    if (checkbox.checked) {
      this.projects.forEach(p => this.selectedProjects.add(p.id));
    } else {
      this.selectedProjects.clear();
    }

    this.showBulkActions = this.selectedProjects.size > 0;
  }

  isSelected(projectId: string): boolean {
    return this.selectedProjects.has(projectId);
  }

  get allSelected(): boolean {
    return this.projects.length > 0 && this.projects.every(p => this.selectedProjects.has(p.id));
  }

  get someSelected(): boolean {
    return this.selectedProjects.size > 0 && !this.allSelected;
  }

  clearSelection(): void {
    this.selectedProjects.clear();
    this.showBulkActions = false;
  }

  bulkExport(): void {
    this.exportProjects(Array.from(this.selectedProjects));
  }

  bulkArchive(): void {
    if (confirm(`Archive ${this.selectedProjects.size} selected projects?`)) {
      this.bulkActionInProgress = true;

      this.dashboardService.bulkUpdateProjects(
        Array.from(this.selectedProjects),
        { status: 'Cancelled' }
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastService.success(`${result.updated} projects archived`);
          this.clearSelection();
          this.loadProjects();
          this.bulkActionInProgress = false;
        },
        error: () => {
          this.toastService.error('Failed to archive projects');
          this.bulkActionInProgress = false;
        }
      });
    }
  }

  bulkDelete(): void {
    if (confirm(`Delete ${this.selectedProjects.size} selected projects? This cannot be undone.`)) {
      this.bulkActionInProgress = true;

      this.dashboardService.bulkDeleteProjects(Array.from(this.selectedProjects))
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (result) => {
            this.toastService.success(`${result.deleted} projects deleted`);
            this.clearSelection();
            this.loadProjects();
            this.bulkActionInProgress = false;
          },
          error: () => {
            this.toastService.error('Failed to delete projects');
            this.bulkActionInProgress = false;
          }
        });
    }
  }

  // ========================
  // Export
  // ========================

  exportProjects(projectIds?: string[]): void {
    this.isExporting = true;

    this.dashboardService.exportProjects('excel', projectIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `projects_${new Date().toISOString().split('T')[0]}.xlsx`;
          link.click();
          window.URL.revokeObjectURL(url);

          this.toastService.success('Projects exported successfully');
          this.isExporting = false;
        },
        error: () => {
          this.toastService.error('Failed to export projects');
          this.isExporting = false;
        }
      });
  }

  exportAll(): void {
    this.exportProjects();
  }

  // ========================
  // Pagination
  // ========================

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadProjects();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  previousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  get pages(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;

    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  // ========================
  // Utility Methods
  // ========================

  getStatusBadgeColor(status: string): string {
    return this.statusColors[status] || '#999';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatSize(size: number | undefined, unit: string | undefined): string {
    if (!size) return 'N/A';
    return unit === 'acres' ? `${size} acres` : `${size} sq m`;
  }

  getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    const intervals: { [key: string]: number } = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
      }
    }

    return 'Just now';
  }

  refreshProjects(): void {
    this.loadProjects();
  }
}
