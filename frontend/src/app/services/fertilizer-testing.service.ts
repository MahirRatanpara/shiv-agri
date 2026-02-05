import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface FertilizerSession {
  _id?: string;
  date: string;
  version: number;
  startTime: string;
  endTime?: string;
  status: 'started' | 'generate-reports' | 'completed';
  sampleCount: number;
  lastActivity: string;
  data?: FertilizerSampleData[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FertilizerSampleData {
  _id?: string;
  sessionId?: string;
  sessionDate?: string;
  sessionVersion?: number;
  type: 'normal' | 'small-fruit' | 'large-fruit';

  // Common fields
  sampleNumber: string;
  farmerName: string;
  cropName: string;
  soilSampleId?: string; // Link to soil sample (for auto-created entries)

  // Normal Fertilizer Fields
  nValue?: number | null;
  pValue?: number | null;
  kValue?: number | null;

  // Section A - Organic
  organicManure?: number | null;
  castorCake?: number | null;
  gypsum?: number | null;
  sardarAmin?: number | null;
  micronutrient?: number | null;
  borocol?: number | null;
  ferrous?: number | null;

  // Section B - Chemical
  dap?: number | null;
  npk12?: number | null;
  asp?: number | null;
  narmadaPhos?: number | null;
  ssp?: number | null;
  ammoniumSulphate?: number | null;
  mop?: number | null;
  ureaBase?: number | null;

  // Dose Fertilizers
  day15?: number | null;
  day25Npk?: number | null;
  day25Tricho?: number | null;
  day30?: number | null;
  day45?: number | null;
  day60?: number | null;
  day75?: number | null;
  day90Urea?: number | null;
  day90Mag?: number | null;
  day105?: number | null;
  day115?: number | null;
  day130?: number | null;
  day145?: number | null;
  day160?: number | null;

  // Spray Fertilizers (Normal)
  spray1Npk?: number | null;
  spray1Hormone?: string;
  spray2Stage?: string;
  spray2Npk?: number | null;
  spray2Hormone?: string;
  spray2HormoneDose?: string;
  spray3Stage?: string;
  spray3Npk?: number | null;
  spray3Hormone?: string;
  spray3HormoneDose?: string;
  spray4Stage?: string;
  spray4Npk?: number | null;
  spray4Hormone?: string;
  spray4HormoneDose?: string;
  spray5Stage?: string;
  spray5Npk?: number | null;
  spray5Hormone?: string;
  spray5HormoneDose?: string;
  spray6Boron?: number | null;
  spray6Hormone?: string;
  spray6HormoneDose?: string;
  spray7Stage?: string;
  spray7Dose?: number | null;
  spray7Hormone?: string;
  spray7HormoneDose?: string;
  spray8Micro?: number | null;
  spray8Hormone?: string;
  spray8HormoneDose?: string;
  spray9Stage?: string;
  spray9Dose?: number | null;
  spray9Hormone?: string;
  spray9HormoneDose?: string;

  // Small Fruit Fields
  june_dap?: number | null;
  june_npk?: number | null;
  june_asp?: number | null;
  june_narmada?: number | null;
  june_ssp?: number | null;
  june_as?: number | null;
  june_mop?: number | null;
  june_urea?: number | null;

  month2_dap?: number | null;
  month2_npk?: number | null;
  month2_asp?: number | null;
  month2_narmada?: number | null;
  month2_ssp?: number | null;
  month2_as?: number | null;
  month2_mop?: number | null;
  month2_urea?: number | null;

  october_dap?: number | null;
  october_npk?: number | null;
  october_asp?: number | null;
  october_narmada?: number | null;
  october_ssp?: number | null;
  october_as?: number | null;
  october_mop?: number | null;
  october_urea?: number | null;

  february_dap?: number | null;
  february_npk?: number | null;
  february_asp?: number | null;
  february_narmada?: number | null;
  february_ssp?: number | null;
  february_as?: number | null;
  february_mop?: number | null;
  february_urea?: number | null;

  // Large Fruit Fields
  august_dap?: number | null;
  august_npk?: number | null;
  august_asp?: number | null;
  august_narmada?: number | null;
  august_ssp?: number | null;
  august_as?: number | null;
  august_mop?: number | null;
  august_urea?: number | null;

  month4_dap?: number | null;
  month4_npk?: number | null;
  month4_asp?: number | null;
  month4_narmada?: number | null;
  month4_ssp?: number | null;
  month4_as?: number | null;
  month4_mop?: number | null;
  month4_urea?: number | null;

  // Spray section (fruit trees)
  spray_npk1919?: number | null;
  spray_npk0052?: number | null;
  spray_npk1261?: number | null;
  spray_npk1300?: number | null;
  spray_micromix?: number | null;
}

export interface PaginatedSamplesResponse {
  samples: FertilizerSampleData[];
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
export class FertilizerTestingService {
  private apiUrl = `${environment.apiUrl}/fertilizer-testing`;

  constructor(private http: HttpClient) { }

  // Session Management
  getAllSessions(): Observable<FertilizerSession[]> {
    return this.http.get<FertilizerSession[]>(`${this.apiUrl}/sessions`);
  }

  getSession(id: string): Observable<FertilizerSession> {
    return this.http.get<FertilizerSession>(`${this.apiUrl}/sessions/${id}`);
  }

  createSession(session: Partial<FertilizerSession>): Observable<FertilizerSession> {
    return this.http.post<FertilizerSession>(`${this.apiUrl}/sessions`, session);
  }

  updateSession(id: string, updates: Partial<FertilizerSession>): Observable<FertilizerSession> {
    return this.http.put<FertilizerSession>(`${this.apiUrl}/sessions/${id}`, updates);
  }

  updateSessionStatus(id: string, status: 'started' | 'generate-reports' | 'completed'): Observable<FertilizerSession> {
    return this.http.patch<FertilizerSession>(`${this.apiUrl}/sessions/${id}/status`, { status });
  }

  deleteSession(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/sessions/${id}`);
  }

  getSessionsByDate(date: string): Observable<FertilizerSession[]> {
    return this.http.get<FertilizerSession[]>(`${this.apiUrl}/sessions/date/${date}`);
  }

  getTodaySessionCount(): Observable<{ date: string; count: number }> {
    return this.http.get<{ date: string; count: number }>(`${this.apiUrl}/sessions/today/count`);
  }

  // Sample Management
  getSamplesForSession(sessionId: string, page: number = 1, limit: number = 20): Observable<PaginatedSamplesResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<PaginatedSamplesResponse>(`${this.apiUrl}/sessions/${sessionId}/samples`, { params });
  }

  bulkUpdateSamples(sessionId: string, samples: FertilizerSampleData[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/sessions/${sessionId}/samples`, { samples });
  }

  deleteSamplesBulk(sessionId: string, sampleIds: string[]): Observable<any> {
    return this.http.delete(`${this.apiUrl}/sessions/${sessionId}/samples`, {
      body: { sampleIds }
    });
  }

  // Excel Upload
  uploadExcel(sessionId: string, file: File, type: 'normal' | 'small-fruit' | 'large-fruit'): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    return this.http.post(`${this.apiUrl}/sessions/${sessionId}/upload-excel`, formData);
  }
}
