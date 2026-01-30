import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  status?: 'active' | 'completed' | 'archived';
  sampleCount?: number;
  lastActivity?: string;
  data: WaterTestingData[];
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

@Injectable({
  providedIn: 'root'
})
export class WaterTestingService {
  private apiUrl = `${environment.apiUrl}/water-testing`;

  constructor(private http: HttpClient) {}

  // Get all sessions
  getAllSessions(): Observable<Session[]> {

    return this.http.get<Session[]>(`${this.apiUrl}/sessions`);
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
   * Bulk delete samples
   */
  deleteSamplesBulk(sessionId: string, sampleIds: string[]): Observable<{ message: string; deletedCount: number }> {
    return this.http.delete<{ message: string; deletedCount: number }>(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      body: { sampleIds }
    });
  }
}
