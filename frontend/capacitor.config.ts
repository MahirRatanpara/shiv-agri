import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.shivagri.app',
  appName: 'Shiv Agri Consultancy',
  webDir: 'dist/frontend/browser',
  server: {
    // Serve the Android WebView from http://localhost so it can call a local
    // http backend during development without mixed-content blocking. http://localhost
    // is still a secure context, and production still calls the HTTPS API (auth uses
    // Bearer tokens, not cookies, so this has no security impact). Cleartext to the
    // dev backend hosts is scoped via android network_security_config.xml.
    androidScheme: 'http',
  },
  plugins: {
    SplashScreen: {
      // Show for 2s, then hide (we also call SplashScreen.hide() from app init).
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Dark text/icons on a light bar to match the app's light theme.
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      // Resize the web view so inputs stay visible above the keyboard.
      resize: KeyboardResize.Body,
    },
  },
};

export default config;
