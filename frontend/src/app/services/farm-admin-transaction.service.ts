import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type FarmTransactionType = 'debit' | 'credit';

export interface FarmTransaction {
  _id: string;
  projectId: string;
  description: string;
  amount: number;
  type: FarmTransactionType;
  category?: string;
  date: string;
  notes?: string;
  createdBy?: { _id: string; name?: string; email?: string } | string;
  lastUpdatedBy?: { _id: string; name?: string; email?: string } | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FarmTransactionListResponse {
  transactions: FarmTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface FarmTransactionSummary {
  totalCredits: number;
  totalDebits: number;
  netExpense: number;
  transactionCount: number;
}

export interface FarmTransactionPayload {
  description: string;
  amount: number;
  type: FarmTransactionType;
  category?: string;
  date?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class FarmAdminTransactionService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, page = 1, limit = 20): Observable<FarmTransactionListResponse> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/admin-transactions`, { params })
      .pipe(
        map((response) => ({
          transactions: response.transactions || response.data || [],
          pagination: response.pagination || { page, limit, total: 0, totalPages: 0 }
        }))
      );
  }

  getSummary(projectId: string): Observable<FarmTransactionSummary> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/admin-transactions/summary`)
      .pipe(map((response) => response.data));
  }

  create(projectId: string, payload: FarmTransactionPayload): Observable<FarmTransaction> {
    return this.http
      .post<any>(`${this.apiUrl}/projects/${projectId}/admin-transactions`, payload)
      .pipe(map((response) => response.data));
  }

  update(
    projectId: string,
    transactionId: string,
    payload: Partial<FarmTransactionPayload>
  ): Observable<FarmTransaction> {
    return this.http
      .patch<any>(`${this.apiUrl}/projects/${projectId}/admin-transactions/${transactionId}`, payload)
      .pipe(map((response) => response.data));
  }

  delete(projectId: string, transactionId: string): Observable<void> {
    return this.http
      .delete<any>(`${this.apiUrl}/projects/${projectId}/admin-transactions/${transactionId}`)
      .pipe(map(() => undefined));
  }
}
