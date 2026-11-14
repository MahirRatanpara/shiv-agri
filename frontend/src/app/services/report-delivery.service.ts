import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../environments/environment';

export type ReportSampleType = 'soil' | 'water' | 'fertilizer';
export type DeliveryChannel = 'whatsapp' | 'email';
export type DeliveryStatus = 'not_sent' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/** Latest-send snapshot embedded on each sample row (`row.delivery.whatsapp`). */
export interface ChannelDeliveryStatus {
  status: DeliveryStatus;
  recipient?: string | null;
  lastDeliveryId?: string | null;
  lastSentAt?: string | null;
  lastStatusAt?: string | null;
  sendCount?: number;
  lastError?: string | null;
}

export interface SampleDelivery {
  whatsapp?: ChannelDeliveryStatus;
  email?: ChannelDeliveryStatus;
}

export interface PrecheckItem {
  sampleId: string;
  sampleNumber: string;
  farmerName: string;
  farmsName: string;
  mobileNo: string;
  recipient: string | null;
  recipientDisplay: string | null;
  valid: boolean;
  reason: string | null;
  alreadySent: boolean;
  lastStatus: DeliveryStatus;
  lastSentAt: string | null;
  lastRecipient: string | null;
  sendCount: number;
}

export interface PrecheckResult {
  sampleType: ReportSampleType;
  channel: DeliveryChannel;
  items: PrecheckItem[];
  summary: { requested: number; found: number; missing: number; valid: number; invalid: number; alreadySent: number };
}

export interface SendResult {
  batchId: string;
  channel: DeliveryChannel;
  recipient?: string;
  queued: { deliveryId: string; sampleId: string; isResend: boolean }[];
  skipped: PrecheckItem[];
}

export interface DeliveryRow {
  id: string;
  sampleType: ReportSampleType;
  sampleId: string;
  sessionId: string | null;
  sessionDate: string | null;
  sampleNumber: string;
  farmerName: string;
  farmsName: string;
  channel: DeliveryChannel;
  recipient: string;
  recipientDisplay: string;
  batchId: string;
  isResend: boolean;
  sendSequence: number;
  status: Exclude<DeliveryStatus, 'not_sent'>;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  error: { code: string | null; message: string | null; permanent: boolean } | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  sentByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryStatusEvent {
  status: string;
  at: string;
  source: 'api' | 'webhook' | 'reconciler' | 'user';
  note: string | null;
}

export interface DeliveryDetail extends DeliveryRow {
  providerMessageId: string | null;
  statusHistory: DeliveryStatusEvent[];
  shareLink: { expiresAt: string; revoked: boolean; accessCount: number; lastAccessedAt: string | null } | null;
}

export interface DeliveryListQuery {
  page?: number;
  limit?: number;
  channel?: DeliveryChannel | '';
  status?: string;
  sampleType?: ReportSampleType | '';
  search?: string;
  from?: string;
  to?: string;
}

export interface DeliveryListResponse {
  data: DeliveryRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ReportDeliverySummary {
  total: number;
  byStatus: Record<'queued' | 'sent' | 'delivered' | 'read' | 'failed', number>;
  byChannel: Record<DeliveryChannel, number>;
  pending: number;
  successRatePercent: number;
}

export interface PublicReportInfo {
  sampleType: ReportSampleType;
  title: string;
  sampleNumber: string;
  farmerName: string;
  farmsName: string;
  sessionDate: string;
  expiresAt: string;
  appLinks: { android: string; ios: string | null };
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** Display metadata shared by the grid chip, dialogs and dashboard. */
export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; icon: string; tone: string }> = {
  not_sent: { label: 'Not sent', icon: 'far fa-circle', tone: 'neutral' },
  queued: { label: 'Sending', icon: 'fas fa-circle-notch fa-spin', tone: 'pending' },
  sent: { label: 'Sent', icon: 'fas fa-check', tone: 'info' },
  delivered: { label: 'Delivered', icon: 'fas fa-check-double', tone: 'success' },
  read: { label: 'Read', icon: 'fas fa-check-double', tone: 'read' },
  failed: { label: 'Failed', icon: 'fas fa-exclamation-circle', tone: 'danger' }
};

@Injectable({ providedIn: 'root' })
export class ReportDeliveryService {
  private readonly baseUrl = `${environment.apiUrl}/report-delivery`;
  private readonly publicUrl = `${environment.apiUrl}/public/reports`;

  constructor(private http: HttpClient) {}

  // ── Testing-page actions ──

  precheck(sampleType: ReportSampleType, sampleIds: string[], channel: DeliveryChannel): Observable<PrecheckResult> {
    return this.http
      .post<ApiEnvelope<PrecheckResult>>(`${this.baseUrl}/${sampleType}/precheck`, { sampleIds, channel })
      .pipe(map((r) => r.data));
  }

  sendWhatsApp(sampleType: ReportSampleType, sampleIds: string[], confirmResend: boolean): Observable<ApiEnvelope<SendResult>> {
    return this.http.post<ApiEnvelope<SendResult>>(`${this.baseUrl}/${sampleType}/whatsapp`, { sampleIds, confirmResend });
  }

  sendEmail(sampleType: ReportSampleType, sampleIds: string[], email: string, confirmResend: boolean): Observable<ApiEnvelope<SendResult>> {
    return this.http.post<ApiEnvelope<SendResult>>(`${this.baseUrl}/${sampleType}/email`, { sampleIds, email, confirmResend });
  }

  getStatuses(sampleType: ReportSampleType, sampleIds: string[]): Observable<{ sampleId: string; delivery: SampleDelivery | null }[]> {
    return this.http
      .post<ApiEnvelope<{ sampleId: string; delivery: SampleDelivery | null }[]>>(`${this.baseUrl}/${sampleType}/status`, { sampleIds })
      .pipe(map((r) => r.data));
  }

  previewPdf(sampleType: ReportSampleType, sampleId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${sampleType}/samples/${sampleId}/preview`, { responseType: 'blob' });
  }

  // ── Dashboard ──

  list(query: DeliveryListQuery): Observable<DeliveryListResponse> {
    return this.http
      .get<{ success: boolean } & DeliveryListResponse>(this.baseUrl, { params: this.toParams(query) })
      .pipe(map((r) => ({ data: r.data, pagination: r.pagination })));
  }

  summary(query: DeliveryListQuery): Observable<ReportDeliverySummary> {
    return this.http
      .get<ApiEnvelope<ReportDeliverySummary>>(`${this.baseUrl}/summary`, { params: this.toParams(query) })
      .pipe(map((r) => r.data));
  }

  getDelivery(id: string): Observable<DeliveryDetail> {
    return this.http.get<ApiEnvelope<DeliveryDetail>>(`${this.baseUrl}/deliveries/${id}`).pipe(map((r) => r.data));
  }

  retry(id: string): Observable<ApiEnvelope<{ retried: number }>> {
    return this.http.post<ApiEnvelope<{ retried: number }>>(`${this.baseUrl}/deliveries/${id}/retry`, {});
  }

  // ── Public report link (/r/:token) ──

  getPublicReport(token: string): Observable<PublicReportInfo> {
    return this.http
      .get<ApiEnvelope<PublicReportInfo>>(`${this.publicUrl}/${encodeURIComponent(token)}`)
      .pipe(map((r) => r.data));
  }

  getPublicReportPdf(token: string): Observable<Blob> {
    return this.http.get(`${this.publicUrl}/${encodeURIComponent(token)}/pdf`, { responseType: 'blob' });
  }

  publicPdfUrl(token: string, download = false): string {
    return `${this.publicUrl}/${encodeURIComponent(token)}/pdf${download ? '?download=1' : ''}`;
  }

  private toParams(query: DeliveryListQuery): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return params;
  }
}
