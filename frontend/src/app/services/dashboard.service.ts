import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../environments/environment';

// Interfaces
export interface DashboardMetrics {
  totalProjects: number;
  runningProjects: number;
  completedThisMonth: number;
  totalBudget: number;
  pendingVisits: number;
}

export interface ProjectStatusData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface Activity {
  id: string;
  userName: string;
  action: string;
  projectName: string;
  projectId: string;
  timestamp: Date;
  icon: string;
  type: 'created' | 'visit' | 'expense' | 'payment' | 'document';
}

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  status: 'Upcoming' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled';
  type: 'farm' | 'landscaping';
  budget: number;
  expenses: number;
  assignedTo: string;
  updatedAt: Date;
  isFavorite: boolean;
}

export interface BudgetSummary {
  totalAllocated: number;
  totalExpenses: number;
  netProfit: number;
  utilizationPercentage: number;
}

export interface BudgetTrend {
  month: string;
  allocated: number;
  expenses: number;
  profit: number;
}

export interface Visit {
  id: string;
  projectId: string;
  projectName: string;
  date: Date;
  type: string;
  assignedTo: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly API_URL = `${environment.apiUrl}/dashboard`;

  // In-memory cache for quick access
  private metricsCache$ = new BehaviorSubject<DashboardMetrics | null>(null);
  private projectsCache$ = new BehaviorSubject<Project[]>([]);

  constructor(private http: HttpClient) {}

  /**
   * Get dashboard metrics (key statistics)
   */
  getDashboardMetrics(): Observable<DashboardMetrics> {
    return this.http.get<DashboardMetrics>(`${this.API_URL}/metrics`).pipe(
      map((metrics) => {
        this.metricsCache$.next(metrics);
        return metrics;
      }),
      catchError(() => {
        // Return mock data for development
        return of(this.getMockMetrics());
      })
    );
  }

  /**
   * Get project status distribution for chart
   */
  getProjectStatusDistribution(): Observable<ProjectStatusData[]> {
    return this.http
      .get<ProjectStatusData[]>(`${this.API_URL}/project-status-distribution`)
      .pipe(
        catchError(() => {
          // Return mock data for development
          return of(this.getMockProjectStatusData());
        })
      );
  }

  /**
   * Get recent activities
   */
  getRecentActivities(limit: number = 10): Observable<Activity[]> {
    const params = new HttpParams().set('limit', limit.toString());

    return this.http.get<Activity[]>(`${this.API_URL}/activities`, { params }).pipe(
      map((activities) =>
        activities.map((activity) => ({
          ...activity,
          timestamp: new Date(activity.timestamp),
        }))
      ),
      catchError(() => {
        // Return mock data for development
        return of(this.getMockActivities(limit));
      })
    );
  }

  /**
   * Get favorite projects
   */
  getFavoriteProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(`${this.API_URL}/favorite-projects`).pipe(
      map((projects) =>
        projects.map((project) => ({
          ...project,
          updatedAt: new Date(project.updatedAt),
        }))
      ),
      catchError(() => {
        // Return mock data for development
        return of(this.getMockFavoriteProjects());
      })
    );
  }

  /**
   * Get budget summary
   */
  getBudgetSummary(): Observable<BudgetSummary> {
    return this.http.get<BudgetSummary>(`${this.API_URL}/budget-summary`).pipe(
      catchError(() => {
        // Return mock data for development
        return of(this.getMockBudgetSummary());
      })
    );
  }

  /**
   * Get budget trend data for chart
   */
  getBudgetTrend(months: number = 6): Observable<BudgetTrend[]> {
    const params = new HttpParams().set('months', months.toString());

    return this.http.get<BudgetTrend[]>(`${this.API_URL}/budget-trend`, { params }).pipe(
      catchError(() => {
        // Return mock data for development
        return of(this.getMockBudgetTrend(months));
      })
    );
  }

  /**
   * Get upcoming visits
   */
  getUpcomingVisits(limit: number = 5): Observable<Visit[]> {
    const params = new HttpParams().set('limit', limit.toString());

    return this.http.get<Visit[]>(`${this.API_URL}/upcoming-visits`, { params }).pipe(
      map((visits) =>
        visits.map((visit) => ({
          ...visit,
          date: new Date(visit.date),
        }))
      ),
      catchError(() => {
        // Return mock data for development
        return of(this.getMockUpcomingVisits(limit));
      })
    );
  }

  /**
   * Search projects by query
   */
  searchProjects(query: string): Observable<Project[]> {
    const params = new HttpParams().set('q', query);

    return this.http.get<Project[]>(`${this.API_URL}/search`, { params }).pipe(
      map((projects) =>
        projects.map((project) => ({
          ...project,
          updatedAt: new Date(project.updatedAt),
        }))
      ),
      catchError(() => {
        // Return mock search results for development
        return of(this.getMockSearchResults(query));
      })
    );
  }

  /**
   * Toggle favorite status for a project
   */
  toggleFavorite(projectId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.API_URL}/toggle-favorite/${projectId}`, {}).pipe(
      catchError(() => {
        // Return success for development
        return of({ success: true });
      })
    );
  }

  /**
   * Get all projects with optional filters
   */
  getProjects(filters?: {
    status?: string;
    type?: string;
    assignedTo?: string;
  }): Observable<Project[]> {
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.type) params = params.set('type', filters.type);
    if (filters?.assignedTo) params = params.set('assignedTo', filters.assignedTo);

    return this.http.get<Project[]>(`${this.API_URL}/projects`, { params }).pipe(
      map((projects) => {
        this.projectsCache$.next(projects);
        return projects.map((project) => ({
          ...project,
          updatedAt: new Date(project.updatedAt),
        }));
      }),
      catchError(() => {
        // Return mock data for development
        return of(this.getMockProjects());
      })
    );
  }

  // ========================
  // Mock Data for Development
  // ========================

  private getMockMetrics(): DashboardMetrics {
    return {
      totalProjects: 24,
      runningProjects: 8,
      completedThisMonth: 5,
      totalBudget: 3500000,
      pendingVisits: 12,
    };
  }

  private getMockProjectStatusData(): ProjectStatusData[] {
    return [
      { name: 'Upcoming', value: 5, percentage: 21, color: '#2196F3' },
      { name: 'Running', value: 8, percentage: 33, color: '#4CAF50' },
      { name: 'Completed', value: 9, percentage: 38, color: '#7B1FA2' },
      { name: 'On Hold', value: 1, percentage: 4, color: '#FF9800' },
      { name: 'Cancelled', value: 1, percentage: 4, color: '#F44336' },
    ];
  }

  private getMockActivities(limit: number): Activity[] {
    const activities: Activity[] = [
      {
        id: '1',
        userName: 'Mahir Ratanpara',
        action: 'created a new project',
        projectName: 'Organic Farm Project',
        projectId: 'proj-1',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        icon: 'project-diagram',
        type: 'created',
      },
      {
        id: '2',
        userName: 'Ravi Patel',
        action: 'recorded a visit on',
        projectName: 'Landscaping - Villa Project',
        projectId: 'proj-2',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        icon: 'clipboard-check',
        type: 'visit',
      },
      {
        id: '3',
        userName: 'Priya Shah',
        action: 'added an expense to',
        projectName: 'Farm Irrigation Setup',
        projectId: 'proj-3',
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
        icon: 'receipt',
        type: 'expense',
      },
      {
        id: '4',
        userName: 'Amit Kumar',
        action: 'received payment for',
        projectName: 'Organic Farm Project',
        projectId: 'proj-1',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        icon: 'money-bill-wave',
        type: 'payment',
      },
      {
        id: '5',
        userName: 'Mahir Ratanpara',
        action: 'uploaded documents to',
        projectName: 'Commercial Farming Project',
        projectId: 'proj-4',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        icon: 'file-upload',
        type: 'document',
      },
    ];

    return activities.slice(0, limit);
  }

  private getMockFavoriteProjects(): Project[] {
    return [
      {
        id: 'proj-1',
        name: 'Organic Farm Project',
        client: 'Green Valley Farms',
        location: 'Ahmedabad, Gujarat',
        status: 'Running',
        type: 'farm',
        budget: 500000,
        expenses: 320000,
        assignedTo: 'Mahir Ratanpara',
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isFavorite: true,
      },
      {
        id: 'proj-2',
        name: 'Villa Landscaping',
        client: 'Rajesh Mehta',
        location: 'Surat, Gujarat',
        status: 'Running',
        type: 'landscaping',
        budget: 250000,
        expenses: 180000,
        assignedTo: 'Ravi Patel',
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        isFavorite: true,
      },
      {
        id: 'proj-3',
        name: 'Farm Irrigation Setup',
        client: 'Patel Agro Industries',
        location: 'Vadodara, Gujarat',
        status: 'Completed',
        type: 'farm',
        budget: 800000,
        expenses: 750000,
        assignedTo: 'Priya Shah',
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        isFavorite: true,
      },
    ];
  }

  private getMockBudgetSummary(): BudgetSummary {
    const totalAllocated = 3500000;
    const totalExpenses = 2850000;
    const netProfit = totalAllocated - totalExpenses;
    const utilizationPercentage = Math.round((totalExpenses / totalAllocated) * 100);

    return {
      totalAllocated,
      totalExpenses,
      netProfit,
      utilizationPercentage,
    };
  }

  private getMockBudgetTrend(months: number): BudgetTrend[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const trend: BudgetTrend[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      const allocated = 500000 + Math.random() * 200000;
      const expenses = allocated * (0.7 + Math.random() * 0.2);
      trend.push({
        month: monthNames[monthIndex],
        allocated: Math.round(allocated),
        expenses: Math.round(expenses),
        profit: Math.round(allocated - expenses),
      });
    }

    return trend;
  }

  private getMockUpcomingVisits(limit: number): Visit[] {
    const visits: Visit[] = [
      {
        id: 'visit-1',
        projectId: 'proj-1',
        projectName: 'Organic Farm Project',
        date: new Date(Date.now() + 3 * 60 * 60 * 1000), // Today
        type: 'Inspection',
        assignedTo: 'Mahir Ratanpara',
        status: 'scheduled',
      },
      {
        id: 'visit-2',
        projectId: 'proj-2',
        projectName: 'Villa Landscaping',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        type: 'Progress Review',
        assignedTo: 'Ravi Patel',
        status: 'scheduled',
      },
      {
        id: 'visit-3',
        projectId: 'proj-3',
        projectName: 'Farm Irrigation Setup',
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // In 3 days
        type: 'Maintenance',
        assignedTo: 'Priya Shah',
        status: 'scheduled',
      },
      {
        id: 'visit-4',
        projectId: 'proj-4',
        projectName: 'Commercial Farming',
        date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // In 5 days
        type: 'Initial Assessment',
        assignedTo: 'Amit Kumar',
        status: 'scheduled',
      },
      {
        id: 'visit-5',
        projectId: 'proj-5',
        projectName: 'Garden Redesign',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // In 7 days
        type: 'Client Meeting',
        assignedTo: 'Mahir Ratanpara',
        status: 'scheduled',
      },
    ];

    return visits.slice(0, limit);
  }

  private getMockProjects(): Project[] {
    return [
      {
        id: 'proj-1',
        name: 'Organic Farm Project',
        client: 'Green Valley Farms',
        location: 'Ahmedabad, Gujarat',
        status: 'Running',
        type: 'farm',
        budget: 500000,
        expenses: 320000,
        assignedTo: 'Mahir Ratanpara',
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isFavorite: true,
      },
      {
        id: 'proj-2',
        name: 'Villa Landscaping',
        client: 'Rajesh Mehta',
        location: 'Surat, Gujarat',
        status: 'Running',
        type: 'landscaping',
        budget: 250000,
        expenses: 180000,
        assignedTo: 'Ravi Patel',
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        isFavorite: true,
      },
      // Add more mock projects as needed
    ];
  }

  private getMockSearchResults(query: string): Project[] {
    const allProjects = this.getMockProjects();
    const lowerQuery = query.toLowerCase();

    return allProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(lowerQuery) ||
        project.client.toLowerCase().includes(lowerQuery) ||
        project.location.toLowerCase().includes(lowerQuery)
    );
  }
}
