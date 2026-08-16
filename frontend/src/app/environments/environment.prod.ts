export const environment = {
  production: true,
  apiUrl: 'https://shivagri.com/api',
  // Static CDN served by media-service behind nginx. Absolute URL on purpose: the
  // native apps load from capacitor://localhost and must reach the real host.
  cdnUrl: 'https://shivagri.com/api/v1/cdn',
  // Web/"server" OAuth client ID. Used by web GSI, and as webClientId +
  // iOSServerClientId for native sign-in so the ID token's audience matches
  // what the backend (/auth/google) verifies against.
  googleClientId: '965745303258-9t1i0v8rh9j25ecbhk1ft6l5jk8q1nv1.apps.googleusercontent.com',
  // iOS OAuth client ID (type "iOS", bundle com.shivagri.app). Required only for
  // native iOS Google Sign-In. Create it in Google Cloud Console and paste it here.
  // Android does NOT use this — it uses googleClientId (see MOBILE_APP_GUIDE.md §Google login).
  googleIosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com'
};
