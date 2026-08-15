import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';

/**
 * Single place that turns a fetched Blob into something the user can actually
 * see or keep, on both the website and the native apps.
 *
 * Why this exists: the web idiom — `URL.createObjectURL(blob)` + a click on an
 * `<a download>` — is inert inside a Capacitor WebView. Android's WebView has no
 * download manager, ignores the `download` attribute, and cannot navigate to a
 * `blob:` URL; it also ships no PDF renderer, so an `<iframe src="....pdf">`
 * paints a blank white box with no error. Both failures are silent, which is why
 * "view" and "download" appeared to do nothing in the app.
 *
 * Native path: write the bytes to a real file, then hand the path to the OS so
 * the user's own PDF/image/video viewer opens it. From there the system viewer
 * provides its own share/save actions.
 *
 * Web path: unchanged anchor-click behaviour.
 */
@Injectable({ providedIn: 'root' })
export class FileDeliveryService {
  private readonly isNative = Capacitor.isNativePlatform();

  /** True when previews must be delegated to the OS rather than embedded. */
  get needsNativeViewer(): boolean {
    return this.isNative;
  }

  /**
   * Show the file to the user. On web this opens a blob URL in a new tab; on
   * native it writes the file and launches the system viewer.
   */
  async open(blob: Blob, fileName: string, mimeType?: string): Promise<void> {
    const safeName = this.sanitizeFileName(fileName);
    const type = mimeType || blob.type || this.guessMimeType(safeName);

    if (!this.isNative) {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Revoke late — revoking immediately can cancel the pending tab load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }

    const uri = await this.writeToCache(blob, safeName);
    await FileOpener.open({ filePath: uri, contentType: type });
  }

  /**
   * Persist the file for the user. On web this triggers the normal browser
   * download; on native it writes to the app's Documents directory and then
   * opens it, so the system viewer's "save"/"share" actions take over.
   *
   * Returns the on-device path when native, or null on web.
   */
  async download(blob: Blob, fileName: string, mimeType?: string): Promise<string | null> {
    const safeName = this.sanitizeFileName(fileName);
    const type = mimeType || blob.type || this.guessMimeType(safeName);

    if (!this.isNative) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return null;
    }

    const base64 = await this.blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: safeName,
      data: base64,
      directory: Directory.Documents,
      recursive: true
    });

    // Opening after writing is what makes the file reachable for most users —
    // the app-scoped Documents dir is awkward to browse to by hand.
    try {
      await FileOpener.open({ filePath: written.uri, contentType: type });
    } catch {
      // Viewer missing for this type: the file is still saved, so don't fail.
    }
    return written.uri;
  }

  /** Fetch a remote URL as a Blob so it can be routed through open()/download(). */
  async fetchAsBlob(url: string): Promise<Blob> {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch file (${response.status})`);
    }
    return response.blob();
  }

  private async writeToCache(blob: Blob, fileName: string): Promise<string> {
    const base64 = await this.blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
      recursive: true
    });
    return written.uri;
  }

  /**
   * Filesystem.writeFile expects base64 without the data-URL prefix. FileReader
   * is used rather than a manual byte loop so large PDFs don't blow the stack.
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Could not read file data'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(blob);
    });
  }

  /** Strip path separators and characters Android/iOS reject in file names. */
  private sanitizeFileName(fileName: string): string {
    const cleaned = (fileName || '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'download';
  }

  private guessMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      case 'gif': return 'image/gif';
      case 'mp4': return 'video/mp4';
      case 'mov': return 'video/quicktime';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'csv': return 'text/csv';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default: return 'application/octet-stream';
    }
  }
}
