import { ColDef, GridApi, IRowNode } from 'ag-grid-community';
import { Subscription } from 'rxjs';
import {
  ChannelDeliveryStatus,
  DELIVERY_STATUS_META,
  DeliveryStatus,
  ReportDeliveryService,
  ReportSampleType,
  SampleDelivery
} from '../../services/report-delivery.service';

interface DeliveryRowData {
  _id?: string;
  delivery?: SampleDelivery | null;
}

const IN_FLIGHT: DeliveryStatus[] = ['queued', 'sent', 'delivered'];
const FAST_POLL_MS = 4000;
const SETTLE_POLL_MS = 20000;
const MAX_FAST_POLLS = 60; // ~4 minutes — bulk sends render PDFs one by one
const STATUS_CHUNK = 500;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const formatWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function describe(channel: 'WhatsApp' | 'Email', s?: ChannelDeliveryStatus): string {
  if (!s || s.status === 'not_sent') return `${channel}: not sent yet`;
  const parts = [`${channel}: ${DELIVERY_STATUS_META[s.status].label}`];
  if (s.recipient) parts.push(`to ${s.recipient.includes('@') ? s.recipient : '+' + s.recipient}`);
  if (s.lastSentAt) parts.push(`sent ${formatWhen(s.lastSentAt)}`);
  if ((s.sendCount || 0) > 1) parts.push(`${s.sendCount} sends`);
  if (s.status === 'failed' && s.lastError) parts.push(`— ${s.lastError}`);
  return parts.join(' · ');
}

/**
 * The "WhatsApp" column (status chip, email indicator, Preview & send button). Placed just
 * before the existing PDF/download column. Standalone so it can sit in a `colDefs` field
 * initializer without depending on constructor-injected services.
 */
export function buildDeliveryColumn(onPreview: (row: any) => void): ColDef {
  return {
    headerName: 'WhatsApp',
    colId: 'delivery',
    valueGetter: (p: any) => DELIVERY_STATUS_META[(p.data?.delivery?.whatsapp?.status as DeliveryStatus) || 'not_sent'].label,
    cellRenderer: (params: any) => renderDeliveryCell(params.data, onPreview),
    width: 250,
    minWidth: 230,
    pinned: 'right',
    sortable: false,
    filter: false,
    floatingFilter: false,
    editable: false,
    suppressHeaderMenuButton: true,
    cellClass: 'rd-cell-host'
  } as ColDef;
}

function renderDeliveryCell(data: DeliveryRowData | undefined, onPreview: (row: any) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rd-cell';
  const wa = data?.delivery?.whatsapp;
  const email = data?.delivery?.email;
  const status = (wa?.status as DeliveryStatus) || 'not_sent';
  const meta = DELIVERY_STATUS_META[status];

  const chip = document.createElement('span');
  chip.className = `rd-chip rd-chip--${meta.tone}`;
  chip.title = describe('WhatsApp', wa);
  chip.setAttribute('aria-label', chip.title);
  chip.innerHTML = `<i class="${meta.icon}" aria-hidden="true"></i>${escapeHtml(meta.label)}`;
  wrap.appendChild(chip);

  if (email && email.status !== 'not_sent') {
    const mail = document.createElement('i');
    const tone = email.status === 'failed' ? 'failed' : email.status === 'queued' ? '' : 'sent';
    mail.className = `fas fa-envelope rd-cell__email ${tone ? 'rd-cell__email--' + tone : ''}`;
    mail.title = describe('Email', email);
    mail.setAttribute('aria-label', mail.title);
    mail.setAttribute('role', 'img');
    wrap.appendChild(mail);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rd-cell__btn';
  btn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Preview &amp; send';
  if (!data?._id) {
    btn.disabled = true;
    btn.title = 'Save this row first';
  } else {
    btn.title = 'Preview the report and send it on WhatsApp or email';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPreview(data);
    });
  }
  wrap.appendChild(btn);
  return wrap;
}

/**
 * Keeps the testing grid's delivery column live: selection helpers, one-shot refresh of
 * in-flight statuses after rows load, and polling after a send.
 * One instance per page; call destroy() in ngOnDestroy.
 */
export class ReportDeliveryGridController {
  private tracked = new Set<string>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private fastPolls = 0;
  private inFlightRequest: Subscription | null = null;
  private destroyed = false;

  constructor(
    private readonly service: ReportDeliveryService,
    private readonly sampleType: ReportSampleType,
    private readonly getApi: () => GridApi | undefined,
    /** Called for every status update, e.g. to refresh an open preview modal. */
    private readonly onStatus?: (sampleId: string, delivery: SampleDelivery | null) => void
  ) {}

  /** Saved (persisted) sample ids of the selected rows; unsaved rows are ignored. */
  getSelectedSampleIds(): { ids: string[]; unsaved: number } {
    const rows = (this.getApi()?.getSelectedRows() || []) as DeliveryRowData[];
    const ids = rows.map((r) => r._id).filter((id): id is string => !!id);
    return { ids, unsaved: rows.length - ids.length };
  }

  /** Start watching freshly-sent samples until their status settles. */
  track(sampleIds: string[]): void {
    sampleIds.forEach((id) => this.tracked.add(id));
    this.fastPolls = 0;
    this.schedule(1500);
  }

  /**
   * One-shot freshen for rows just loaded into the grid whose WhatsApp status may have moved
   * on (sent → delivered → read) since they were last saved. Cheap: the backend only syncs
   * in-flight sends.
   */
  refreshInFlight(rows: DeliveryRowData[]): void {
    const ids = rows
      .filter((r) => r._id && (
        IN_FLIGHT.includes((r.delivery?.whatsapp?.status as DeliveryStatus) || 'not_sent') ||
        r.delivery?.email?.status === 'queued'
      ))
      .map((r) => r._id!);

    for (let i = 0; i < ids.length; i += STATUS_CHUNK) {
      const chunk = ids.slice(i, i + STATUS_CHUNK);
      this.service.getStatuses(this.sampleType, chunk).subscribe({
        next: (statuses) => {
          this.apply(statuses);
          // A send still in progress (e.g. started from another tab) — keep watching it.
          const queued = statuses
            .filter((s) => s.delivery?.whatsapp?.status === 'queued' || s.delivery?.email?.status === 'queued')
            .map((s) => s.sampleId);
          if (queued.length) this.track(queued);
        },
        error: () => { /* non-critical: chips keep their saved status */ }
      });
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.inFlightRequest?.unsubscribe();
    this.tracked.clear();
  }

  // ── internals ──

  private schedule(delay: number): void {
    if (this.destroyed) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.poll(), delay);
  }

  private poll(): void {
    if (this.destroyed || !this.tracked.size) return;
    this.inFlightRequest?.unsubscribe();
    const ids = [...this.tracked].slice(0, STATUS_CHUNK);

    this.inFlightRequest = this.service.getStatuses(this.sampleType, ids).subscribe({
      next: (statuses) => {
        this.apply(statuses);
        const stillQueued = statuses.filter(
          (s) => s.delivery?.whatsapp?.status === 'queued' || s.delivery?.email?.status === 'queued'
        );
        this.fastPolls++;
        if (stillQueued.length && this.fastPolls < MAX_FAST_POLLS) {
          this.schedule(FAST_POLL_MS);
        } else if (this.fastPolls < MAX_FAST_POLLS + 2) {
          // Everything left the queue — check twice more, slowly, to catch delivered/read.
          this.fastPolls = Math.max(this.fastPolls, MAX_FAST_POLLS);
          this.schedule(SETTLE_POLL_MS);
        } else {
          this.tracked.clear();
        }
      },
      error: () => this.schedule(SETTLE_POLL_MS)
    });
  }

  private apply(statuses: { sampleId: string; delivery: SampleDelivery | null }[]): void {
    const api = this.getApi();
    if (!api || !statuses.length) return;
    const byId = new Map(statuses.map((s) => [s.sampleId, s.delivery]));
    const nodes: IRowNode[] = [];

    api.forEachNode((node) => {
      const id = (node.data as DeliveryRowData | undefined)?._id;
      if (id && byId.has(id)) {
        (node.data as DeliveryRowData).delivery = byId.get(id) || null;
        nodes.push(node);
      }
    });
    if (nodes.length) api.refreshCells({ rowNodes: nodes, columns: ['delivery'], force: true });
    statuses.forEach((s) => this.onStatus?.(s.sampleId, s.delivery));
  }
}
