import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of } from 'rxjs';
import { environment } from '../environments/environment';
import {
  Project, ProjectFilters, ProjectSortOptions, Pagination,
  ProjectListResponse, ProjectResponse, DashboardStats,
  StatsResponse, Activity, ActivityResponse, ProjectContact, Milestone
} from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private apiUrl = `${environment.apiUrl}/projects`;

  // Reactive state
  private statsSubject = new BehaviorSubject<DashboardStats | null>(null);
  stats$ = this.statsSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ─── List & Search ───

  getProjects(filters: ProjectFilters = {}, sort: ProjectSortOptions = { sortBy: 'updatedAt', sortOrder: 'desc' }, page = 1, limit = 50): Observable<{ projects: Project[]; pagination: Pagination }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('sortBy', sort.sortBy)
      .set('sortOrder', sort.sortOrder);

    if (filters.search) params = params.set('search', filters.search);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.categoryInclude?.length) {
      filters.categoryInclude.forEach(c => { params = params.append('categoryInclude', c); });
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      statuses.forEach(s => { params = params.append('status', s); });
    }
    if (filters.city) params = params.set('city', filters.city);
    if (filters.state) params = params.set('state', filters.state);
    if (filters.assignedTo) params = params.set('assignedTo', filters.assignedTo);
    if (filters.projectManager) params = params.set('projectManager', filters.projectManager);
    if (filters.budgetMin) params = params.set('budgetMin', filters.budgetMin.toString());
    if (filters.budgetMax) params = params.set('budgetMax', filters.budgetMax.toString());
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.isFavorite) params = params.set('isFavorite', 'true');
    if (filters.isDraft !== undefined) params = params.set('isDraft', String(filters.isDraft));

    return this.http.get<ProjectListResponse>(this.apiUrl, { params }).pipe(
      map(res => ({ projects: res.data || [], pagination: res.pagination })),
      catchError(() => of({ projects: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0, hasNext: false, hasPrevious: false } }))
    );
  }

  // ─── Stats ───

  getStats(): Observable<DashboardStats> {
    return this.http.get<StatsResponse>(`${this.apiUrl}/stats`).pipe(
      map(res => {
        this.statsSubject.next(res.data);
        return res.data;
      }),
      catchError(() => of({
        totalProjects: 0, totalBudget: 0, totalExpenses: 0, totalIncome: 0,
        statusBreakdown: {}, activeProjects: 0, completedProjects: 0
      }))
    );
  }

  // ─── CRUD ───

  getProject(id: string): Observable<Project> {
    return this.http.get<ProjectResponse>(`${this.apiUrl}/${id}`).pipe(
      map(res => res.data)
    );
  }

  createProject(data: Partial<Project>): Observable<Project> {
    return this.http.post<ProjectResponse>(this.apiUrl, data).pipe(
      map(res => res.data)
    );
  }

  updateProject(id: string, data: Partial<Project>): Observable<Project> {
    return this.http.patch<ProjectResponse>(`${this.apiUrl}/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ─── Favorites ───

  toggleFavorite(id: string): Observable<{ isFavorite: boolean }> {
    return this.http.patch<{ success: boolean; data: { isFavorite: boolean } }>(`${this.apiUrl}/${id}/favorite`, {}).pipe(
      map(res => res.data)
    );
  }

  // ─── Bulk Operations ───

  bulkUpdate(projectIds: string[], updateData: Record<string, unknown>): Observable<{ modifiedCount: number }> {
    return this.http.patch<{ success: boolean; data: { modifiedCount: number } }>(`${this.apiUrl}/bulk`, { projectIds, updateData }).pipe(
      map(res => res.data)
    );
  }

  bulkDelete(projectIds: string[]): Observable<{ deletedCount: number }> {
    return this.http.post<{ success: boolean; data: { deletedCount: number } }>(`${this.apiUrl}/bulk-delete`, { projectIds }).pipe(
      map(res => res.data)
    );
  }

  // ─── Export ───

  exportProjects(format: 'xlsx' | 'csv' = 'xlsx', filters: Record<string, string> = {}): Observable<Blob> {
    let params = new HttpParams().set('format', format);
    Object.entries(filters).forEach(([key, value]) => {
      params = params.set(key, value);
    });

    return this.http.get(`${this.apiUrl}/export`, {
      params,
      responseType: 'blob'
    });
  }

  // ─── Contacts ───

  addContact(projectId: string, contact: Partial<ProjectContact>): Observable<ProjectContact> {
    return this.http.post<{ success: boolean; data: ProjectContact }>(`${this.apiUrl}/${projectId}/contacts`, contact).pipe(
      map(res => res.data)
    );
  }

  updateContact(projectId: string, contactId: string, contact: Partial<ProjectContact>): Observable<ProjectContact> {
    return this.http.put<{ success: boolean; data: ProjectContact }>(`${this.apiUrl}/${projectId}/contacts/${contactId}`, contact).pipe(
      map(res => res.data)
    );
  }

  removeContact(projectId: string, contactId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${projectId}/contacts/${contactId}`);
  }

  // ─── Milestones ───

  addMilestone(projectId: string, milestone: Partial<Milestone>): Observable<Milestone> {
    return this.http.post<{ success: boolean; data: Milestone }>(`${this.apiUrl}/${projectId}/milestones`, milestone).pipe(
      map(res => res.data)
    );
  }

  updateMilestone(projectId: string, milestoneId: string, data: Partial<Milestone>): Observable<Milestone> {
    return this.http.patch<{ success: boolean; data: Milestone }>(`${this.apiUrl}/${projectId}/milestones/${milestoneId}`, data).pipe(
      map(res => res.data)
    );
  }

  // ─── Timeline ───

  getTimeline(projectId: string): Observable<Record<string, unknown>> {
    return this.http.get<{ success: boolean; data: Record<string, unknown> }>(`${this.apiUrl}/${projectId}/timeline`).pipe(
      map(res => res.data)
    );
  }

  // ─── Activity ───

  getActivity(projectId: string, page = 1, limit = 20, actionType?: string): Observable<{ activities: Activity[]; pagination: Pagination }> {
    let params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    if (actionType) params = params.set('actionType', actionType);

    return this.http.get<ActivityResponse>(`${this.apiUrl}/${projectId}/activity`, { params }).pipe(
      map(res => ({ activities: res.data || [], pagination: res.pagination })),
      catchError(() => of({ activities: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrevious: false } }))
    );
  }

  // ─── Drafts (Phase 2 placeholders) ───

  getUserDrafts(): Observable<Project[]> {
    return this.http.get<{ success: boolean; data: Project[] }>(`${this.apiUrl}/drafts/list`).pipe(
      map(res => res.data || []),
      catchError(() => of([]))
    );
  }

  saveDraft(data: Record<string, unknown>): Observable<Project> {
    return this.http.post<{ success: boolean; data: Project }>(`${this.apiUrl}/drafts`, data).pipe(
      map(res => res.data)
    );
  }

  updateDraft(projectId: string, data: Record<string, unknown>): Observable<Project> {
    return this.http.put<{ success: boolean; data: Project }>(`${this.apiUrl}/drafts/${projectId}`, data).pipe(
      map(res => res.data)
    );
  }

  completeDraft(projectId: string, data: Record<string, unknown> = {}): Observable<Project> {
    return this.http.post<{ success: boolean; data: Project }>(`${this.apiUrl}/drafts/${projectId}/complete`, data).pipe(
      map(res => res.data)
    );
  }
}
