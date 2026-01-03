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
  selector: 'app-farm-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './farm-dashboard.html',
  styleUrls: ['./farm-dashboard.css'],
})
export class FarmDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();

  // Math utility for template
  Math = Math;

  // Loading states
  isLoading = true;
  isLoadingMetrics = true;
  isLoadingChart = true;
  isLoadingActivities = true;
  isLoadingProjects = false;
  isExporting = false;

  // Statistics
  totalProjects = 0;
  runningProjects = 0;
  completedThisMonth = 0;
  totalBudget = 0;
  pendingVisits = 0;

  // Project status distribution
  projectStatusData: any[] = [];

  // Recent activities
  recentActivities: any[] = [];

  // Favorite projects
  favoriteProjects: any[] = [];

  // Budget data
  budgetSummary = {
    totalAllocated: 0,
    totalExpenses: 0,
    netProfit: 0,
    utilizationPercentage: 0
  };

  budgetTrendData: any[] = [];

  // Upcoming visits
  upcomingVisits: any[] = [];

  // Search and filters
  searchQuery = '';
  searchResults: any[] = [];
  showSearchResults = false;
  activeFilter = 'all';

  // Empty state
  showEmptyState = false;

  // Chart color scheme
  colorScheme = {
    domain: ['#4CAF50', '#2196F3', '#FFC107', '#FF9800', '#F44336']
  };

  // ========================
  // Project List Management (SHI-37)
  // ========================

  // View state
  currentView: ViewMode = 'grid';
  showFilterDrawer = false;
  showProjectsList = true; // Projects list is the default view (SHI-37)
  showDashboardOverview = false; // Dashboard overview accessible via button

  // Project data
  projects: Project[] = [];
  selectedProjects = new Set<string>();

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
  totalProjectsCount = 0;
  totalPages = 0;

  // Summary stats for projects
  totalProjectsBudget = 0;
  activeProjectsCount = 0;
  completedProjectsCount = 0;

  // Empty states
  showProjectsEmptyState = false;
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
    this.loadViewPreference();
    // Load projects by default (projects list is the main view)
    this.loadProjects();
    // Only load dashboard data when user explicitly requests it
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========================
  // Search Setup (Enhanced for SHI-37)
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
        if (this.showProjectsList) {
          this.currentPage = 1;
          this.loadProjects();
        } else {
          this.onSearchInput();
        }
      });
  }

  loadDashboardData(): void {
    this.isLoading = true;

    // Load all dashboard data
    this.loadMetrics();
    this.loadProjectStatusDistribution();
    this.loadRecentActivities();
    this.loadFavoriteProjects();
    this.loadBudgetSummary();
    this.loadUpcomingVisits();

    // Simulate loading completion
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  loadMetrics(): void {
    this.isLoadingMetrics = true;

    this.dashboardService.getDashboardMetrics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          this.totalProjects = metrics.totalProjects;
          this.runningProjects = metrics.runningProjects;
          this.completedThisMonth = metrics.completedThisMonth;
          this.totalBudget = metrics.totalBudget;
          this.pendingVisits = metrics.pendingVisits;
          this.isLoadingMetrics = false;

          // Check for empty state
          if (this.totalProjects === 0) {
            this.showEmptyState = true;
            this.isLoading = false;
          }
        },
        error: (error) => {
          console.error('Error loading metrics:', error);
          this.toastService.error('Failed to load dashboard metrics');
          this.isLoadingMetrics = false;
        }
      });
  }

  loadProjectStatusDistribution(): void {
    this.isLoadingChart = true;

    this.dashboardService.getProjectStatusDistribution()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.projectStatusData = data;
          this.isLoadingChart = false;
        },
        error: (error) => {
          console.error('Error loading project status:', error);
          this.isLoadingChart = false;
        }
      });
  }

  loadRecentActivities(): void {
    this.isLoadingActivities = true;

    this.dashboardService.getRecentActivities(10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (activities) => {
          this.recentActivities = activities;
          this.isLoadingActivities = false;
        },
        error: (error) => {
          console.error('Error loading activities:', error);
          this.isLoadingActivities = false;
        }
      });
  }

  loadFavoriteProjects(): void {
    this.dashboardService.getFavoriteProjects()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (projects) => {
          this.favoriteProjects = projects.slice(0, 4);
        },
        error: (error) => {
          console.error('Error loading favorite projects:', error);
        }
      });
  }

  loadBudgetSummary(): void {
    this.dashboardService.getBudgetSummary()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summary) => {
          this.budgetSummary = summary;
        },
        error: (error) => {
          console.error('Error loading budget summary:', error);
        }
      });

    this.dashboardService.getBudgetTrend(6)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trend) => {
          this.budgetTrendData = trend;
        },
        error: (error) => {
          console.error('Error loading budget trend:', error);
        }
      });
  }

  loadUpcomingVisits(): void {
    this.dashboardService.getUpcomingVisits(5)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (visits) => {
          this.upcomingVisits = visits;
        },
        error: (error) => {
          console.error('Error loading upcoming visits:', error);
        }
      });
  }

  // Card click handlers
  onMetricCardClick(metric: string): void {
    // Navigate back to projects list view with appropriate filters
    this.hideDashboard();
    this.clearFilters();

    switch (metric) {
      case 'running':
        this.selectedStatuses = ['Running'];
        this.applyFilters();
        break;
      case 'completed':
        this.selectedStatuses = ['Completed'];
        this.applyFilters();
        break;
      case 'all':
      case 'budget':
      case 'visits':
      default:
        this.loadProjects();
        break;
    }
  }

  // Chart interactions
  onChartSelect(event: any): void {
    console.log('Chart selection:', event);
    // Filter projects by selected status
  }

  // Search functionality (deprecated - now using direct search in projects list)
  onSearchInput(): void {
    // This method is now deprecated - search is handled directly in the projects list
    // via the setupSearch() debounced observable
    if (this.searchQuery.trim().length < 2) {
      this.showSearchResults = false;
      return;
    }

    // For backwards compatibility with dashboard overview search
    this.dashboardService.searchProjects(this.searchQuery)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.searchResults = results;
          this.showSearchResults = true;
        },
        error: (error) => {
          console.error('Search error:', error);
        }
      });
  }

  onSearchResultClick(result: any): void {
    // Navigate to project details
    console.log('Navigate to project:', result);
    this.showSearchResults = false;
    this.searchQuery = '';
  }

  // Filter handlers (Enhanced for SHI-37)
  setFilter(filter: string): void {
    // If we're in projects list view, toggle the filter
    if (this.showProjectsList) {
      // Handle 'all' filter - always clear everything
      if (filter === 'all') {
        this.activeFilter = 'all';
        this.clearFilters();
        return;
      }

      // If clicking the same filter, toggle it off (remove the specific filter)
      if (this.activeFilter === filter) {
        this.activeFilter = '';

        // Remove the specific filter
        switch (filter) {
          case 'farm':
            this.selectedTypes = [];
            break;
          case 'landscaping':
            this.selectedTypes = [];
            break;
          case 'my':
            this.selectedTeamMembers = [];
            break;
        }

        this.applyFilters();
        return;
      }

      // Apply new filter
      this.activeFilter = filter;

      switch (filter) {
        case 'farm':
          this.selectedTypes = ['farm'];
          this.selectedTeamMembers = []; // Clear other quick filters
          this.applyFilters();
          break;
        case 'landscaping':
          this.selectedTypes = ['landscaping'];
          this.selectedTeamMembers = []; // Clear other quick filters
          this.applyFilters();
          break;
        case 'my':
          this.selectedTeamMembers = ['Mahir Ratanpara']; // TODO: Get current user
          this.selectedTypes = []; // Clear other quick filters
          this.applyFilters();
          break;
      }
    } else {
      // For dashboard overview, just set the active filter
      this.activeFilter = filter;
    }
  }

  // Project actions
  toggleFavorite(projectId: string): void {
    this.dashboardService.toggleFavorite(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadFavoriteProjects();
          this.toastService.success('Favorite updated');
        },
        error: (error) => {
          console.error('Error toggling favorite:', error);
          this.toastService.error('Failed to update favorite');
        }
      });
  }

  // Navigation
  createNewProject(): void {
    // Navigate to project creation
    console.log('Create new project');
  }

  viewAllProjects(): void {
    // Projects list is already the default view, just ensure we're showing it
    this.hideDashboard();
  }

  viewProjectDetails(projectId: string): void {
    // Navigate to project details
    console.log('View project:', projectId);
  }

  viewAllActivities(): void {
    // Navigate to activity log
    console.log('View all activities');
  }

  viewFinancialDashboard(): void {
    // Navigate to financial dashboard
    console.log('View financial dashboard');
  }

  recordVisit(visitId: string): void {
    // Navigate to visit recording
    console.log('Record visit:', visitId);
  }

  // Utility methods
  getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(date).toLocaleDateString();
  }

  getVisitUrgencyClass(date: Date): string {
    const now = new Date();
    const visitDate = new Date(date);
    const diffDays = Math.floor((visitDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'urgent-today';
    if (diffDays === 1) return 'urgent-tomorrow';
    return 'upcoming';
  }

  getBudgetStatusClass(): string {
    const { netProfit } = this.budgetSummary;
    if (netProfit > 0) return 'profit';
    if (netProfit < 0) return 'loss';
    return 'breakeven';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  }

  refreshDashboard(): void {
    if (this.showProjectsList) {
      this.loadProjects();
      this.toastService.info('Projects refreshed');
    } else if (this.showDashboardOverview) {
      this.loadDashboardData();
      this.toastService.info('Dashboard refreshed');
    }
  }

  // ========================
  // Project List Management (SHI-37)
  // ========================

  toggleProjectsView(): void {
    this.showProjectsList = !this.showProjectsList;
    this.showDashboardOverview = !this.showDashboardOverview;

    if (this.showProjectsList) {
      this.loadProjects();
    } else if (this.showDashboardOverview) {
      this.loadDashboardData();
    }
  }

  showDashboard(): void {
    this.showProjectsList = false;
    this.showDashboardOverview = true;
    this.loadDashboardData();
  }

  hideDashboard(): void {
    this.showDashboardOverview = false;
    this.showProjectsList = true;
  }

  loadProjects(): void {
    this.isLoadingProjects = true;

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
          this.totalProjectsCount = response.total;
          this.totalPages = response.totalPages;
          this.currentPage = response.page;

          this.calculateProjectSummaryStats();
          this.updateProjectsEmptyState();
          this.isLoadingProjects = false;
        },
        error: (err) => {
          console.error('Error loading projects:', err);
          this.toastService.error('Failed to load projects');
          this.isLoadingProjects = false;
        }
      });
  }

  calculateProjectSummaryStats(): void {
    this.totalProjectsBudget = this.projects.reduce((sum, p) => sum + p.budget, 0);
    this.activeProjectsCount = this.projects.filter(p => p.status === 'Running').length;
    this.completedProjectsCount = this.projects.filter(p => p.status === 'Completed').length;
  }

  updateProjectsEmptyState(): void {
    if (this.projects.length === 0) {
      this.showProjectsEmptyState = true;
      if (this.searchQuery) {
        this.emptyStateMessage = `No projects found matching "${this.searchQuery}"`;
      } else if (this.filterCount > 0) {
        this.emptyStateMessage = 'No projects match these filters';
      } else {
        this.emptyStateMessage = 'No projects yet. Create your first project!';
      }
    } else {
      this.showProjectsEmptyState = false;
    }
  }

  // ========================
  // Search (Enhanced)
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

  // Quick filters (Enhanced)
  showMyProjects(): void {
    this.showProjectsList = true;
    this.selectedTeamMembers = ['Mahir Ratanpara']; // TODO: Get current user
    this.applyFilters();
  }

  showActiveProjects(): void {
    this.showProjectsList = true;
    this.selectedStatuses = ['Running'];
    this.applyFilters();
  }

  showCompletedProjects(): void {
    this.showProjectsList = true;
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

  toggleProjectFavorite(project: Project, event: Event): void {
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
  // Utility Methods (Enhanced)
  // ========================

  getStatusBadgeColor(status: string): string {
    return this.statusColors[status] || '#999';
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
