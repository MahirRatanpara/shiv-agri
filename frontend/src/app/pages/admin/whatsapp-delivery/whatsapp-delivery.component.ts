import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WhatsappDeliveryService,
  DeliveryMessage,
  DeliverySummary
} from '../../../services/whatsapp-delivery.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-whatsapp-delivery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-delivery.component.html',
  styleUrls: ['./whatsapp-delivery.component.css']
})
export class WhatsappDeliveryComponent implements OnInit, OnDestroy {
  summary: DeliverySummary | null = null;
  messages: DeliveryMessage[] = [];

  isLoading = false;
  isSummaryLoading = false;
  loadError = '';

  // Filters
  selectedStatus = '';
  searchQuery = '';
  readonly statusOptions = ['sent', 'delivered', 'read', 'failed'];

  // Server-side pagination
  currentPage = 1;
  pageSize = 25;
  totalPages = 1;
  totalMessages = 0;

  // Row expansion for the transition trail
  expandedWamid: string | null = null;

  autoRefresh = true;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private deliveryService: WhatsappDeliveryService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadAll();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  loadAll(): void {
    this.loadSummary();
    this.loadMessages();
  }

  loadSummary(): void {
    this.isSummaryLoading = true;
    this.deliveryService.getSummary().subscribe({
      next: (summary) => {
        this.summary = summary;
        this.isSummaryLoading = false;
      },
      error: (err) => {
        this.isSummaryLoading = false;
        this.loadError = err?.error?.detail || 'Could not load delivery summary';
      }
    });
  }

  loadMessages(): void {
    this.isLoading = true;
    this.loadError = '';
    this.deliveryService
      .getMessages({
        page: this.currentPage,
        limit: this.pageSize,
        status: this.selectedStatus || undefined,
        search: this.searchQuery.trim() || undefined
      })
      .subscribe({
        next: (page) => {
          this.messages = page.messages || [];
          this.totalMessages = page.total;
          this.totalPages = Math.max(page.pages, 1);
          this.isLoading = false;
        },
        error: (err) => {
          this.isLoading = false;
          this.messages = [];
          this.loadError = err?.error?.detail || 'Could not load delivery activity';
        }
      });
  }

  // -- filters -------------------------------------------------------------

  onStatusChange(status: string): void {
    this.selectedStatus = status;
    this.currentPage = 1;
    this.loadMessages();
  }

  onSearchChange(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.currentPage = 1;
      this.loadMessages();
    }, 350);
  }

  clearFilters(): void {
    this.selectedStatus = '';
    this.searchQuery = '';
    this.currentPage = 1;
    this.loadMessages();
  }

  // -- pagination ----------------------------------------------------------

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.expandedWamid = null;
    this.loadMessages();
  }

  get pageNumbers(): number[] {
    // A short sliding window keeps the control usable once history grows large.
    const window = 5;
    let start = Math.max(1, this.currentPage - Math.floor(window / 2));
    const end = Math.min(this.totalPages, start + window - 1);
    start = Math.max(1, end - window + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  get rangeStart(): number {
    return this.totalMessages === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalMessages);
  }

  // -- row detail ----------------------------------------------------------

  toggleRow(wamid: string): void {
    this.expandedWamid = this.expandedWamid === wamid ? null : wamid;
  }

  copyWamid(wamid: string, event: Event): void {
    event.stopPropagation();
    navigator.clipboard?.writeText(wamid).then(
      () => this.toast.success('Message ID copied'),
      () => this.toast.error('Could not copy message ID')
    );
  }

  // -- auto refresh --------------------------------------------------------

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.autoRefresh ? this.startAutoRefresh() : this.stopAutoRefresh();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    // Statuses trickle in over seconds-to-minutes after a send, so a slow poll is enough.
    this.refreshTimer = setInterval(() => {
      if (!this.isLoading) this.loadAll();
    }, 30000);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // -- display helpers -----------------------------------------------------

  statusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'read':
      case 'delivered':
        return 'badge-success';
      case 'sent':
        return 'badge-pending';
      case 'failed':
        return 'badge-failed';
      default:
        return 'badge-unknown';
    }
  }

  maskRecipient(recipient?: string): string {
    if (!recipient) return '—';
    return recipient.length <= 4 ? recipient : `••••••${recipient.slice(-4)}`;
  }

  get healthLabel(): string {
    if (!this.summary || this.summary.totalTracked === 0) return 'No data yet';
    const rate = this.summary.deliveryRatePercent;
    if (rate >= 95) return 'Healthy';
    if (rate >= 80) return 'Degraded';
    return 'Critical';
  }

  get healthClass(): string {
    const label = this.healthLabel;
    if (label === 'Healthy') return 'health-good';
    if (label === 'Degraded') return 'health-warn';
    if (label === 'Critical') return 'health-bad';
    return 'health-idle';
  }
}
