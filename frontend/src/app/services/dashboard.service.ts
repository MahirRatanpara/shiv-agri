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
  clientAvatar?: string;
  clientPhone?: string;
  clientEmail?: string;
  location: Location;
  city?: string;
  district?: string;
  status: 'Upcoming' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled';
  // Category - First-class taxonomy
  category: 'FARM' | 'LANDSCAPING' | 'GARDENING';
  // Legacy type field (for backward compatibility)
  type?: 'farm' | 'landscaping' | 'gardening';
  budget: number;
  expenses: number;
  size?: number; // in acres or sq meters
  sizeUnit?: 'acres' | 'sqm';
  assignedTo: string;
  assignedTeam?: string[];
  coverImage?: string;
  visitCompletionPercent?: number;
  budgetUtilizationPercent?: number;
  createdAt?: Date;
  startDate?: Date;
  completionDate?: Date;
  updatedAt: Date;
  isFavorite: boolean;
  isDraft?: boolean; // Draft status
  crops?: string[];
}

export interface Location {
  address?: string,
  city?: string,
  state?: string,
  postalCode?: string,
  mapUrl?: string

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

export interface ProjectFilters {
  // ============================
  // CATEGORY FILTERS (Primary, Top-level)
  // ============================
  categoryInclude?: string[]; // Categories to include (IN)
  categoryExclude?: string[]; // Categories to exclude (OUT)

  // Basic filters
  status?: string[];
  type?: string[]; // Legacy - for backward compatibility
  assignedTo?: string[];
  client?: string;

  // Location filters
  city?: string;
  district?: string;

  // Date filters
  createdAfter?: Date;
  createdBefore?: Date;
  startDateAfter?: Date;
  startDateBefore?: Date;
  completionDateAfter?: Date;
  completionDateBefore?: Date;

  // Budget filters
  budgetMin?: number;
  budgetMax?: number;

  // Other filters
  isFavorite?: boolean;
  crops?: string[];
  showDrafts?: boolean | 'all'; // false (default): hide drafts, true: show only drafts, 'all': show all
}

export interface ProjectSortOptions {
  sortBy: 'updatedAt' | 'createdAt' | 'name' | 'budget' | 'status' | 'location' | 'client';
  sortOrder: 'asc' | 'desc';
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly API_URL = `${environment.apiUrl}`;

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
   * Get all projects with optional filters (basic - for backward compatibility)
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

  /**
   * Get project list with advanced filtering, searching, sorting, and pagination
   */
  getProjectList(
    page: number = 1,
    limit: number = 50,
    searchQuery?: string,
    filters?: ProjectFilters,
    sort?: ProjectSortOptions
  ): Observable<ProjectListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    // Add search query
    if (searchQuery) {
      params = params.set('search', searchQuery);
    }

    // Add filters
    if (filters) {
      // ============================
      // CATEGORY FILTERS (Applied First - Primary Constraint)
      // ============================
      if (filters.categoryInclude?.length) {
        params = params.set('categoryInclude', filters.categoryInclude.join(','));
      }
      if (filters.categoryExclude?.length) {
        params = params.set('categoryExclude', filters.categoryExclude.join(','));
      }

      // Other filters
      if (filters.status?.length) params = params.set('status', filters.status.join(','));
      if (filters.type?.length) params = params.set('projectType', filters.type.join(',')); // Legacy support
      if (filters.assignedTo?.length) params = params.set('assignedTo', filters.assignedTo.join(','));
      if (filters.client) params = params.set('client', filters.client);
      if (filters.city) params = params.set('city', filters.city);
      if (filters.district) params = params.set('district', filters.district);
      if (filters.budgetMin !== undefined) params = params.set('budgetMin', filters.budgetMin.toString());
      if (filters.budgetMax !== undefined) params = params.set('budgetMax', filters.budgetMax.toString());
      if (filters.isFavorite !== undefined) params = params.set('isFavorite', filters.isFavorite.toString());
      if (filters.createdAfter) params = params.set('createdAfter', filters.createdAfter.toISOString());
      if (filters.createdBefore) params = params.set('createdBefore', filters.createdBefore.toISOString());
    }

    // Add sorting
    if (sort) {
      params = params.set('sortBy', sort.sortBy).set('sortOrder', sort.sortOrder);
    }

    return this.http.get<any>(`${this.API_URL}/projects`, { params }).pipe(
      map((response) => ({
        projects: response.projects.map((project: any) => ({
          ...project,
          id: project.id || project._id, // Map MongoDB _id to id
          updatedAt: new Date(project.updatedAt),
          createdAt: project.createdAt ? new Date(project.createdAt) : undefined,
          startDate: project.startDate ? new Date(project.startDate) : undefined,
          completionDate: project.completionDate ? new Date(project.completionDate) : undefined,
        })),
        // Extract pagination fields from nested pagination object
        total: response.pagination?.total || 0,
        page: response.pagination?.page || 1,
        limit: response.pagination?.limit || 50,
        totalPages: response.pagination?.totalPages || 0
      })),
      catchError((err, caught) => {
        console.error('Error loading projects:', err);
        return of({
          projects: [],
          total: 0,
          page: 0,
          limit: 0,
          totalPages: 0
        });
      })
    );
  }

  /**
   * Bulk update projects (for bulk actions)
   */
  bulkUpdateProjects(
    projectIds: string[],
    updates: Partial<Project>
  ): Observable<{ success: boolean; updated: number }> {
    return this.http.post<{ success: boolean; updated: number }>(
      `${this.API_URL}/projects/bulk-update`,
      { projectIds, updates }
    ).pipe(
      catchError(() => {
        return of({ success: true, updated: projectIds.length });
      })
    );
  }

  /**
   * Bulk delete projects
   */
  bulkDeleteProjects(projectIds: string[]): Observable<{ success: boolean; deleted: number }> {
    return this.http.post<{ success: boolean; deleted: number }>(
      `${this.API_URL}/projects/bulk-delete`,
      { projectIds }
    ).pipe(
      catchError(() => {
        return of({ success: true, deleted: projectIds.length });
      })
    );
  }

  /**
   * Export projects to Excel/CSV
   */
  exportProjects(
    format: 'excel' | 'csv',
    projectIds?: string[]
  ): Observable<Blob> {
    let params = new HttpParams().set('format', format);
    if (projectIds?.length) {
      params = params.set('projectIds', projectIds.join(','));
    }

    return this.http.get(`${this.API_URL}/projects/export`, {
      params,
      responseType: 'blob'
    }).pipe(
      catchError(() => {
        // Return empty blob for development
        return of(new Blob());
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
        location: {city:'Ahmedabad, Gujarat'},
        category: 'FARM',
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
        location: {city:'Ahmedabad, Gujarat'},
        category: 'LANDSCAPING',
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
        location: {city:'Ahmedabad, Gujarat'},
        category: 'FARM',
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
        clientAvatar: 'https://ui-avatars.com/api/?name=Green+Valley',
        location: {city:'Ahmedabad, Gujarat'},
        category: 'FARM',
        city: 'Ahmedabad',
        district: 'Ahmedabad',
        status: 'Running',
        type: 'farm',
        budget: 500000,
        expenses: 320000,
        size: 5,
        sizeUnit: 'acres',
        assignedTo: 'Mahir Ratanpara',
        assignedTeam: ['Mahir Ratanpara', 'Ravi Patel'],
        visitCompletionPercent: 65,
        budgetUtilizationPercent: 64,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        startDate: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        isFavorite: true,
        crops: ['Wheat', 'Cotton'],
      },
      {
        id: 'proj-2',
        name: 'Villa Landscaping',
        client: 'Rajesh Mehta',
        clientAvatar: 'https://ui-avatars.com/api/?name=Rajesh+Mehta',
        location: {city:'Ahmedabad, Gujarat'},
        category: 'LANDSCAPING',
        city: 'Surat',
        district: 'Surat',
        status: 'Running',
        type: 'landscaping',
        budget: 250000,
        expenses: 180000,
        size: 2000,
        sizeUnit: 'sqm',
        assignedTo: 'Ravi Patel',
        assignedTeam: ['Ravi Patel'],
        visitCompletionPercent: 72,
        budgetUtilizationPercent: 72,
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        isFavorite: true,
      },
      {
        id: 'proj-3',
        name: 'Farm Irrigation Setup',
        client: 'Patel Agro Industries',
        clientAvatar: 'https://ui-avatars.com/api/?name=Patel+Agro',
        location: {city:'Ahmedabad, Gujarat'},
        category: 'GARDENING',
        city: 'Vadodara',
        district: 'Vadodara',
        status: 'Completed',
        type: 'farm',
        budget: 800000,
        expenses: 750000,
        size: 10,
        sizeUnit: 'acres',
        assignedTo: 'Priya Shah',
        assignedTeam: ['Priya Shah', 'Amit Kumar'],
        visitCompletionPercent: 100,
        budgetUtilizationPercent: 94,
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        startDate: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000),
        completionDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        isFavorite: true,
        crops: ['Rice', 'Sugarcane'],
      },
      {
        id: 'proj-4',
        name: 'Commercial Farming Project',
        client: 'Shah Enterprises',
        clientAvatar: 'https://ui-avatars.com/api/?name=Shah+Enterprises',
        location: {city:'Ahmedabad, Gujarat'},
        city: 'Rajkot',
        category: 'FARM',
        district: 'Rajkot',
        status: 'Upcoming',
        type: 'farm',
        budget: 1200000,
        expenses: 50000,
        size: 15,
        sizeUnit: 'acres',
        assignedTo: 'Amit Kumar',
        assignedTeam: ['Amit Kumar'],
        visitCompletionPercent: 0,
        budgetUtilizationPercent: 4,
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        isFavorite: false,
        crops: ['Vegetables', 'Fruits'],
      },
      {
        id: 'proj-5',
        name: 'Garden Redesign Project',
        client: 'Kumar Residency',
        clientAvatar: 'https://ui-avatars.com/api/?name=Kumar+Residency',
        location: {city:'Ahmedabad, Gujarat'},
        category: 'GARDENING',
        city: 'Ahmedabad',
        district: 'Ahmedabad',
        status: 'On Hold',
        type: 'landscaping',
        budget: 180000,
        expenses: 90000,
        size: 1500,
        sizeUnit: 'sqm',
        assignedTo: 'Mahir Ratanpara',
        assignedTeam: ['Mahir Ratanpara'],
        visitCompletionPercent: 50,
        budgetUtilizationPercent: 50,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        isFavorite: false,
      },
    ];
  }

  private getMockSearchResults(query: string): Project[] {
    const allProjects = this.getMockProjects();
    const lowerQuery = query.toLowerCase();

    return allProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(lowerQuery) ||
        project.client.toLowerCase().includes(lowerQuery) ||
        project.location.city?.toLowerCase().includes(lowerQuery)
    );
  }

  // ========================
  // Project Creation & Management
  // ========================

  /**
   * Create new project
   */
  createProject(projectData: any): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects`,
      projectData
    ).pipe(
      map((response) => ({
        ...response,
        data: response.data ? {
          ...response.data,
          id: response.data.id || response.data._id, // Map MongoDB _id to id
        } : null,
      })),
      catchError(() => {
        // Mock success for development
        const mockId = 'proj-new-' + Date.now();
        return of({
          success: true,
          data: { id: mockId, _id: mockId, ...projectData },
          message: 'Project created successfully'
        });
      })
    );
  }

  /**
   * Get project by ID with full details
   */
  getProjectById(projectId: string): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(
      `${this.API_URL}/projects/${projectId}`
    ).pipe(
      catchError(() => {
        // Mock data for development
        const mockProjects = this.getMockProjects();
        const project = mockProjects.find(p => p.id === projectId) || mockProjects[0];
        return of({ success: true, data: project });
      })
    );
  }

  /**
   * Update existing project
   */
  updateProject(projectId: string, projectData: any): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.patch<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects/${projectId}`,
      projectData
    ).pipe(
      catchError(() => {
        // Mock success for development
        return of({
          success: true,
          data: { _id: projectId, ...projectData },
          message: 'Project updated successfully'
        });
      })
    );
  }

  // ========================
  // Draft Management
  // ========================

  /**
   * Save project as draft
   */
  saveProjectDraft(draftData: any, wizardStep: number, projectId?: string): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects/drafts`,
      { ...draftData, wizardStep, projectId }
    ).pipe(
      map((response) => ({
        ...response,
        data: response.data ? {
          ...response.data,
          projectId: response.data.projectId || response.data.project?._id || response.data.project?.id,
          project: response.data.project ? {
            ...response.data.project,
            id: response.data.project.id || response.data.project._id,
          } : null,
        } : null,
      })),
      catchError(() => {
        // Mock success for development
        const mockId = projectId || 'project-' + Date.now();
        return of({
          success: true,
          data: {
            projectId: mockId,
            project: { id: mockId, _id: mockId, ...draftData },
            draft: { ...draftData, wizardStep }
          },
          message: 'Draft saved successfully'
        });
      })
    );
  }

  /**
   * Update existing draft
   */
  updateProjectDraft(draftId: string, draftData: any, wizardStep: number): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.put<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects/drafts/${draftId}`,
      { ...draftData, wizardStep }
    ).pipe(
      catchError(() => {
        // Mock success for development
        return of({
          success: true,
          data: { _id: draftId, ...draftData, wizardStep },
          message: 'Draft updated successfully'
        });
      })
    );
  }

  /**
   * Get user's draft projects
   */
  getUserDrafts(): Observable<{ success: boolean; data: any[]; count: number }> {
    return this.http.get<{ success: boolean; data: any[]; count: number }>(
      `${this.API_URL}/projects/drafts/list`
    ).pipe(
      map((response) => ({
        ...response,
        data: response.data.map((draft: any) => ({
          ...draft,
          id: draft.id || draft._id, // Map MongoDB _id to id
        })),
      })),
      catchError(() => {
        // Mock empty drafts for development
        return of({ success: true, data: [], count: 0 });
      })
    );
  }

  /**
   * Get specific draft by project ID
   */
  getProjectDraft(projectId: string): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(
      `${this.API_URL}/projects/drafts/${projectId}`
    ).pipe(
      map((response) => ({
        ...response,
        data: response.data ? {
          ...response.data,
          id: response.data.id || response.data._id, // Map MongoDB _id to id
        } : null,
      })),
      catchError(() => {
        // Mock draft for development
        return of({ success: false, data: null });
      })
    );
  }

  /**
   * Complete draft and convert to final project (using project ID)
   */
  completeDraft(projectId: string, projectData: any): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects/drafts/${projectId}/complete`,
      projectData
    ).pipe(
      map((response) => ({
        ...response,
        data: response.data ? {
          ...response.data,
          id: response.data.id || response.data._id, // Map MongoDB _id to id
        } : null,
      })),
      catchError(() => {
        // Mock success for development
        return of({
          success: true,
          data: { id: projectId, _id: projectId, ...projectData },
          message: 'Project created successfully'
        });
      })
    );
  }

  // ========================
  // Project Details (for detail page)
  // ========================

  /**
   * Get project details by ID
   */
  getProjectDetails(projectId: string): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(
      `${this.API_URL}/projects/${projectId}`
    ).pipe(
      map((response) => ({
        ...response,
        data: response.data ? {
          ...response.data,
          id: response.data.id || response.data._id, // Map MongoDB _id to id
        } : null,
      })),
      catchError(() => {
        // Mock data for development
        return of({ success: false, data: null });
      })
    );
  }

  /**
   * Delete project (soft delete)
   */
  deleteProject(projectId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.API_URL}/projects/${projectId}`
    );
  }

  /**
   * Permanently delete project (admin only)
   */
  hardDeleteProject(projectId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.API_URL}/projects/${projectId}/hard`
    );
  }

  /**
   * Get project activity log
   */
  getProjectActivity(projectId: string, page: number = 1, limit: number = 50): Observable<{ success: boolean; activities: any[]; pagination: any }> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<{ success: boolean; activities: any[]; pagination: any }>(
      `${this.API_URL}/projects/${projectId}/activity`,
      { params }
    ).pipe(
      catchError(() => {
        // Mock data for development
        return of({
          success: true,
          activities: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0, hasNext: false, hasPrevious: false }
        });
      })
    );
  }

  /**
   * Get project timeline
   */
  getProjectTimeline(projectId: string): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(
      `${this.API_URL}/projects/${projectId}/timeline`
    ).pipe(
      catchError(() => {
        // Mock data for development
        return of({
          success: true,
          data: {
            project: { name: 'Project', startDate: new Date(), expectedEndDate: new Date(), status: 'Running' },
            milestones: [],
            progress: { percentage: 0, totalDays: 0, elapsedDays: 0, remainingDays: 0 }
          }
        });
      })
    );
  }

  /**
   * Add contact to project
   */
  addContact(projectId: string, contactData: any): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects/${projectId}/contacts`,
      contactData
    ).pipe(
      catchError(() => {
        // Mock success for development
        return of({ success: true, data: contactData, message: 'Contact added successfully' });
      })
    );
  }

  /**
   * Add milestone to project
   */
  addMilestone(projectId: string, milestoneData: any): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/projects/${projectId}/milestones`,
      milestoneData
    ).pipe(
      catchError(() => {
        // Mock success for development
        return of({ success: true, data: milestoneData, message: 'Milestone added successfully' });
      })
    );
  }

  // ========================
  // Transaction Management (NEW: Separate Document API)
  // ========================

  /**
   * Get project transactions with pagination
   * NEW: Transactions are now in a separate collection
   */
  getProjectTransactions(
    projectId: string,
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'date',
    sortOrder: string = 'desc'
  ): Observable<{ success: boolean; transactions: any[]; pagination: any; summary: any }> {
    const params = new HttpParams()
      .set('projectId', projectId)
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('sortBy', sortBy)
      .set('sortOrder', sortOrder);

    return this.http.get<{ success: boolean; transactions: any[]; pagination: any; summary: any }>(
      `${this.API_URL}/transactions`,
      { params }
    ).pipe(
      catchError(() => {
        // Mock data for development
        return of({
          success: true,
          transactions: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0, hasNext: false, hasPrev: false },
          summary: {
            totalCredits: 0,
            totalDebits: 0,
            netExpense: 0,
            budget: 0,
            budgetRemaining: 0,
            budgetUtilization: 0,
            transactionCount: 0
          }
        });
      })
    );
  }

  /**
   * Add transaction
   * NEW: Creates transaction as separate document
   */
  addTransaction(
    projectId: string,
    transactionData: {
      description: string;
      amount: number;
      type: 'debit' | 'credit';
      category?: string;
      date?: Date;
      notes?: string;
    }
  ): Observable<{ success: boolean; data: any; message: string }> {
    return this.http.post<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/transactions`,
      { projectId, ...transactionData }
    ).pipe(
      catchError((error) => {
        console.error('Error adding transaction:', error);
        throw error;
      })
    );
  }

  /**
   * Update transaction
   * NEW: Updates transaction via transaction ID
   */
  updateTransaction(
    projectId: string,
    transactionId: string,
    updateData: {
      description?: string;
      amount?: number;
      type?: 'debit' | 'credit';
      category?: string;
      date?: Date;
      notes?: string;
    }
  ): Observable<{ success: boolean; data: any; message: string }> {
    const params = new HttpParams().set('projectId', projectId);

    return this.http.patch<{ success: boolean; data: any; message: string }>(
      `${this.API_URL}/transactions/${transactionId}`,
      updateData,
      { params }
    ).pipe(
      catchError((error) => {
        console.error('Error updating transaction:', error);
        throw error;
      })
    );
  }

  /**
   * Delete transaction
   * NEW: Deletes transaction via transaction ID
   */
  deleteTransaction(
    projectId: string,
    transactionId: string
  ): Observable<{ success: boolean; message: string }> {
    const params = new HttpParams().set('projectId', projectId);

    return this.http.delete<{ success: boolean; message: string }>(
      `${this.API_URL}/transactions/${transactionId}`,
      { params }
    ).pipe(
      catchError((error) => {
        console.error('Error deleting transaction:', error);
        throw error;
      })
    );
  }
}
