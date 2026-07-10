import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.shivagri.app',
  appName: 'Shiv Agri Consultancy',
  webDir: 'dist/frontend/browser',
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
