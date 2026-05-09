import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../environments/environment';

export type PrescriptionDocType = 'image' | 'pdf' | 'docx' | 'text' | 'manual';

export interface PrescriptionRef {
  source: 'file' | 'manual';
  docType: PrescriptionDocType;
  title?: string;
  notes?: string;
  textContent?: string;
  mediaId?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  fileName?: string;
  status: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface PrescriptionListResponse {
  items: PrescriptionRef[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PrescriptionUploadResult {
  uploaded: PrescriptionRef[];
  failures: Array<{ filename: string; status: number; message: string }>;
}

export type PrescriptionUploadEvent =
  | { kind: 'progress'; loaded: number; total: number }
  | { kind: 'done'; result: PrescriptionUploadResult };

@Injectable({ providedIn: 'root' })
export class FarmPrescriptionService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listPrescriptions(projectId: string, page = 1, limit = 50): Observable<PrescriptionListResponse> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/prescriptions`, {
        params: { page: String(page), limit: String(limit) }
      })
      .pipe(
        map((response) => ({
          items: response.items || [],
          pagination: response.pagination
        }))
      );
  }

  uploadPrescriptions(
    projectId: string,
    files: File[],
    meta: { title?: string; notes?: string } = {}
  ): Observable<PrescriptionUploadEvent> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));
    if (meta.title) formData.append('title', meta.title);
    if (meta.notes) formData.append('notes', meta.notes);

    const request = new HttpRequest(
      'POST',
      `${this.apiUrl}/projects/${projectId}/prescriptions`,
      formData,
      { reportProgress: true }
    );

    return this.http.request<any>(request).pipe(
      map((event: HttpEvent<any>): PrescriptionUploadEvent | null => {
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
      filter((event): event is PrescriptionUploadEvent => event !== null)
    );
  }

  addTextPrescription(
    projectId: string,
    payload: { title?: string; notes?: string; textContent: string }
  ): Observable<{ success: boolean; prescription: PrescriptionRef }> {
    return this.http.post<{ success: boolean; prescription: PrescriptionRef }>(
      `${this.apiUrl}/projects/${projectId}/prescriptions/text`,
      payload
    );
  }

  addManualPrescription(
    projectId: string,
    payload: { title?: string; notes?: string; textContent?: string }
  ): Observable<{ success: boolean; prescription: PrescriptionRef }> {
    return this.http.post<{ success: boolean; prescription: PrescriptionRef }>(
      `${this.apiUrl}/projects/${projectId}/prescriptions/manual`,
      payload
    );
  }
}
