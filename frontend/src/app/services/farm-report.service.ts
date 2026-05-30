import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type FarmReportType = 'soil' | 'water' | 'fertilizer';

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
}
