import { Component, NgZone, OnInit, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { HeaderComponent } from './components/header/header';
import { ToastComponent } from './components/toast/toast.component';
import { ConfirmationModalComponent } from './components/confirmation-modal/confirmation-modal.component';
import { DownloadProgressComponent } from './components/download-progress/download-progress.component';
import { ForceUpdateComponent } from './components/force-update/force-update.component';
import { AppUpdateService } from './services/app-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, ToastComponent, ConfirmationModalComponent, DownloadProgressComponent, ForceUpdateComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('Shiv Agri Consultancy');
  private appUpdates = inject(AppUpdateService);
  private router = inject(Router);
  private zone = inject(NgZone);

  ngOnInit(): void {
    // Native-only setup. On web this is a no-op so the existing web build is unaffected.
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    this.initNative();
  }

  private async initNative(): Promise<void> {
    try {
      // Dark text/icons on a light status bar to match the app's light theme.
      await StatusBar.setStyle({ style: Style.Light });
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#ffffff' });
      }
    } catch {
      // StatusBar isn't available on every device/config; ignore gracefully.
    }

    // Android hardware/gesture back button: go back within the app, or exit at the root.
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });

    // App Links / Universal Links: https://shivagri.com/r/<token> (the WhatsApp
    // "View Report in App" button) opens the app — route to the in-app report viewer.
    CapacitorApp.addListener('appUrlOpen', ({ url }) => this.handleDeepLink(url));
    // Cold start from a link: the URL may arrive before the listener is attached.
    CapacitorApp.getLaunchUrl()
      .then((launch) => launch?.url && this.handleDeepLink(launch.url))
      .catch(() => { /* no launch URL */ });

    // Hide the splash once the app shell is ready.
    try {
      await SplashScreen.hide();
    } catch {
      // No-op if the splash screen was already hidden.
    }

    // Ask the backend whether this build is still allowed to run, and keep
    // re-checking on resume. Never throws — a failed check leaves the app usable
    // and the 426 interceptor backstop still applies.
    void this.appUpdates.init();
  }

  /** Only allow-listed in-app paths are honoured; anything else is ignored. */
  private handleDeepLink(rawUrl: string): void {
    try {
      const url = new URL(rawUrl);
      const match = url.pathname.match(/^\/r\/([A-Za-z0-9_-]{20,64})\/?$/);
      if (!match) return;
      this.zone.run(() => this.router.navigateByUrl(`/r/${match[1]}`));
    } catch {
      // Malformed URL — ignore.
    }
  }
}
