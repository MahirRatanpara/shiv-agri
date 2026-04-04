import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';
import { Task, TaskStatus, TaskStats } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private apiUrl = `${environment.apiUrl}/tasks`;

  constructor(private http: HttpClient) {}

  getTasks(projectId: string, status?: TaskStatus, page = 1, limit = 50): Observable<{ tasks: Task[]; pagination: any }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (status) params = params.set('status', status);

    return this.http.get<any>(`${this.apiUrl}/project/${projectId}`, { params }).pipe(
      map(res => ({ tasks: res.data || [], pagination: res.pagination }))
    );
  }

  getTask(id: string): Observable<Task> {
    return this.http.get<{ success: boolean; data: Task }>(`${this.apiUrl}/${id}`).pipe(
      map(res => res.data)
    );
  }

  createTask(data: Partial<Task>): Observable<Task> {
    return this.http.post<{ success: boolean; data: Task }>(this.apiUrl, data).pipe(
      map(res => res.data)
    );
  }

  updateTask(id: string, data: Partial<Task>): Observable<Task> {
    return this.http.put<{ success: boolean; data: Task }>(`${this.apiUrl}/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  deleteTask(id: string): Observable<any> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/${id}`).pipe(
      map(res => res)
    );
  }

  updateChecklist(taskId: string, index: number, isDone: boolean): Observable<Task> {
    return this.http.put<{ success: boolean; data: Task }>(`${this.apiUrl}/${taskId}/checklist/${index}`, { isDone }).pipe(
      map(res => res.data)
    );
  }

  getStats(projectId: string): Observable<TaskStats> {
    return this.http.get<{ success: boolean; data: TaskStats }>(`${this.apiUrl}/project/${projectId}/stats`).pipe(
      map(res => res.data)
    );
  }
}
