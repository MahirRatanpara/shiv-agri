import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type QuotationStatus = 'submitted' | 'accepted' | 'rejected' | 'superseded';
export type QuotationKind = 'annual' | 'bop';

export interface QuotationInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  paidAt?: string;
  paidAmount?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  paidBy?: string;
}

export interface BopLineItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface Quotation {
  _id: string;
  project: string;
  kind?: QuotationKind;
  title?: string;
  content: string;
  contentText?: string;
  amountPerYear: number;
  installments: QuotationInstallment[];
  bopItems?: BopLineItem[];
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
  /**
   * When true, the quotation is created as already-accepted alongside an
   * admin/manager-direct farm registration. Skips the "project already
   * approved" guard server-side and doesn't notify the farmer.
   */
  attachInitial?: boolean;
}

export interface BopQuotationPayload {
  title?: string;
  content: string;
  bopItems: BopLineItem[];
  startDate?: string;
}

export interface InstallmentPaymentResult {
  alreadyPaid: boolean;
  quotation: Quotation;
  invoice: any;
}

@Injectable({ providedIn: 'root' })
export class QuotationService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  list(projectId: string, kind?: QuotationKind): Observable<Quotation[]> {
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.get<any>(`${this.apiUrl}/projects/${projectId}/quotations`, { params }).pipe(
      map((response) => response.quotations || [])
    );
  }

  /**
   * Adhoc landscaping BOP (Bill of Project) quotation. Separate from the
   * annual pending-quotation flow.
   */
  createBopQuotation(
    projectId: string,
    payload: BopQuotationPayload
  ): Observable<{ quotation: Quotation; project: any }> {
    return this.http
      .post<any>(`${this.apiUrl}/projects/${projectId}/quotations/bop`, payload)
      .pipe(map((response) => response.data));
  }

  /**
   * Mark a quotation installment as paid. Idempotent — if the installment
   * was already paid and has an invoice, the existing invoice is returned.
   */
  markInstallmentPaid(
    projectId: string,
    quotationId: string,
    installmentNumber: number
  ): Observable<InstallmentPaymentResult> {
    return this.http
      .patch<any>(
        `${this.apiUrl}/projects/${projectId}/quotations/${quotationId}/installments/${installmentNumber}/mark-paid`,
        {}
      )
      .pipe(
        map((response) => ({
          alreadyPaid: !!response.alreadyPaid,
          quotation: response.data?.quotation,
          invoice: response.data?.invoice
        }))
      );
  }

  /**
   * Admin-only: revert a previously-paid installment. Resets the installment
   * to pending and soft-deletes the linked invoice.
   */
  revertInstallmentPayment(
    projectId: string,
    quotationId: string,
    installmentNumber: number
  ): Observable<{ quotation: Quotation; revertedInstallment: number; invoiceNumber: string | null; invoiceSoftDeleted: boolean }> {
    return this.http
      .patch<any>(
        `${this.apiUrl}/projects/${projectId}/quotations/${quotationId}/installments/${installmentNumber}/revert`,
        {}
      )
      .pipe(
        map((response) => ({
          quotation: response.data?.quotation,
          revertedInstallment: response.data?.revertedInstallment,
          invoiceNumber: response.data?.invoiceNumber || null,
          invoiceSoftDeleted: !!response.data?.invoiceSoftDeleted
        }))
      );
  }

  /**
   * Download the invoice PDF for a paid installment. Uses the existing
   * /api/pdf/invoice/:invoiceId endpoint.
   */
  downloadInvoicePdf(invoiceId: string): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/pdf/invoice/${invoiceId}`, {}, { responseType: 'blob' });
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
