import { Capacitor } from '@capacitor/core';

// Native LOCAL development build: points the app at a backend running on your
// dev machine. Used only by `npm run cap:android:dev` / `cap:ios:dev`
// (Angular "native-dev" configuration). Web dev (ng serve) still uses
// environment.ts, and release builds use environment.prod.ts.
//
// - Android emulator reaches the host machine's localhost via 10.0.2.2.
// - iOS simulator shares the host network, so localhost works directly.
const localHost = Capacitor.getPlatform() === 'android' ? '10.0.2.2' : 'localhost';

export const environment = {
  production: false,
  apiUrl: `http://${localHost}:3000/api`,
  cdnUrl: `http://${localHost}:8081/api/v1/cdn`,
  googleClientId: '965745303258-9t1i0v8rh9j25ecbhk1ft6l5jk8q1nv1.apps.googleusercontent.com',
  googleIosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com'
};
