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

  // Spray Fertilizers (Normal - 3 sprays with uniform structure)
  spray1_stage?: number | null;          // પાકની અવસ્થા (Crop Stage)
  spray1_npkType?: string;               // એન.પી.કે. (NPK Type)
  spray1_npkDose?: number | null;        // ૧૬ લીટર પાણીમાં (NPK Dose)
  spray1_hormoneName?: string;           // હોર્મોન્સનું નામ (Hormone Name)
  spray1_hormoneDose?: number | null;    // ૧૬ લીટર પાણીમાં (Hormone Dose)

  spray2_stage?: number | null;
  spray2_npkType?: string;
  spray2_npkDose?: number | null;
  spray2_hormoneName?: string;
  spray2_hormoneDose?: number | null;

  spray3_stage?: number | null;
  spray3_npkType?: string;
  spray3_npkDose?: number | null;
  spray3_hormoneName?: string;
  spray3_hormoneDose?: number | null;

  // Fruit Tree Fields (shared by small-fruit and large-fruit)
  // M1 section
  m1_month?: string | null;
  m1_dap?: number | null;
  m1_npk?: number | null;
  m1_asp?: number | null;
  m1_narmada?: number | null;
  m1_ssp?: number | null;
  m1_as?: number | null;
  m1_mop?: number | null;
  m1_urea?: number | null;
  m1_borocol?: number | null;
  m1_sardaramin?: number | null;
  m1_chhaniyu?: number | null;
  m1_erandakhol?: number | null;

  // M2 section
  m2_month?: string | null;
  m2_dap?: number | null;
  m2_npk?: number | null;
  m2_asp?: number | null;
  m2_narmada?: number | null;
  m2_ssp?: number | null;
  m2_as?: number | null;
  m2_mop?: number | null;
  m2_urea?: number | null;

  // M3 section
  m3_month?: string | null;
  m3_dap?: number | null;
  m3_npk?: number | null;
  m3_asp?: number | null;
  m3_narmada?: number | null;
  m3_ssp?: number | null;
  m3_as?: number | null;
  m3_mop?: number | null;
  m3_urea?: number | null;
  m3_borocol?: number | null;
  m3_sardaramin?: number | null;
  m3_chhaniyu?: number | null;
  m3_erandakhol?: number | null;

  // M4 section
  m4_month?: string | null;
  m4_dap?: number | null;
  m4_npk?: number | null;
  m4_asp?: number | null;
  m4_narmada?: number | null;
  m4_ssp?: number | null;
  m4_as?: number | null;
  m4_mop?: number | null;
  m4_urea?: number | null;
  m4_borocol?: number | null;
  m4_sardaramin?: number | null;
  m4_chhaniyu?: number | null;
  m4_erandakhol?: number | null;

  // M5 - Spray section (fruit trees)
  m5_npk1919?: number | null;
  m5_npk0052?: number | null;
  m5_npk1261?: number | null;
  m5_npk1300?: number | null;
  m5_micromix?: number | null;
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
