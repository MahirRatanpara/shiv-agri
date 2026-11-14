import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  DELIVERY_STATUS_META,
  DeliveryChannel,
  DeliveryDetail,
  DeliveryListQuery,
  DeliveryRow,
  DeliveryStatus,
  ReportDeliveryService,
  ReportDeliverySummary,
  ReportSampleType
} from '../../../services/report-delivery.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmationModalService } from '../../../services/confirmation-modal.service';

/**
 * Paginated audit dashboard of every lab report sent to farmers (WhatsApp + email),
 * backed by the report_deliveries collection. Filters are server-side; summary tiles
 * honour every filter except status so the status chips double as counts.
 */
@Component({
  selector: 'app-report-delivery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-delivery.component.html',
  styleUrls: ['./report-delivery.component.css']
})
export class ReportDeliveryComponent implements OnInit, OnDestroy {
  readonly statusMeta = DELIVERY_STATUS_META;
  readonly statusOptions: DeliveryStatus[] = ['queued', 'sent', 'delivered', 'read', 'failed'];
  readonly typeOptions: { value: ReportSampleType | ''; label: string }[] = [
    { value: '', label: 'All reports' },
    { value: 'soil', label: 'Soil' },
    { value: 'water', label: 'Water' },
    { value: 'fertilizer', label: 'Fertilizer' }
  ];
  readonly typeLabels: Record<ReportSampleType, string> = { soil: 'Soil', water: 'Water', fertilizer: 'Fertilizer' };

  summary: ReportDeliverySummary | null = null;
  rows: DeliveryRow[] = [];
  isLoading = false;
  loadError = '';

  // Filters
  channel: DeliveryChannel | '' = '';
  status = '';
  sampleType: ReportSampleType | '' = '';
  search = '';
  from = '';
  to = '';

  // Pagination
  page = 1;
  readonly pageSize = 20;
  total = 0;
  totalPages = 1;

  // Row detail
  expandedId: string | null = null;
  detail: DeliveryDetail | null = null;
  detailLoading = false;
  retrying = new Set<string>();

  autoRefresh = true;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private deliveryService: ReportDeliveryService,
    private toast: ToastService,
    private confirmation: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadAll();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  // ── data ──

  private get query(): DeliveryListQuery {
    return {
      page: this.page,
      limit: this.pageSize,
      channel: this.channel,
      status: this.status,
      sampleType: this.sampleType,
      search: this.search.trim(),
      from: this.from,
      to: this.to
    };
  }

  loadAll(): void {
    this.loadSummary();
    this.loadRows();
  }

  private loadSummary(): void {
    this.deliveryService.summary(this.query).subscribe({
      next: (summary) => (this.summary = summary),
      error: () => { /* the table's error banner covers it */ }
    });
  }

  loadRows(silent = false): void {
    if (!silent) this.isLoading = true;
    this.loadError = '';
    this.deliveryService.list(this.query).subscribe({
      next: (res) => {
        this.rows = res.data;
        this.total = res.pagination.total;
        this.totalPages = Math.max(res.pagination.totalPages, 1);
        this.isLoading = false;
        if (this.expandedId && this.rows.some((r) => r.id === this.expandedId)) this.loadDetail(this.expandedId, true);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        this.rows = [];
        this.loadError = err.status === 403
          ? 'You do not have permission to view report deliveries.'
          : err?.error?.error || 'Could not load report deliveries. Please try again.';
      }
    });
  }

  // ── filters ──

  applyFilters(): void {
    this.page = 1;
    this.expandedId = null;
    this.loadAll();
  }

  setChannel(channel: DeliveryChannel | ''): void {
    this.channel = channel;
    this.applyFilters();
  }

  setStatus(status: string): void {
    this.status = this.status === status ? '' : status;
    this.page = 1;
    this.expandedId = null;
    this.loadRows();
  }

  onSearchChange(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 350);
  }

  get hasFilters(): boolean {
    return !!(this.channel || this.status || this.sampleType || this.search || this.from || this.to);
  }

  clearFilters(): void {
    this.channel = '';
    this.status = '';
    this.sampleType = '';
    this.search = '';
    this.from = '';
    this.to = '';
    this.applyFilters();
  }

  // ── pagination ──

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page) return;
    this.page = page;
    this.expandedId = null;
    this.loadRows();
  }

  get pageNumbers(): number[] {
    const windowSize = 5;
    let start = Math.max(1, this.page - Math.floor(windowSize / 2));
    const end = Math.min(this.totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  get rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.page * this.pageSize, this.total);
  }

  // ── detail & actions ──

  toggleRow(row: DeliveryRow): void {
    if (this.expandedId === row.id) {
      this.expandedId = null;
      this.detail = null;
      return;
    }
    this.expandedId = row.id;
    this.loadDetail(row.id);
  }

  private loadDetail(id: string, silent = false): void {
    if (!silent) {
      this.detail = null;
      this.detailLoading = true;
    }
    this.deliveryService.getDelivery(id).subscribe({
      next: (detail) => {
        if (this.expandedId === id) this.detail = detail;
        this.detailLoading = false;
      },
      error: () => {
        this.detailLoading = false;
        if (!silent) this.toast.error('Could not load delivery details');
      }
    });
  }

  async retry(row: DeliveryRow, event: Event): Promise<void> {
    event.stopPropagation();
    const isEmail = row.channel === 'email';
    const ok = await this.confirmation.confirm({
      title: 'Retry delivery?',
      message: isEmail
        ? `The email to ${row.recipient} will be sent again with every failed report from the same batch.`
        : `The ${this.typeLabels[row.sampleType].toLowerCase()} report for ${row.farmerName || 'this farmer'} will be sent again on WhatsApp to ${row.recipientDisplay}.`,
      confirmText: 'Retry now',
      confirmClass: 'btn-primary',
      icon: 'fas fa-redo'
    });
    if (!ok) return;

    this.retrying.add(row.id);
    this.deliveryService.retry(row.id).subscribe({
      next: () => {
        this.retrying.delete(row.id);
        this.toast.success('Retry started');
        setTimeout(() => this.loadAll(), 2500);
      },
      error: (err: HttpErrorResponse) => {
        this.retrying.delete(row.id);
        this.toast.error(err?.error?.error || 'Could not retry this delivery');
      }
    });
  }

  copy(value: string | null | undefined, label: string, event: Event): void {
    event.stopPropagation();
    if (!value) return;
    navigator.clipboard?.writeText(value).then(
      () => this.toast.success(`${label} copied`),
      () => this.toast.error(`Could not copy ${label.toLowerCase()}`)
    );
  }

  // ── auto refresh ──

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.autoRefresh ? this.startAutoRefresh() : this.stopAutoRefresh();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (!this.isLoading) {
        this.loadSummary();
        this.loadRows(true);
      }
    }, 30000);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  // ── display helpers ──

  statusCount(status: DeliveryStatus): number {
    return (this.summary?.byStatus as Record<string, number> | undefined)?.[status] ?? 0;
  }

  get reachedCount(): number {
    const s = this.summary?.byStatus;
    return s ? s.delivered + s.read : 0;
  }

  sourceLabel(source: string): string {
    return { api: 'System', webhook: 'WhatsApp', reconciler: 'Auto-retry', user: 'User' }[source] || source;
  }

  trackById(_: number, row: DeliveryRow): string {
    return row.id;
  }
}
