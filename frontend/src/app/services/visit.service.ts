import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';
import { Visit, VisitStats, VisitListResponse, VisitStatus, VisitType } from '../models/visit.model';

@Injectable({ providedIn: 'root' })
export class VisitService {
  private apiUrl = `${environment.apiUrl}/visits`;

  constructor(private http: HttpClient) {}

  getVisits(
    projectId: string,
    page = 1,
    limit = 50,
    status?: VisitStatus,
    type?: VisitType
  ): Observable<{ visits: Visit[]; pagination: VisitListResponse['pagination'] }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (status) params = params.set('status', status);
    if (type) params = params.set('type', type);

    return this.http.get<VisitListResponse>(`${this.apiUrl}/project/${projectId}`, { params }).pipe(
      map(res => ({ visits: res.data || [], pagination: res.pagination }))
    );
  }

  getVisit(id: string): Observable<Visit> {
    return this.http.get<{ success: boolean; data: Visit }>(`${this.apiUrl}/${id}`).pipe(
      map(res => res.data)
    );
  }

  createVisit(data: Partial<Visit>): Observable<Visit> {
    return this.http.post<{ success: boolean; data: Visit }>(this.apiUrl, data).pipe(
      map(res => res.data)
    );
  }

  updateVisit(id: string, data: Partial<Visit>): Observable<Visit> {
    return this.http.put<{ success: boolean; data: Visit }>(`${this.apiUrl}/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  completeVisit(id: string, data: Record<string, unknown>): Observable<Visit> {
    return this.http.put<{ success: boolean; data: Visit }>(`${this.apiUrl}/${id}/complete`, data).pipe(
      map(res => res.data)
    );
  }

  cancelVisit(id: string): Observable<Visit> {
    return this.http.put<{ success: boolean; data: Visit }>(`${this.apiUrl}/${id}/cancel`, {}).pipe(
      map(res => res.data)
    );
  }

  getUpcoming(projectId: string, days?: number): Observable<Visit[]> {
    let params = new HttpParams();
    if (days) params = params.set('days', days.toString());

    return this.http.get<{ success: boolean; data: Visit[] }>(`${this.apiUrl}/project/${projectId}/upcoming`, { params }).pipe(
      map(res => res.data || [])
    );
  }

  getStats(projectId: string): Observable<VisitStats> {
    return this.http.get<{ success: boolean; data: VisitStats }>(`${this.apiUrl}/project/${projectId}/stats`).pipe(
      map(res => res.data)
    );
  }

  scheduleRecurring(projectId: string, config: Record<string, unknown>): Observable<Visit[]> {
    return this.http.post<{ success: boolean; data: Visit[] }>(`${this.apiUrl}/project/${projectId}/schedule-recurring`, config).pipe(
      map(res => res.data || [])
    );
  }
}
