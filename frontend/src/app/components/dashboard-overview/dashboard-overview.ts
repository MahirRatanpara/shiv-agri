import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardService, Project } from '../../services/dashboard.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-overview.html',
  styleUrl: './dashboard-overview.css'
})
export class DashboardOverviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @Output() metricClick = new EventEmitter<string>();
  @Output() chartSelect = new EventEmitter<any>();

  // Loading states
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
  favoriteProjects: Project[] = [];

  // Budget summary
  budgetSummary = {
    totalAllocated: 0,
    totalExpenses: 0,
    netProfit: 0,
    utilizationPercentage: 0
  };

  // Budget trend
  budgetTrend: any[] = [];

  // Upcoming visits
  upcomingVisits: any[] = [];

  constructor(
    private dashboardService: DashboardService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboardData(): void {
    this.loadMetrics();
    this.loadProjectStatusDistribution();
    this.loadRecentActivities();
    this.loadFavoriteProjects();
    this.loadBudgetSummary();
    this.loadBudgetTrend();
    this.loadUpcomingVisits();
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
        },
        error: () => {
          this.toastService.error('Failed to load metrics');
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
        error: () => {
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
        error: () => {
          this.isLoadingActivities = false;
        }
      });
  }

  loadFavoriteProjects(): void {
    this.dashboardService.getFavoriteProjects()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (projects) => {
          this.favoriteProjects = projects;
        },
        error: () => {}
      });
  }

  loadBudgetSummary(): void {
    this.dashboardService.getBudgetSummary()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summary) => {
          this.budgetSummary = summary;
        },
        error: () => {}
      });
  }

  loadBudgetTrend(): void {
    this.dashboardService.getBudgetTrend(6)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trend) => {
          this.budgetTrend = trend;
        },
        error: () => {}
      });
  }

  loadUpcomingVisits(): void {
    this.dashboardService.getUpcomingVisits(5)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (visits) => {
          this.upcomingVisits = visits;
        },
        error: () => {}
      });
  }

  onMetricCardClick(metric: string): void {
    this.metricClick.emit(metric);
  }

  onChartSelect(item: any): void {
    this.chartSelect.emit(item);
  }

  viewProjectDetails(projectId: string): void {
    this.router.navigate(['/project-details', projectId]);
  }

  recordVisit(projectId: string): void {
    // TODO: Implement visit recording
    this.toastService.info('Visit recording feature coming soon');
  }

  viewAllActivities(): void {
    this.router.navigate(['/activities']);
  }

  viewFinancialDashboard(): void {
    this.router.navigate(['/financial-dashboard']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  getBudgetStatusClass(): string {
    if (this.budgetSummary.utilizationPercentage >= 90) return 'danger';
    if (this.budgetSummary.utilizationPercentage >= 75) return 'warning';
    return 'success';
  }

  getRelativeTime(date: Date): string {
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

  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      created: 'fa-plus-circle',
      visit: 'fa-clipboard-check',
      expense: 'fa-receipt',
      payment: 'fa-money-bill-wave',
      document: 'fa-file-upload'
    };
    return icons[type] || 'fa-circle';
  }
}
