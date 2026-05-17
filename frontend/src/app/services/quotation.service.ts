import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type QuotationStatus = 'submitted' | 'accepted' | 'rejected' | 'superseded';

export interface QuotationInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  paidAt?: string;
  paidAmount?: number;
}

export interface Quotation {
  _id: string;
  project: string;
  content: string;
  contentText?: string;
  amountPerYear: number;
  installments: QuotationInstallment[];
  startDate: string;
  status: QuotationStatus;
  submittedBy: string;
  submittedByName?: string;
  acceptedBy?: string;
  acceptedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationPayload {
  content: string;
  amountPerYear: number;
  startDate?: string;
}

@Injectable({ providedIn: 'root' })
export class QuotationService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string): Observable<Quotation[]> {
    return this.http.get<any>(`${this.apiUrl}/projects/${projectId}/quotations`).pipe(
      map((response) => response.quotations || [])
    );
  }

  getActive(projectId: string): Observable<Quotation | null> {
    return this.http.get<any>(`${this.apiUrl}/projects/${projectId}/quotations/active`).pipe(
      map((response) => response.quotation || null)
    );
  }

  getById(projectId: string, quotationId: string): Observable<Quotation> {
    return this.http.get<any>(`${this.apiUrl}/projects/${projectId}/quotations/${quotationId}`).pipe(
      map((response) => response.quotation)
    );
  }

  submit(projectId: string, payload: QuotationPayload): Observable<{ quotation: Quotation; project: any }> {
    return this.http.post<any>(`${this.apiUrl}/projects/${projectId}/quotations`, payload).pipe(
      map((response) => response.data)
    );
  }

  accept(projectId: string, quotationId: string): Observable<{ quotation: Quotation; project: any }> {
    return this.http
      .patch<any>(`${this.apiUrl}/projects/${projectId}/quotations/${quotationId}/accept`, {})
      .pipe(map((response) => response.data));
  }

  reject(
    projectId: string,
    quotationId: string,
    reason?: string
  ): Observable<{ quotation: Quotation; project: any }> {
    return this.http
      .patch<any>(`${this.apiUrl}/projects/${projectId}/quotations/${quotationId}/reject`, { reason })
      .pipe(map((response) => response.data));
  }

  downloadPdf(projectId: string, quotationId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/projects/${projectId}/quotations/${quotationId}/pdf`,
      { responseType: 'blob' }
    );
  }
}
