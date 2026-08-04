import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface DeliveryTransition {
  status: string;
  recipient?: string;
  errorCode?: number;
  errorTitle?: string;
  errorDetails?: string;
  errorHint?: string;
  statusTimestamp?: string;
  receivedAt?: string;
}

export interface DeliveryMessage {
  wamid: string;
  recipient?: string;
  latestStatus: string;
  conversationCategory?: string;
  errorCode?: number;
  errorTitle?: string;
  errorDetails?: string;
  errorHint?: string;
  firstSeen?: string;
  lastUpdated?: string;
  transitions?: DeliveryTransition[];
}

export interface DeliveryPage {
  messages: DeliveryMessage[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface FailureReason {
  errorCode: number;
  count: number;
  title?: string;
  hint?: string;
}

export interface DeliverySummary {
  totalTracked: number;
  byStatus: Record<string, number>;
  deliveredCount: number;
  failedCount: number;
  deliveryRatePercent: number;
  topFailureReasons: FailureReason[];
}

export interface MessageQuery {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class WhatsappDeliveryService {
  private readonly baseUrl = `${environment.apiUrl}/admin/whatsapp`;

  constructor(private http: HttpClient) {}

  getSummary(): Observable<DeliverySummary> {
    return this.http.get<DeliverySummary>(`${this.baseUrl}/summary`);
  }

  getMessages(query: MessageQuery = {}): Observable<DeliveryPage> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.status) params = params.set('status', query.status);
    if (query.search) params = params.set('search', query.search);
    return this.http.get<DeliveryPage>(`${this.baseUrl}/messages`, { params });
  }

  getMessage(wamid: string): Observable<{ found: boolean; message?: DeliveryMessage }> {
    return this.http.get<{ found: boolean; message?: DeliveryMessage }>(
      `${this.baseUrl}/messages/${encodeURIComponent(wamid)}`
    );
  }
}
