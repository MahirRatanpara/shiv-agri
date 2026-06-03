import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../environments/environment';

export type FarmReportType = 'soil' | 'water' | 'fertilizer';
export type ManualReportSampleType = 'soil' | 'water' | 'fertilizer' | 'other';

export interface FarmReport {
  reportId: string;
  sampleType: FarmReportType;
  sampleId: string;
  sampleModel: 'SoilSample' | 'WaterSample' | 'FertilizerSample';
  sessionId?: string;
  sampleNumber?: string;
  farmerName?: string;
  farmsName?: string;
  mobileNo?: string;
  cropName?: string;
  fertilizerType?: string;
  sessionDate?: string;
  generatedAt: string;
  generatedByName?: string;
}

export interface FarmReportListResponse {
  count: number;
  reports: FarmReport[];
}

@Injectable({ providedIn: 'root' })
export class FarmReportService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listReports(projectId: string): Observable<FarmReportListResponse> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/reports`)
      .pipe(
        map((response) => ({
          count: response.count || 0,
          reports: response.reports || []
        }))
      );
  }

  /**
   * Returns the PDF blob for inline preview (overlay viewer).
   */
  viewReportPdf(projectId: string, reportId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/projects/${projectId}/reports/${reportId}/pdf`,
      { responseType: 'blob' }
    );
  }

  /**
   * Returns the PDF blob with attachment disposition (explicit download).
   */
  downloadReportPdf(projectId: string, reportId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/projects/${projectId}/reports/${reportId}/pdf/download`,
      { responseType: 'blob' }
    );
  }

  /**
   * Trigger a browser download for an already-fetched blob.
   */
  triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // ========================
  // Manual report uploads (admin/manager attach photos/PDFs alongside the
  // auto-linked soil/water/fertilizer reports).
  // ========================

  listManualReports(projectId: string): Observable<ManualReport[]> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/manual-reports`)
      .pipe(map((response) => response.items || []));
  }

  uploadManualReports(
    projectId: string,
    files: File[],
    meta: { title?: string; notes?: string; sampleType?: ManualReportSampleType } = {}
  ): Observable<ManualReportUploadEvent> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));
    if (meta.title) formData.append('title', meta.title);
    if (meta.notes) formData.append('notes', meta.notes);
    if (meta.sampleType) formData.append('sampleType', meta.sampleType);

    const request = new HttpRequest(
      'POST',
      `${this.apiUrl}/projects/${projectId}/manual-reports`,
      formData,
      { reportProgress: true }
    );

    return this.http.request<any>(request).pipe(
      map((event: HttpEvent<any>): ManualReportUploadEvent | null => {
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
      filter((event): event is ManualReportUploadEvent => event !== null)
    );
  }

  deleteManualReport(projectId: string, reportId: string): Observable<void> {
    return this.http
      .delete<any>(`${this.apiUrl}/projects/${projectId}/manual-reports/${reportId}`)
      .pipe(map(() => void 0));
  }
}

export interface ManualReport {
  _id: string;
  mediaId: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
  fileName?: string;
  title?: string;
  notes?: string;
  sampleType: ManualReportSampleType;
  status: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface ManualReportUploadResult {
  uploaded: ManualReport[];
  failures: Array<{ filename: string; status: number; message: string }>;
}

export type ManualReportUploadEvent =
  | { kind: 'progress'; loaded: number; total: number }
  | { kind: 'done'; result: ManualReportUploadResult };
