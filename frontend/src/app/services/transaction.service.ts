import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';
import {
  Transaction, TransactionListResponse, TransactionResponse,
  TransactionSummary, CategoryBreakdown, MonthlyTrend
} from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private baseUrl = `${environment.apiUrl}/transactions`;

  constructor(private http: HttpClient) {}

  getTransactions(projectId: string, page = 1, limit = 20, type?: string, category?: string): Observable<TransactionListResponse> {
    let params = new HttpParams()
      .set('projectId', projectId)
      .set('page', page)
      .set('limit', limit);
    if (type) params = params.set('type', type);
    if (category) params = params.set('category', category);
    return this.http.get<TransactionListResponse>(this.baseUrl, { params });
  }

  getTransaction(id: string): Observable<Transaction> {
    return this.http.get<TransactionResponse>(`${this.baseUrl}/${id}`).pipe(map(r => r.data));
  }

  createTransaction(data: Partial<Transaction>): Observable<Transaction> {
    return this.http.post<TransactionResponse>(this.baseUrl, data).pipe(map(r => r.data));
  }

  updateTransaction(id: string, data: Partial<Transaction>): Observable<Transaction> {
    return this.http.patch<TransactionResponse>(`${this.baseUrl}/${id}`, data).pipe(map(r => r.data));
  }

  deleteTransaction(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getSummary(projectId: string): Observable<TransactionSummary> {
    const params = new HttpParams().set('projectId', projectId);
    return this.http.get<{ success: boolean; data: TransactionSummary }>(`${this.baseUrl}/summary`, { params })
      .pipe(map(r => r.data));
  }

  getCategoryBreakdown(projectId: string, type?: string): Observable<CategoryBreakdown[]> {
    let params = new HttpParams().set('projectId', projectId);
    if (type) params = params.set('type', type);
    return this.http.get<{ success: boolean; data: CategoryBreakdown[] }>(`${this.baseUrl}/categories`, { params })
      .pipe(map(r => r.data));
  }

  getTrends(projectId: string, months = 12): Observable<MonthlyTrend[]> {
    const params = new HttpParams().set('projectId', projectId).set('months', months);
    return this.http.get<{ success: boolean; data: MonthlyTrend[] }>(`${this.baseUrl}/trends`, { params })
      .pipe(map(r => r.data));
  }
}
