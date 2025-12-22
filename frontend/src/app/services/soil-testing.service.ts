import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

/**
 * SoilTestingData interface - represents a single soil test sample
 * This can be either embedded (old API) or a separate document (new API)
 */
export interface SoilTestingData {
  _id?: string; // Added for referenced samples
  farmersName: string;
  mobileNo: string;
  location: string;
  farmsName: string;
  taluka: string;
  ph: number | null;
  ec: number | null;
  ocBlank: number | null;
  ocStart: number | null;
  ocEnd: number | null;
  p2o5R: number | null;
  k2oR: number | null;
  ocDifference?: number | null; // Auto-calculated
  ocPercent?: number | null; // Auto-calculated
  p2o5: number | null;
  k2o: number | null;
  organicMatter?: number | null; // Auto-calculated
  cropName: string;
  finalDeduction: string;
  createdAt?: string; // Added for referenced samples
  updatedAt?: string; // Added for referenced samples

  // Classification result fields (Gujarati label or classification)
  phResult?: string;
  ecResult?: string;
  nitrogenResult?: string;
  phosphorusResult?: string;
  potashResult?: string;

  // Classification result fields (English)
  phResultEn?: string;
  ecResultEn?: string;
  nitrogenResultEn?: string;
  phosphorusResultEn?: string;
  potashResultEn?: string;
}

/**
 * Session interface - represents a soil testing session
 * Note: 'data' is maintained for backward compatibility but is now populated from separate Sample collection
 */
export interface Session {
  _id?: string;
  date: string;
  version: number;
  startTime: string;
  endTime?: string;
  status?: 'active' | 'completed' | 'archived'; // New field
  sampleCount?: number; // New field - denormalized count
  lastActivity?: string; // New field - tracks when session was last modified
  data: SoilTestingData[]; // Populated from SoilTestSample collection
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Sample pagination response
 */
export interface SamplePaginationResponse {
  samples: SoilTestingData[];
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
export class SoilTestingService {
  private apiUrl = `${environment.apiUrl}/soil-testing`;

  constructor(private http: HttpClient) {}

  // Get all sessions
  getAllSessions(): Observable<Session[]> {
    console.log('Service: Calling getAllSessions API:', `${this.apiUrl}/sessions`);
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
    console.log('Service: Calling getTodaySessionCount API:', `${this.apiUrl}/sessions/today/count`);
    return this.http.get<{ date: string; count: number }>(`${this.apiUrl}/sessions/today/count`);
  }

  // Get a specific session by ID
  getSession(id: string): Observable<Session> {
    return this.http.get<Session>(`${this.apiUrl}/sessions/${id}`);
  }

  // Create a new session
  createSession(session: Omit<Session, '_id'>): Observable<Session> {
    console.log('Service: Calling createSession API:', `${this.apiUrl}/sessions`, session);
    return this.http.post<Session>(`${this.apiUrl}/sessions`, session);
  }

  // Update a session
  updateSession(id: string, updates: { endTime?: string; data?: SoilTestingData[] }): Observable<Session> {
    console.log('Service: Calling updateSession API:', `${this.apiUrl}/sessions/${id}`, updates);
    return this.http.put<Session>(`${this.apiUrl}/sessions/${id}`, updates);
  }

  // Delete a session
  deleteSession(id: string): Observable<{ message: string; session: Session }> {
    return this.http.delete<{ message: string; session: Session }>(`${this.apiUrl}/sessions/${id}`);
  }

  // ========================================
  // NEW SAMPLE-SPECIFIC METHODS
  // ========================================

  /**
   * Get paginated samples for a session
   * @param sessionId - The session ID
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 100)
   */
  getSamplesForSession(sessionId: string, page: number = 1, limit: number = 100): Observable<SamplePaginationResponse> {
    return this.http.get<SamplePaginationResponse>(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      params: { page: page.toString(), limit: limit.toString() }
    });
  }

  /**
   * Create a new sample for a session
   * @param sessionId - The session ID
   * @param sampleData - The sample data
   */
  createSample(sessionId: string, sampleData: Partial<SoilTestingData>): Observable<SoilTestingData> {
    return this.http.post<SoilTestingData>(`${this.apiUrl}/sessions/${sessionId}/samples`, sampleData);
  }

  /**
   * Get a specific sample by ID
   * @param sampleId - The sample ID
   */
  getSampleById(sampleId: string): Observable<SoilTestingData> {
    return this.http.get<SoilTestingData>(`${this.apiUrl}/samples/${sampleId}`);
  }

  /**
   * Update a sample
   * @param sampleId - The sample ID
   * @param updates - The fields to update
   */
  updateSample(sampleId: string, updates: Partial<SoilTestingData>): Observable<SoilTestingData> {
    return this.http.put<SoilTestingData>(`${this.apiUrl}/samples/${sampleId}`, updates);
  }

  /**
   * Delete a sample
   * @param sampleId - The sample ID
   */
  deleteSample(sampleId: string): Observable<{ message: string; sample: SoilTestingData }> {
    return this.http.delete<{ message: string; sample: SoilTestingData }>(`${this.apiUrl}/samples/${sampleId}`);
  }

  /**
   * Bulk delete samples
   * @param sessionId - The session ID
   * @param sampleIds - Array of sample IDs to delete
   */
  deleteSamplesBulk(sessionId: string, sampleIds: string[]): Observable<{ message: string; deletedCount: number }> {
    return this.http.delete<{ message: string; deletedCount: number }>(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      body: { sampleIds }
    });
  }
}
