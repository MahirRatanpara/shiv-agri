import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardService } from '../../services/dashboard.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-farm-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './farm-dashboard.html',
  styleUrls: ['./farm-dashboard.css'],
})
export class FarmDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Loading states
  isLoading = true;
  isLoadingMetrics = true;
  isLoadingChart = true;
  isLoadingActivities = true;

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

  constructor(
    private dashboardService: DashboardService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    // Navigate to filtered view
    console.log('Navigate to:', metric);
    // TODO: Implement navigation with filters
  }

  // Chart interactions
  onChartSelect(event: any): void {
    console.log('Chart selection:', event);
    // Filter projects by selected status
  }

  // Search functionality
  onSearchInput(): void {
    if (this.searchQuery.trim().length < 2) {
      this.showSearchResults = false;
      return;
    }

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

  // Filter handlers
  setFilter(filter: string): void {
    this.activeFilter = filter;
    // TODO: Apply filter to project list
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
    // Navigate to projects list
    console.log('View all projects');
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
    this.loadDashboardData();
    this.toastService.info('Dashboard refreshed');
  }
}
