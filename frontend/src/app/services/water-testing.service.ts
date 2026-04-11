import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

/**
 * WaterTestingData interface - represents a single water test sample
 */
export interface WaterTestingData {
  _id?: string;
  sampleNumber?: string; // User-entered sample number for PDF
  farmersName: string;
  mobileNo: string;
  location: string;
  farmsName: string;
  taluka: string;
  boreWellType?: string; // Bore/Well/Other dropdown
  ph: number | null;
  ec: number | null;
  caMgBlank?: number | null; // Ca+Mg Blank
  caMgStart?: number | null; // Ca+Mg Start
  caMgEnd?: number | null; // Ca+Mg End
  caMgDifference?: number | null; // Auto-calculated: L - K
  caMg?: number | null; // Auto-calculated: (M - J) * 2
  na?: number | null; // Auto-calculated: I * 10 - N
  sar?: number | null; // Auto-calculated: O / SQRT(N / 2)
  classification?: string; // Manual class input
  co3Hco3?: number | null; // CO3 + HCO3 input
  rsc?: number | null; // Auto-calculated: R - N
  finalDeduction: string;
  createdAt?: string;
  updatedAt?: string;

  // Classification result fields (Gujarati)
  phResult?: string;
  ecResult?: string;
  sarResult?: string;
  rscResult?: string;

  // Classification result fields (English)
  phResultEn?: string;
  ecResultEn?: string;
  sarResultEn?: string;
  rscResultEn?: string;

  // Class codes
  ecClass?: string;
  sarClass?: string;
  rscClass?: string;

  // Combined water class (e.g., "C3S1", "C1S3")
  waterClass?: string;

  // Final deduction (English)
  finalDeductionEn?: string;
}

/**
 * Session interface - represents a water testing session
 */
export interface Session {
  _id?: string;
  date: string;
  version: number;
  startTime: string;
  endTime?: string;
  status?: 'started' | 'details' | 'ready' | 'completed'; // Session lifecycle status
  sampleCount?: number;
  lastActivity?: string;
  // Samples are embedded only when a single session is fetched via
  // GET /sessions/:id — the paginated list endpoint omits them for speed.
  data?: WaterTestingData[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Sample pagination response
 */
export interface SamplePaginationResponse {
  samples: WaterTestingData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedSessionsResponse {
  sessions: Session[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type SessionStatusFilter = 'active' | 'completed' | 'all';

@Injectable({
  providedIn: 'root'
})
export class WaterTestingService {
  private apiUrl = `${environment.apiUrl}/water-testing`;

  constructor(private http: HttpClient) { }

  /**
   * Paginated session list for the landing page. Samples are NOT embedded —
   * use `getSession(id)` to load a single session with its samples.
   */
  getSessions(
    page: number = 1,
    limit: number = 10,
    status: SessionStatusFilter = 'all'
  ): Observable<PaginatedSessionsResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (status && status !== 'all') {
      params = params.set('status', status);
    }
    return this.http.get<PaginatedSessionsResponse>(`${this.apiUrl}/sessions`, { params });
  }

  // Get sessions by date
  getSessionsByDate(date: string): Observable<Session[]> {
    return this.http.get<Session[]>(`${this.apiUrl}/sessions/date/${date}`);
  }

  // Get session count for a specific date
  getSessionCount(date: string): Observable<{ date: string; count: number }> {
    return this.http.get<{ date: string; count: number }>(`${this.apiUrl}/sessions/count/${date}`);
  }

  // Get today's session count
  getTodaySessionCount(): Observable<{ date: string; count: number }> {

    return this.http.get<{ date: string; count: number }>(`${this.apiUrl}/sessions/today/count`);
  }

  // Get a specific session by ID
  getSession(id: string): Observable<Session> {
    return this.http.get<Session>(`${this.apiUrl}/sessions/${id}`);
  }

  // Create a new session
  createSession(session: Omit<Session, '_id'>): Observable<Session> {

    return this.http.post<Session>(`${this.apiUrl}/sessions`, session);
  }

  // Update a session
  updateSession(id: string, updates: { endTime?: string; data?: WaterTestingData[] }): Observable<Session> {

    return this.http.put<Session>(`${this.apiUrl}/sessions/${id}`, updates);
  }

  // Update session status (state transitions)
  updateSessionStatus(id: string, status: 'started' | 'details' | 'ready' | 'completed'): Observable<Session> {
    return this.http.patch<Session>(`${this.apiUrl}/sessions/${id}/status`, { status });
  }

  // Delete a session
  deleteSession(id: string): Observable<{ message: string; session: Session }> {
    return this.http.delete<{ message: string; session: Session }>(`${this.apiUrl}/sessions/${id}`);
  }

  // ========================================
  // SAMPLE-SPECIFIC METHODS
  // ========================================

  /**
   * Get paginated samples for a session
   */
  getSamplesForSession(sessionId: string, page: number = 1, limit: number = 100): Observable<SamplePaginationResponse> {
    return this.http.get<SamplePaginationResponse>(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      params: { page: page.toString(), limit: limit.toString() }
    });
  }

  /**
   * Create a new sample for a session
   */
  createSample(sessionId: string, sampleData: Partial<WaterTestingData>): Observable<WaterTestingData> {
    return this.http.post<WaterTestingData>(`${this.apiUrl}/sessions/${sessionId}/samples`, sampleData);
  }

  /**
   * Get a specific sample by ID
   */
  getSampleById(sampleId: string): Observable<WaterTestingData> {
    return this.http.get<WaterTestingData>(`${this.apiUrl}/samples/${sampleId}`);
  }

  /**
   * Update a sample
   */
  updateSample(sampleId: string, updates: Partial<WaterTestingData>): Observable<WaterTestingData> {
    return this.http.put<WaterTestingData>(`${this.apiUrl}/samples/${sampleId}`, updates);
  }

  /**
   * Delete a sample
   */
  deleteSample(sampleId: string): Observable<{ message: string; sample: WaterTestingData }> {
    return this.http.delete<{ message: string; sample: WaterTestingData }>(`${this.apiUrl}/samples/${sampleId}`);
  }

  /**
   * Bulk update samples (upsert)
   * @param sessionId - The session ID
   * @param samples - Array of samples to update/insert
   */
  bulkUpdateSamples(sessionId: string, samples: WaterTestingData[]): Observable<{ message: string; count: number }> {
    return this.http.patch<{ message: string; count: number }>(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      samples
    });
  }

  deleteSamplesBulk(sessionId: string, sampleIds: string[]): Observable<{ message: string; deletedCount: number }> {
    return this.http.delete<{ message: string; deletedCount: number }>(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      body: { sampleIds }
    });
  }

  /**
   * Upload Excel file for session
   */
  uploadExcel(sessionId: string, file: File): Observable<{ message: string; updated: number; added: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ message: string; updated: number; added: number }>(
      `${this.apiUrl}/sessions/${sessionId}/upload-excel`,
      formData
    );
  }
}
