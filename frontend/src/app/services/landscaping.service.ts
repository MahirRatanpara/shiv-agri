import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Project,
  ProjectFilter,
  ProjectListResponse,
  CommunicationRequest,
  FileUpload
} from '../models/landscaping.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LandscapingService {
  private apiUrl = `${environment.apiUrl}/api/landscaping`;

  constructor(private http: HttpClient) {}

  /**
   * Get all projects with optional filters
   */
  getProjects(filters?: ProjectFilter): Observable<ProjectListResponse> {
    let params = new HttpParams();

    if (filters) {
      if (filters.status) params = params.set('status', filters.status);
      if (filters.searchTerm) params = params.set('searchTerm', filters.searchTerm);
      if (filters.city) params = params.set('city', filters.city);
      if (filters.startDate) params = params.set('startDate', filters.startDate.toISOString());
      if (filters.endDate) params = params.set('endDate', filters.endDate.toISOString());
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params = params.set('sortOrder', filters.sortOrder);
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
    }

    return this.http.get<ProjectListResponse>(`${this.apiUrl}/projects`, { params });
  }

  /**
   * Get a single project by ID
   */
  getProjectById(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/project/${id}`);
  }

  /**
   * Create a new project
   */
  createProject(project: Project): Observable<Project> {
    return this.http.post<Project>(`${this.apiUrl}/projects`, project);
  }

  /**
   * Update an existing project
   */
  updateProject(id: string, project: Partial<Project>): Observable<Project> {
    return this.http.put<Project>(`${this.apiUrl}/project/${id}`, project);
  }

  /**
   * Delete a project
   */
  deleteProject(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/project/${id}`);
  }

  /**
   * Upload files for a project
   */
  uploadFile(projectId: string, file: File, fileType: string): Observable<FileUpload> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);
    formData.append('projectId', projectId);

    return this.http.post<FileUpload>(`${this.apiUrl}/upload`, formData);
  }

  /**
   * Delete a file from a project
   */
  deleteFile(projectId: string, fileId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.apiUrl}/project/${projectId}/file/${fileId}`
    );
  }

  /**
   * Send documents via Email or WhatsApp
   */
  sendDocuments(request: CommunicationRequest): Observable<{ message: string; details: any }> {
    return this.http.post<{ message: string; details: any }>(
      `${this.apiUrl}/send-documents`,
      request
    );
  }

  /**
   * Get unique cities for filter dropdown
   */
  getCities(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/cities`);
  }

  /**
   * Get project statistics for dashboard
   */
  getProjectStats(): Observable<{
    total: number;
    completed: number;
    running: number;
    upcoming: number;
  }> {
    return this.http.get<{
      total: number;
      completed: number;
      running: number;
      upcoming: number;
    }>(`${this.apiUrl}/stats`);
  }
}
