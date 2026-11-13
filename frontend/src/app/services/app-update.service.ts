import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

/** What the backend says about this build. Mirrors GET /api/app/version. */
export interface AppUpdateInfo {
  updateRequired: boolean;
  updateAvailable: boolean;
  minVersionCode?: number;
  latestVersionCode?: number;
  latestVersionName?: string;
  updateUrl?: string;
  message?: string;
}

/**
 * Decides whether this native build is still allowed to run.
 *
 * Two independent triggers, because either one alone has a hole:
 *
 *  - `check()` asks GET /api/app/version at startup and whenever the app returns
 *    to the foreground. This is what shows the update screen promptly, including
 *    to a user who just sits on an already-open screen.
 *  - `blockFrom()` is called by the auth interceptor when ANY API call comes back
 *    426 Upgrade Required. This is the backstop: even if the policy changed while
 *    the app was open, the very next request puts the user on the update screen.
 *
 * On web this is inert — the browser always loads the current bundle.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private http = inject(HttpClient);

  /** Non-null while a mandatory update is outstanding. Drives the blocking overlay. */
  readonly blockingUpdate = signal<AppUpdateInfo | null>(null);

  /** The running build's versionCode, or null on web / if it can't be read. */
  private versionCode: number | null = null;
  private platform: string | null = null;
  private initialised = false;

  /** True on Android/iOS, where a stale installed build is actually possible. */
  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Read this build's identity and ask the backend about it. Safe to call more
   * than once; the Capacitor lookup only happens the first time.
   */
  async init(): Promise<void> {
    if (!this.isNative || this.initialised) return;
    this.initialised = true;

    try {
      const info = await CapacitorApp.getInfo();
      // On Android `build` is the versionCode; on iOS it's CFBundleVersion.
      this.versionCode = Number.parseInt(info.build, 10);
      this.platform = Capacitor.getPlatform();
    } catch {
      // Older/unsupported platform — leave the gate off rather than locking a
      // user out because we couldn't read a version number.
      return;
    }

    await this.check();

    // Re-check on resume so a policy change reaches users who never fully
    // restart the app.
    CapacitorApp.addListener('resume', () => {
      void this.check();
    });
  }

  /** Ask the backend whether this build is still acceptable. */
  async check(): Promise<void> {
    if (!this.isNative || this.versionCode === null || !this.platform) return;

    try {
      const info = await firstValueFrom(
        this.http.get<AppUpdateInfo>(`${environment.apiUrl}/app/version`, {
          params: { platform: this.platform, versionCode: String(this.versionCode) }
        })
      );
      if (info?.updateRequired) {
        this.blockingUpdate.set(info);
      }
    } catch {
      // Network failure must not block the app — the 426 backstop still covers
      // the case where the server genuinely wants this build gone.
    }
  }

  /**
   * Headers that identify this build to the API, for the auth interceptor.
   * Empty on web, and empty until `init()` has read the build info — the first
   * few requests of a cold start may go out unlabelled, which only means they
   * are treated as web traffic and pass the gate. The startup `check()` covers
   * that window.
   */
  getClientHeaders(): Record<string, string> {
    if (!this.isNative || this.versionCode === null || !this.platform) return {};
    return {
      'X-App-Platform': this.platform,
      'X-App-Version-Code': String(this.versionCode)
    };
  }

  /** Called by the auth interceptor on a 426 response. */
  blockFrom(payload: Partial<AppUpdateInfo> | null | undefined): void {
    this.blockingUpdate.set({
      updateRequired: true,
      updateAvailable: true,
      message: payload?.message,
      updateUrl: payload?.updateUrl,
      latestVersionName: payload?.latestVersionName,
      latestVersionCode: payload?.latestVersionCode,
      minVersionCode: payload?.minVersionCode
    });
  }

  /**
   * Send the user to the update. `_blank` is handled by the Capacitor bridge and
   * hands the URL to the system browser / Play Store app rather than loading it
   * inside the WebView.
   */
  openUpdate(): void {
    const url = this.blockingUpdate()?.updateUrl;
    if (!url) return;
    window.open(url, '_blank');
  }
}
