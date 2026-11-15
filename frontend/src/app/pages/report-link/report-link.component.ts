import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { PublicReportInfo, ReportDeliveryService } from '../../services/report-delivery.service';
import { FileDeliveryService } from '../../services/file-delivery.service';

const ANDROID_PACKAGE = 'com.shivagri.app';
const DEFAULT_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

type Platform = 'native' | 'android' | 'ios' | 'desktop';

/**
 * Landing page for https://shivagri.com/r/<token> — the WhatsApp "View Report in App" button.
 *
 *  • App installed (Android App Links / iOS Universal Links verified): the OS opens the app
 *    straight on this route; we fetch the PDF and hand it to the system viewer.
 *  • App not installed / link opened in a browser: show the report summary with
 *    "Open in app" (Android intent → falls back to the Play Store), "View PDF" and "Download".
 *
 * No login required — the unguessable token is the credential (90-day expiry).
 */
@Component({
  selector: 'app-report-link',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-link.component.html',
  styleUrls: ['./report-link.component.css']
})
export class ReportLinkComponent implements OnInit, OnDestroy {
  token = '';
  report: PublicReportInfo | null = null;
  loading = true;
  errorTitle = '';
  errorMessage = '';
  opening = false;
  readonly platform: Platform = this.detectPlatform();

  private sub?: Subscription;
  private autoOpened = false;

  constructor(
    private route: ActivatedRoute,
    private deliveryService: ReportDeliveryService,
    private fileDelivery: FileDeliveryService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.sub = this.route.paramMap.subscribe((params) => {
      this.token = params.get('token') || '';
      this.autoOpened = false;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private load(): void {
    this.loading = true;
    this.report = null;
    this.errorTitle = '';
    this.errorMessage = '';

    this.deliveryService.getPublicReport(this.token).subscribe({
      next: (report) => {
        this.report = report;
        this.loading = false;
        if (this.platform === 'android') this.androidIntentUrl = this.buildAndroidIntentUrl();
        // Arrived via the app link inside the native app: open the PDF straight away.
        if (this.platform === 'native' && !this.autoOpened) {
          this.autoOpened = true;
          this.viewPdf();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        if (err.status === 410) {
          this.errorTitle = 'This link has expired';
          this.errorMessage = 'Report links stay active for 90 days. Please contact Shiv Agri for a fresh copy of your report.';
        } else if (err.status === 404 || err.status === 400) {
          this.errorTitle = 'Link not valid';
          this.errorMessage = 'This report link is incorrect or no longer available. Please check the message or contact Shiv Agri.';
        } else if (err.status === 429) {
          this.errorTitle = 'Please wait a moment';
          this.errorMessage = 'Too many attempts from this device. Try again in a few minutes.';
        } else {
          this.errorTitle = 'Could not load the report';
          this.errorMessage = 'Please check your internet connection and try again.';
        }
      }
    });
  }

  retry(): void {
    this.load();
  }

  get fileName(): string {
    const r = this.report;
    const parts = [r?.title || 'Lab Report', r?.sampleNumber, r?.farmerName].filter(Boolean);
    return `${parts.join(' - ')}.pdf`.replace(/[\\/:*?"<>|]+/g, '_');
  }

  get playStoreUrl(): string {
    return this.report?.appLinks?.android || DEFAULT_PLAY_STORE_URL;
  }

  get appStoreUrl(): string | null {
    return this.report?.appLinks?.ios || null;
  }

  get pdfUrl(): string {
    return this.deliveryService.publicPdfUrl(this.token);
  }

  get downloadUrl(): string {
    return this.deliveryService.publicPdfUrl(this.token, true);
  }

  /**
   * Android "intent:" URL: opens the installed app on this same route, or falls back to the
   * Play Store listing when it isn't installed. Works without App Links verification.
   */
  androidIntentUrl: SafeUrl | null = null;

  /** Built once per load — Angular's sanitizer would otherwise rewrite `intent:` to `unsafe:`. */
  private buildAndroidIntentUrl(): SafeUrl {
    const host = window.location.host;
    const url = `intent://${host}/r/${encodeURIComponent(this.token)}#Intent;scheme=https;package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(this.playStoreUrl)};end`;
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  /** Native: fetch and open in the OS viewer. Web: let the browser render the PDF in a tab. */
  viewPdf(): void {
    if (this.platform !== 'native') {
      window.open(this.pdfUrl, '_blank', 'noopener');
      return;
    }
    this.opening = true;
    this.deliveryService.getPublicReportPdf(this.token).subscribe({
      next: async (blob) => {
        try {
          await this.fileDelivery.open(blob, this.fileName, 'application/pdf');
        } finally {
          this.opening = false;
        }
      },
      error: () => {
        this.opening = false;
        this.errorTitle = 'Could not open the report';
        this.errorMessage = 'Please check your internet connection and try again.';
      }
    });
  }

  saveToDevice(): void {
    this.opening = true;
    this.deliveryService.getPublicReportPdf(this.token).subscribe({
      next: async (blob) => {
        try {
          await this.fileDelivery.download(blob, this.fileName, 'application/pdf');
        } finally {
          this.opening = false;
        }
      },
      error: () => (this.opening = false)
    });
  }

  private detectPlatform(): Platform {
    if (Capacitor.isNativePlatform()) return 'native';
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    return 'desktop';
  }
}
