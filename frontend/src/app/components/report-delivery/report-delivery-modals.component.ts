import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import {
  DELIVERY_STATUS_META,
  DeliveryChannel,
  DeliveryStatus,
  PrecheckItem,
  PrecheckResult,
  ReportDeliveryService,
  ReportSampleType,
  SampleDelivery,
  SendResult
} from '../../services/report-delivery.service';
import { ToastService } from '../../services/toast.service';
import { FileDeliveryService } from '../../services/file-delivery.service';

/** Minimal row shape the modals need — every testing grid row satisfies it. */
export interface DeliveryPreviewRow {
  sampleId: string;
  sampleNumber?: string;
  farmerName?: string;
  farmsName?: string;
  mobileNo?: string;
  delivery?: SampleDelivery | null;
}

export interface ReportsSentEvent {
  channel: DeliveryChannel;
  sampleIds: string[];
  result: SendResult;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Send-confirmation dialog + report preview modal shared by the Soil, Water and Fertilizer
 * testing pages. The host page owns selection and grid state; this component owns the
 * precheck → confirm → send flow and emits `sent` so the page can poll statuses.
 *
 * ViewEncapsulation.None: its `rd-*` styles also style the status cells that AG Grid
 * renders outside Angular's view (see report-delivery-grid.ts).
 */
@Component({
  selector: 'app-report-delivery-modals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-delivery-modals.component.html',
  styleUrls: ['./report-delivery-modals.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class ReportDeliveryModalsComponent implements OnDestroy {
  @Input({ required: true }) sampleType!: ReportSampleType;
  /** Human label used in copy, e.g. "Soil", "Water", "Fertilizer". */
  @Input() typeLabel = 'Lab';
  /** Hides the send buttons in the preview when the user lacks the send permission. */
  @Input() canSend = true;
  @Output() sent = new EventEmitter<ReportsSentEvent>();

  @ViewChild('emailInput') emailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('sendDialog') sendDialog?: ElementRef<HTMLElement>;

  readonly statusMeta = DELIVERY_STATUS_META;

  // ── Send dialog state ──
  sendOpen = false;
  channel: DeliveryChannel = 'whatsapp';
  sampleIds: string[] = [];
  precheckLoading = false;
  precheck: PrecheckResult | null = null;
  precheckError = '';
  email = '';
  emailTouched = false;
  confirmResend = false;
  sending = false;
  sendError = '';
  private openedFromPreview = false;

  // ── Preview state ──
  previewOpen = false;
  previewRow: DeliveryPreviewRow | null = null;
  previewLoading = false;
  previewError = '';
  previewUrl: SafeResourceUrl | null = null;
  private previewObjectUrl: string | null = null;
  private previewBlob: Blob | null = null;
  /** Android/iOS WebViews can't render PDFs inline — hand them to the OS viewer instead. */
  readonly nativeViewer: boolean;

  constructor(
    private deliveryService: ReportDeliveryService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private fileDelivery: FileDeliveryService
  ) {
    this.nativeViewer = this.fileDelivery.needsNativeViewer;
  }

  ngOnDestroy(): void {
    this.revokePreviewUrl();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.sendOpen && !this.sending) this.closeSend();
    else if (this.previewOpen) this.closePreview();
  }

  // ════════════════════════ Send dialog ════════════════════════

  openSend(channel: DeliveryChannel, sampleIds: string[]): void {
    const ids = [...new Set(sampleIds.filter(Boolean))];
    if (!ids.length) {
      this.toast.warning('Save the selected rows first — unsaved rows cannot be sent.');
      return;
    }
    this.openedFromPreview = this.previewOpen;
    this.channel = channel;
    this.sampleIds = ids;
    this.precheck = null;
    this.precheckError = '';
    this.sendError = '';
    this.confirmResend = false;
    this.emailTouched = false;
    this.sending = false;
    if (channel === 'email') this.email = this.email || '';
    this.sendOpen = true;
    this.runPrecheck();
  }

  private runPrecheck(): void {
    this.precheckLoading = true;
    this.deliveryService.precheck(this.sampleType, this.sampleIds, this.channel).subscribe({
      next: (result) => {
        this.precheck = result;
        this.precheckLoading = false;
        if (this.channel === 'email') setTimeout(() => this.emailInput?.nativeElement.focus(), 50);
        else setTimeout(() => this.sendDialog?.nativeElement.focus(), 50);
      },
      error: (err: HttpErrorResponse) => {
        this.precheckLoading = false;
        this.precheckError = err?.error?.error || 'Could not check the selected reports. Please try again.';
      }
    });
  }

  closeSend(): void {
    this.sendOpen = false;
    this.precheck = null;
  }

  get isWhatsApp(): boolean {
    return this.channel === 'whatsapp';
  }

  get validItems(): PrecheckItem[] {
    return this.precheck?.items.filter((i) => i.valid) ?? [];
  }

  get invalidItems(): PrecheckItem[] {
    return this.precheck?.items.filter((i) => !i.valid) ?? [];
  }

  get resendItems(): PrecheckItem[] {
    return this.precheck?.items.filter((i) => i.valid && i.alreadySent) ?? [];
  }

  get emailValid(): boolean {
    return EMAIL_PATTERN.test(this.email.trim());
  }

  get sendCount(): number {
    return this.isWhatsApp ? this.validItems.length : (this.precheck?.items.length ?? 0);
  }

  get canConfirm(): boolean {
    if (!this.precheck || this.sending || this.sendCount === 0) return false;
    if (!this.isWhatsApp && !this.emailValid) return false;
    if (this.resendItems.length > 0 && !this.confirmResend) return false;
    return true;
  }

  get confirmLabel(): string {
    const n = this.sendCount;
    const noun = n === 1 ? 'report' : 'reports';
    if (this.resendItems.length && this.resendItems.length === n) {
      return this.isWhatsApp ? `Resend ${n} ${noun}` : `Resend ${n} ${noun} by email`;
    }
    return this.isWhatsApp ? `Send ${n} ${noun}` : `Email ${n} ${noun}`;
  }

  confirmSend(): void {
    this.emailTouched = true;
    if (!this.canConfirm) return;

    this.sending = true;
    this.sendError = '';
    const ids = this.isWhatsApp ? this.validItems.map((i) => i.sampleId) : this.precheck!.items.map((i) => i.sampleId);
    const confirmResend = this.resendItems.length > 0 && this.confirmResend;

    const request$ = this.isWhatsApp
      ? this.deliveryService.sendWhatsApp(this.sampleType, ids, confirmResend)
      : this.deliveryService.sendEmail(this.sampleType, ids, this.email.trim(), confirmResend);

    request$.subscribe({
      next: (res) => {
        this.sending = false;
        this.toast.success(res.message || 'Reports are being sent', 4000);
        this.sent.emit({ channel: this.channel, sampleIds: res.data.queued.map((q) => q.sampleId), result: res.data });
        this.closeSend();
        if (this.openedFromPreview) this.closePreview();
      },
      error: (err: HttpErrorResponse) => {
        this.sending = false;
        const body = err?.error || {};
        if (err.status === 409 && body.code === 'RESEND_CONFIRMATION_REQUIRED') {
          // Someone else sent these between precheck and confirm — refresh and ask again.
          this.confirmResend = false;
          this.sendError = body.error;
          this.runPrecheck();
          return;
        }
        this.sendError = body.error || 'Sending failed. Please check your connection and try again.';
      }
    });
  }

  // ════════════════════════ Preview modal ════════════════════════

  openPreview(row: DeliveryPreviewRow): void {
    if (!row?.sampleId) {
      this.toast.warning('Save this row first to preview the report.');
      return;
    }
    this.previewRow = row;
    this.previewOpen = true;
    this.previewError = '';
    this.revokePreviewUrl();
    this.previewLoading = true;

    this.deliveryService.previewPdf(this.sampleType, row.sampleId).subscribe({
      next: (blob) => {
        this.previewBlob = blob;
        this.previewObjectUrl = URL.createObjectURL(blob);
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl);
        this.previewLoading = false;
      },
      error: () => {
        this.previewLoading = false;
        this.previewError = 'Could not generate the report preview. Check that the row has test values and try again.';
      }
    });
  }

  /** Lets the host page refresh the status chip while the preview is open. */
  updatePreviewDelivery(sampleId: string, delivery: SampleDelivery | null): void {
    if (this.previewRow?.sampleId === sampleId) this.previewRow = { ...this.previewRow, delivery };
  }

  closePreview(): void {
    this.previewOpen = false;
    this.previewRow = null;
    this.revokePreviewUrl();
  }

  openPreviewInNewTab(): void {
    if (this.nativeViewer && this.previewBlob) {
      const name = `${this.typeLabel}_Report_${this.previewRow?.sampleNumber || ''}.pdf`;
      this.fileDelivery.open(this.previewBlob, name, 'application/pdf')
        .catch(() => this.toast.error('No PDF viewer found on this device'));
      return;
    }
    if (this.previewObjectUrl) window.open(this.previewObjectUrl, '_blank', 'noopener');
  }

  sendFromPreview(channel: DeliveryChannel): void {
    if (this.previewRow) this.openSend(channel, [this.previewRow.sampleId]);
  }

  private revokePreviewUrl(): void {
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
    this.previewUrl = null;
    this.previewBlob = null;
  }

  // ════════════════════════ Display helpers ════════════════════════

  statusOf(delivery: SampleDelivery | null | undefined, channel: DeliveryChannel): DeliveryStatus {
    return (delivery?.[channel]?.status as DeliveryStatus) || 'not_sent';
  }

  trackBySample(_: number, item: PrecheckItem): string {
    return item.sampleId;
  }
}
