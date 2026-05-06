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
  pagination: { page: number; limit: number; total: number; totalPages: number };
  quota: FarmMediaQuota;
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

  listMedia(projectId: string, page = 1, limit = 50): Observable<FarmMediaListResponse> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/media`, {
        params: { page: String(page), limit: String(limit) }
      })
      .pipe(
        map((response) => ({
          items: response.items || [],
          pagination: response.pagination,
          quota: response.quota
        }))
      );
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
