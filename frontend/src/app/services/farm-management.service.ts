import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type FarmStatus = 'pending_approval' | 'approved' | 'rejected' | 'Upcoming' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled';

export interface FarmProject {
  id: string;
  _id?: string;
  name: string;
  status: FarmStatus;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: {
    address: string;
    city?: string;
    district: string;
    state?: string;
    postalCode?: string;
    mapUrl?: string;
  };
  landDetails?: {
    totalArea: number;
    areaUnit: 'acres' | 'hectares' | 'sqmeters';
    soilType: string;
    cultivableArea?: number;
    waterSource?: string[];
    irrigationSystem?: string;
    terrainType?: string;
  };
  crops?: Array<{ name: string; variety?: string; season?: string; area?: number }>;
  registrationSource?: 'farmer_self' | 'manager_direct';
  submittedBy?: string | { _id?: string; id?: string };
  clientId?: string | { _id?: string; id?: string };
  createdBy?: string | { _id?: string; id?: string };
  submittedAt?: string;
  approvedAt?: string;
  rejectedReason?: string;
  createdAt?: string;
  updatedAt?: string;
  alternativeContact?: string;
  description?: string;
  notes?: string;
  startDate?: string;
  completionDate?: string;
  expectedCompletionDate?: string;
  visitFrequency?: number;
}

export interface FarmRegistrationPayload {
  name: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  category: 'FARM';
  projectType: 'farm';
  budget: number;
  location: {
    address: string;
    city?: string;
    district: string;
    state?: string;
    postalCode?: string;
    mapUrl?: string;
  };
  landDetails: {
    totalArea: number;
    areaUnit: 'acres' | 'hectares' | 'sqmeters';
    soilType: string;
    cultivableArea?: number;
    waterSource?: string[];
    irrigationSystem?: string;
    terrainType?: string;
  };
  crops: Array<{ name: string; variety?: string; season?: string; area?: number }>;
  alternativeContact?: string;
  description?: string;
  notes?: string;
  startDate?: string;
  expectedCompletionDate?: string;
  visitFrequency?: number;
}

export interface FarmListResponse {
  farms: FarmProject[];
  total: number;
  pendingCount: number;
}

@Injectable({ providedIn: 'root' })
export class FarmManagementService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getFarms(options: {
    status?: string;
    submittedBy?: 'me';
    search?: string;
    district?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  } = {}): Observable<FarmListResponse> {
    let params = new HttpParams()
      .set('categoryInclude', 'FARM')
      .set('sortBy', options.sortBy || 'updatedAt')
      .set('sortOrder', options.sortOrder || 'desc')
      .set('page', String(options.page || 1))
      .set('limit', String(options.limit || 100));

    if (options.status) params = params.set('status', options.status);
    if (options.submittedBy) params = params.set('submittedBy', options.submittedBy);
    if (options.search) params = params.set('search', options.search);
    if (options.district) params = params.set('district', options.district);

    return this.http.get<any>(`${this.apiUrl}/projects`, { params }).pipe(
      map((response) => {
        const farms = (response.projects || []).map((farm: any) => ({
          ...farm,
          id: farm.id || farm._id
        }));

        return {
          farms,
          total: response.pagination?.total || farms.length,
          pendingCount: farms.filter((farm: FarmProject) => farm.status === 'pending_approval').length
        };
      })
    );
  }

  registerFarm(payload: FarmRegistrationPayload): Observable<FarmProject> {
    return this.http.post<any>(`${this.apiUrl}/projects`, payload).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  approveFarm(projectId: string): Observable<FarmProject> {
    return this.http.patch<any>(`${this.apiUrl}/projects/${projectId}/approve`, {}).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  rejectFarm(projectId: string, reason?: string): Observable<FarmProject> {
    return this.http.patch<any>(`${this.apiUrl}/projects/${projectId}/reject`, { reason }).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  startFarm(projectId: string): Observable<FarmProject> {
    return this.http.patch<any>(`${this.apiUrl}/projects/${projectId}/start`, {}).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  completeFarm(projectId: string): Observable<FarmProject> {
    return this.http.patch<any>(`${this.apiUrl}/projects/${projectId}/complete`, {}).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  updateFarmStatus(projectId: string, status: Extract<FarmStatus, 'approved' | 'Running' | 'Completed' | 'On Hold' | 'Cancelled'>): Observable<FarmProject> {
    return this.http.patch<any>(`${this.apiUrl}/projects/${projectId}/status`, { status }).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  requestFarmEdit(projectId: string, payload: Partial<FarmRegistrationPayload>): Observable<FarmProject> {
    return this.http.patch<any>(`${this.apiUrl}/projects/${projectId}/request-edit`, payload).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  getFarmById(projectId: string): Observable<FarmProject> {
    return this.http.get<any>(`${this.apiUrl}/projects/${projectId}`).pipe(
      map((response) => ({
        ...response.data,
        id: response.data?.id || response.data?._id
      }))
    );
  }

  lookupUserByPhone(phone: string): Observable<{ id: string; name: string; email: string; phoneNumber?: string; role: string }> {
    const params = new HttpParams().set('phone', phone);
    return this.http.get<any>(`${this.apiUrl}/users/lookup/by-phone`, { params }).pipe(
      map((response) => response.user)
    );
  }
}
