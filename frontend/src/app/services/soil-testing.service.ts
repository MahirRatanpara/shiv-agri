import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SoilTestingData {
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
}

export interface Session {
  _id?: string;
  date: string;
  version: number;
  startTime: string;
  endTime?: string;
  data: SoilTestingData[];
}

@Injectable({
  providedIn: 'root'
})
export class SoilTestingService {
  private apiUrl = 'http://localhost:3000/api/soil-testing';

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
}
