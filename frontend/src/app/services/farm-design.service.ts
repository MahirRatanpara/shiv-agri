import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../environments/environment';

export type FarmDesignType = 'image' | 'video';

export interface FarmDesignRef {
  _id?: string;
  mediaId: string;
  url: string;
  mimeType: string;
  type: FarmDesignType;
  sizeBytes?: number;
  title?: string;
  notes?: string;
  status: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface FarmDesignListResponse {
  items: FarmDesignRef[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface FarmDesignUploadResult {
  uploaded: FarmDesignRef[];
  failures: Array<{ filename: string; status: number; message: string }>;
}

export type FarmDesignUploadEvent =
  | { kind: 'progress'; loaded: number; total: number }
  | { kind: 'done'; result: FarmDesignUploadResult };

@Injectable({ providedIn: 'root' })
export class FarmDesignService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listDesigns(projectId: string, page = 1, limit = 50): Observable<FarmDesignListResponse> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/designs`, {
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
   * Soft-delete a landscaping design. Backend enforces role gating:
   * admin can delete any design; manager can only delete their own uploads.
   */
  deleteDesign(projectId: string, designId: string): Observable<void> {
    return this.http
      .delete<any>(`${this.apiUrl}/projects/${projectId}/designs/${designId}`)
      .pipe(map(() => void 0));
  }

  uploadDesigns(
    projectId: string,
    files: File[],
    meta: { title?: string; notes?: string } = {}
  ): Observable<FarmDesignUploadEvent> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));
    if (meta.title) formData.append('title', meta.title);
    if (meta.notes) formData.append('notes', meta.notes);

    const request = new HttpRequest(
      'POST',
      `${this.apiUrl}/projects/${projectId}/designs`,
      formData,
      { reportProgress: true }
    );

    return this.http.request<any>(request).pipe(
      map((event: HttpEvent<any>): FarmDesignUploadEvent | null => {
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
              failures: body.failures || []
            }
          };
        }
        return null;
      }),
      filter((event): event is FarmDesignUploadEvent => event !== null)
    );
  }
}
