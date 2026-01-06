import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
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
import { AuthService } from '../../services/auth.service';

type ViewMode = 'grid' | 'list' | 'map';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css'
})
export class ProjectListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();

  // Input properties for customization
  @Input() showToolbar = true;
  @Input() showSummaryStats = true;
  @Input() defaultViewMode: ViewMode = 'grid';
  @Input() initialFilters: ProjectFilters = {};
  @Input() compactMode = false;

  // Output events
  @Output() projectClick = new EventEmitter<Project>();
  @Output() favoriteToggle = new EventEmitter<Project>();

  // View state
  currentView: ViewMode = 'grid';
  showFilterDrawer = false;

  // Data
  allProjects: Project[] = []; // All projects from API
  projects: Project[] = []; // Filtered projects for display
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

  // Category options (Primary taxonomy)
  categoryOptions: Array<{ value: 'FARM' | 'LANDSCAPING' | 'GARDENING'; label: string; icon: string; color: string }> = [
    { value: 'FARM', label: 'Farm', icon: 'fa-tractor', color: '#4CAF50' },
    { value: 'LANDSCAPING', label: 'Landscaping', icon: 'fa-leaf', color: '#8BC34A' },
    { value: 'GARDENING', label: 'Gardening', icon: 'fa-seedling', color: '#66BB6A' }
  ];

  cities = ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'];

  // Selected filters (for UI binding)
  selectedStatuses: string[] = [];

  // Category filters (Primary filters - always visible at top)
  // Simple toggle: click to filter by category, click again to remove
  selectedCategories: string[] = [];

  selectedCity = '';
  budgetMin?: number;
  budgetMax?: number;
  showFavoritesOnly = false;
  showDrafts = false; // Toggle for showing draft projects

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
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.currentView = this.defaultViewMode;
    this.activeFilters = { ...this.initialFilters };
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
          this.allProjects = response.projects;

          // Filter projects based on showDrafts toggle
          this.filterProjectsByDraftStatus();

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

  filterProjectsByDraftStatus(): void {
    if (this.showDrafts) {
      // Show only draft projects
      this.projects = this.allProjects.filter(p => p.isDraft === true);
    } else {
      // Show only non-draft projects
      this.projects = this.allProjects.filter(p => !p.isDraft);
    }
  }

  calculateSummaryStats(): void {
    this.totalBudget = this.projects.reduce((sum, p) => sum + (p.budget || 0), 0);
    this.activeProjects = this.projects.filter(p => p.status === 'Running').length;
    this.completedProjects = this.projects.filter(p => p.status === 'Completed').length;
  }

  updateEmptyState(): void {
    if (this.projects.length === 0) {
      this.showEmptyState = true;
      if (this.showDrafts) {
        this.emptyStateMessage = 'No draft projects found';
      } else if (this.searchQuery) {
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
      // ============================
      // CATEGORY FILTERS (Primary - Applied First)
      // ============================
      categoryInclude: this.selectedCategories.length > 0 ? this.selectedCategories : undefined,

      // Secondary filters
      status: this.selectedStatuses.length > 0 ? this.selectedStatuses : undefined,
      city: this.selectedCity || undefined,
      budgetMin: this.budgetMin,
      budgetMax: this.budgetMax,
      isFavorite: this.showFavoritesOnly ? true : undefined
      // Note: showDrafts is handled client-side, not passed to API
    };

    this.calculateFilterCount();
    this.currentPage = 1;
    this.loadProjects();
    this.showFilterDrawer = false;
  }

  toggleDrafts(): void {
    this.showDrafts = !this.showDrafts;
    // Re-filter the already loaded projects without making new API call
    this.filterProjectsByDraftStatus();
    this.calculateSummaryStats();
    this.updateEmptyState();
  }

  clearFilters(): void {
    this.selectedStatuses = [];
    this.selectedCategories = [];
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
      case 'category':
        if (value) {
          this.selectedCategories = this.selectedCategories.filter(c => c !== value);
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
    // Count category filters
    if (this.activeFilters.categoryInclude?.length) this.filterCount += this.activeFilters.categoryInclude.length;
    // Count other filters
    if (this.activeFilters.status?.length) this.filterCount += this.activeFilters.status.length;
    if (this.activeFilters.city) this.filterCount++;
    if (this.activeFilters.budgetMin !== undefined || this.activeFilters.budgetMax !== undefined) this.filterCount++;
    if (this.activeFilters.isFavorite) this.filterCount++;
  }

  // ========================
  // Category Filter Methods
  // ========================

  toggleCategory(category: string): void {
    const index = this.selectedCategories.indexOf(category);
    if (index > -1) {
      // Remove category (unapply filter)
      this.selectedCategories.splice(index, 1);
    } else {
      // Add category (apply filter)
      this.selectedCategories.push(category);
    }
    // Immediately apply filters
    this.applyFilters();
  }

  isCategorySelected(category: string): boolean {
    return this.selectedCategories.includes(category);
  }

  getCategoryLabel(categoryValue: string): string {
    const category = this.categoryOptions.find(c => c.value === categoryValue);
    return category ? category.label : categoryValue;
  }

  toggleArrayFilter(array: string[], value: string): void {
    const index = array.indexOf(value);
    if (index > -1) {
      array.splice(index, 1);
    } else {
      array.push(value);
    }
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

  viewProject(project: Project): void {
    // Don't navigate to details for draft projects (only via resume button)
    if (project.isDraft) {
      return;
    }
    this.projectClick.emit(project);
    this.router.navigate(['/project-details', project.id]);
  }

  resumeDraft(project: Project, event: Event): void {
    event.stopPropagation();

    // Navigate with project ID as query param so wizard can load full draft data from API
    this.router.navigate(['/projects/new'], {
      queryParams: { projectId: project.id }
    });
  }

  toggleFavorite(project: Project, event: Event): void {
    event.stopPropagation();

    this.dashboardService.toggleFavorite(project.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          project.isFavorite = !project.isFavorite;
          this.favoriteToggle.emit(project);
          this.toastService.success(
            project.isFavorite ? 'Added to favorites' : 'Removed from favorites'
          );
        },
        error: () => {
          this.toastService.error('Failed to update favorite');
        }
      });
  }

  deleteProject(project: Project, event: Event): void {
    event.stopPropagation();

    // Confirm deletion
    const projectType = project.isDraft ? 'draft' : 'project';
    const confirmMessage = `Are you sure you want to permanently delete this ${projectType}: "${project.name}"?\n\nThis action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    // Call the hard delete endpoint (admin only)
    this.dashboardService.hardDeleteProject(project.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.toastService.success(response.message || 'Project deleted successfully');
          // Remove from local array
          this.projects = this.projects.filter(p => p.id !== project.id);
          this.allProjects = this.allProjects.filter(p => p.id !== project.id);
          this.calculateSummaryStats();
          this.updateEmptyState();
        },
        error: (err) => {
          console.error('Error deleting project:', err);
          this.toastService.error(err.error?.error || 'Failed to delete project');
        }
      });
  }

  isAdmin(): boolean {
    const currentUser = this.authService.currentUserValue;
    return currentUser?.role === 'admin';
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

  clearSelection(): void {
    this.selectedProjects.clear();
    this.showBulkActions = false;
  }

  isSelected(projectId: string): boolean {
    return this.selectedProjects.has(projectId);
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
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

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
