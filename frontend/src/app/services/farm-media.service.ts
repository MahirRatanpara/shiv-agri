import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../environments/environment';

export type FarmMediaType = 'image' | 'video';

export interface FarmMediaRef {
  mediaId: string;
  url: string;
  mimeType: string;
  type: FarmMediaType;
  sizeBytes?: number;
  status: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: string;
  attended?: boolean;
  attendedAt?: string;
  attendedByName?: string;
}

export interface FarmMediaQuota {
  used: number;
  limit: number;
  isoWeek: string;
  resetsAt: string;
  lastUploadAt?: string | null;
}

export interface FarmMediaListResponse {
  items: FarmMediaRef[];
  attendedTotal: number;
  total: number;
  quota: FarmMediaQuota;
}

export interface FarmMediaAttendedResponse {
  items: FarmMediaRef[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface FarmMediaUploadResult {
  uploaded: FarmMediaRef[];
  failures: Array<{ filename: string; status: number; message: string }>;
  quota: FarmMediaQuota;
}

export type FarmMediaUploadEvent =
  | { kind: 'progress'; loaded: number; total: number }
  | { kind: 'done'; result: FarmMediaUploadResult };

@Injectable({ providedIn: 'root' })
export class FarmMediaService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Returns unattended media (newly uploaded, not yet acknowledged) plus a
   * count of attended items so the UI can show "View attended photos" without
   * loading all thumbnails. Attended items are NOT fetched here — call
   * listAttendedMedia() on demand.
   */
  listMedia(projectId: string): Observable<FarmMediaListResponse> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/media`)
      .pipe(
        map((response) => ({
          items: response.items || [],
          attendedTotal: response.attendedTotal || 0,
          total: response.total || (response.items?.length ?? 0),
          quota: response.quota
        }))
      );
  }

  /**
   * Paginated list of attended (acknowledged) photos. Loaded lazily on user expand.
   */
  listAttendedMedia(projectId: string, page = 1, limit = 20): Observable<FarmMediaAttendedResponse> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/media/older`, {
        params: { page: String(page), limit: String(limit) }
      })
      .pipe(
        map((response) => ({
          items: response.items || [],
          pagination: response.pagination
        }))
      );
  }

  /**
   * Mark an unattended media item as attended.
   */
  markAttended(projectId: string, mediaId: string): Observable<void> {
    return this.http
      .patch<any>(`${this.apiUrl}/projects/${projectId}/media/${mediaId}/attend`, {})
      .pipe(map(() => undefined));
  }

  /**
   * Mark every unattended media item on the project as attended at once.
   */
  markAllAttended(projectId: string): Observable<{ attendedCount: number }> {
    return this.http
      .patch<any>(`${this.apiUrl}/projects/${projectId}/media/attend-all`, {})
      .pipe(map((response) => ({ attendedCount: response.attendedCount || 0 })));
  }

  /**
   * Soft-delete a media item. Admin-only (server enforces).
   */
  deleteMedia(projectId: string, mediaId: string): Observable<void> {
    return this.http
      .delete<any>(`${this.apiUrl}/projects/${projectId}/media/${mediaId}`)
      .pipe(map(() => undefined));
  }

  getQuota(projectId: string): Observable<FarmMediaQuota> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/media/quota`)
      .pipe(map((response) => response.quota));
  }

  uploadFiles(projectId: string, files: File[]): Observable<FarmMediaUploadEvent> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));

    const request = new HttpRequest('POST', `${this.apiUrl}/projects/${projectId}/media`, formData, {
      reportProgress: true
    });

    return this.http.request<any>(request).pipe(
      map((event: HttpEvent<any>): FarmMediaUploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          return {
            kind: 'progress',
            loaded: event.loaded,
            total: event.total || files.reduce((sum, f) => sum + f.size, 0)
          };
        }
        if (event.type === HttpEventType.Response) {
          const body = event.body || {};
          return {
            kind: 'done',
            result: {
              uploaded: body.uploaded || [],
              failures: body.failures || [],
              quota: body.quota
            }
          };
        }
        return null;
      }),
      filter((event): event is FarmMediaUploadEvent => event !== null)
    );
  }
}
