import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, catchError, map } from 'rxjs';
import { environment } from '../environments/environment';

/**
 * Entry in the CDN manifest, as written by scripts/generate-cdn-manifest.mjs.
 */
export interface CdnManifestEntry {
  size: number;
  sha256: string;
  contentType: string;
}

export type CdnManifest = Record<string, CdnManifestEntry>;

/**
 * Resolves CDN keys to absolute URLs served by media-service.
 *
 * Static media (marketing videos, large imagery) is no longer bundled into the web
 * build or the native app packages — it lives on the VPS and is streamed on demand.
 * A key is just the path under static-assets/, e.g. 'videos/home-about.mp4'.
 */
@Injectable({ providedIn: 'root' })
export class CdnService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.cdnUrl.replace(/\/+$/, '');
  private manifest$?: Observable<CdnManifest>;

  /**
   * Absolute URL for a CDN key.
   *
   * Bind this to a <video src> or <img src> — the browser issues Range requests
   * against it, so a 50 MB video starts playing after a few hundred KB instead of
   * downloading in full.
   *
   * Values that are already resolvable are returned untouched: absolute URLs, data
   * URIs, and bundled 'assets/...' paths. That is what lets the JSON data files hold
   * a mix of CDN keys and small still-bundled assets without a marker convention —
   * a bundled logo path passed through here keeps working.
   */
  url(key: string): string {
    if (!key) {
      return '';
    }
    if (/^(https?:)?\/\//i.test(key) || /^data:/i.test(key) || /^blob:/i.test(key)) {
      return key;
    }
    const normalized = key.replace(/^\/+/, '');
    if (normalized.startsWith('assets/')) {
      return normalized;
    }
    // Encode each segment so spaces and other unsafe characters in filenames survive,
    // while the slashes that define the key's path structure are preserved.
    const encoded = normalized.split('/').map(encodeURIComponent).join('/');
    return `${this.baseUrl}/${encoded}`;
  }

  /** Force a download rather than inline playback. */
  downloadUrl(key: string): string {
    return `${this.url(key)}?download=true`;
  }

  /**
   * The full asset inventory. Cached for the app's lifetime — useful for picking
   * among bitrate variants later without hardcoding which ones exist.
   */
  getManifest(): Observable<CdnManifest> {
    if (!this.manifest$) {
      this.manifest$ = this.http
        .get<CdnManifest>(`${this.baseUrl}-manifest`)
        .pipe(
          catchError(() => {
            // A missing manifest must not break rendering: url() works without it.
            console.warn('[CdnService] manifest unavailable, continuing without it');
            return of({} as CdnManifest);
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        );
    }
    return this.manifest$;
  }

  /** Whether a key is present in the manifest. */
  has(key: string): Observable<boolean> {
    return this.getManifest().pipe(map((manifest) => key in manifest));
  }
}
