import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { HeaderComponent } from './components/header/header';
import { ToastComponent } from './components/toast/toast.component';
import { ConfirmationModalComponent } from './components/confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, ToastComponent, ConfirmationModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('Shiv Agri Consultancy');

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

    // Hide the splash once the app shell is ready.
    try {
      await SplashScreen.hide();
    } catch {
      // No-op if the splash screen was already hidden.
    }
  }
}
