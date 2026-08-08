# Android — Package & Publish to Play Store

Concise, end-to-end. The app is the Angular frontend wrapped by Capacitor.
Package ID: `com.shivagri.app` · App name: **Shiv Agri Consultancy**.

---

## 1. How do I package it?

The store upload format is an **AAB** (Android App Bundle). It must be **signed**
with *your* release key. One-time key setup, then a repeatable build.

### One-time: create a release keystore

```bash
cd frontend/android
keytool -genkey -v -keystore shiv-agri-release.jks \
  -keyalias shiv-agri -keyalg RSA -keysize 2048 -validity 10000
```

Then create `frontend/android/keystore.properties` from the template:

```bash
cp keystore.properties.example keystore.properties
# edit keystore.properties and fill in your passwords
```

> ⚠️ `shiv-agri-release.jks` and `keystore.properties` are git-ignored on
> purpose. **Back them up** (password manager / secure drive). Lose them and you
> can never update the app again.

### Build the signed bundle (locally)

```bash
cd frontend
npm install
npm run cap:sync              # ng build --configuration production + cap sync
cd android
./gradlew bundleRelease       # signed AAB (uses keystore.properties)
```

Output: `frontend/android/app/build/outputs/bundle/release/app-release.aab`

To test on a device/emulator instead, build an APK:
`./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.

---

## 2. What workflow do I run?

You can build **locally** (above) or in **CI** — the repo already has one:

**`.github/workflows/mobile-build.yml`** → job **“Android (APK + AAB)”**.

- **Trigger:** push a version tag (`git tag v1.0.0 && git push origin v1.0.0`)
  or run it manually from the Actions tab (“Run workflow”).
- **Output:** the `android-packages` artifact on the run — contains the debug
  APK and the release AAB. Download it from the run’s Artifacts section.

### Make CI produce a *signed* AAB

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i frontend/android/shiv-agri-release.jks` output |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `shiv-agri` |
| `ANDROID_KEY_PASSWORD` | key password |

macOS base64 for the first secret:

```bash
base64 -i frontend/android/shiv-agri-release.jks | pbcopy
```

With the secrets set, the workflow signs the AAB automatically. Without them, it
still builds — just unsigned (not uploadable).

### Before each release: bump the version

Edit `frontend/android/app/build.gradle` → `defaultConfig`:
- `versionCode` — **integer, must increase every upload** (1 → 2 → 3 …).
- `versionName` — human string shown to users (e.g. `"1.0.1"`).

---

## 3. Publish to the Play Store

### A. Accounts & one-time setup
1. **Google Play Developer account** — one-time **$25** at
   <https://play.google.com/console> (approval can take up to ~48h).
2. In Play Console → **Create app**: name *Shiv Agri Consultancy*, default
   language, App/Game = App, Free/Paid.
3. **Play App Signing:** accept it (default). You upload with *your* key; Google
   re-signs for distribution and holds the final key securely.

### B. Store listing (prepare these assets)
- **App icon:** 512×512 PNG (32-bit).
- **Feature graphic:** 1024×500 PNG/JPG.
- **Screenshots:** ≥2 phone screenshots (min 320px, 16:9 or 9:16). Grab them
  from an emulator: `npm run cap:android` → Android Studio → run → screenshot.
- **Short description** (≤80 chars) and **full description** (≤4000 chars).
- **App category** (e.g. Business / Productivity) and contact email.

### C. Required policy declarations
- **Privacy Policy URL** — mandatory. Host a page (e.g. on the existing site)
  describing what data the app collects (auth phone/OTP, any profile data).
- **Data safety form** — declare collected data (phone number, account info)
  and that it’s encrypted in transit.
- **Content rating** — fill the questionnaire.
- **Target audience**, **Ads** (declare none if none), **Government app** = no.

### D. Upload & release
1. Play Console → your app → **Release → Testing → Internal testing** (fastest,
   do this first to validate).
2. **Create new release** → upload `app-release.aab`.
3. Add release notes → **Review release** → **Start rollout to Internal testing**.
4. Add tester emails; install via the opt-in link on a real device and verify
   login + core flows against the **production** backend.
5. When happy: **Release → Production → Create new release** → reuse the same
   bundle (or a new build) → **Review** → **Start rollout to Production**.
6. First production submission goes through Google review (hours–days). After
   approval it’s live on the Play Store.

### E. Updating later
Bump `versionCode`/`versionName` → rebuild AAB → new release in the same track →
roll out. Same key every time (that’s why the backup matters).

---

## Quick reference

```bash
# Local signed build
cd frontend && npm install && npm run cap:sync
cd android && ./gradlew bundleRelease
# -> app/build/outputs/bundle/release/app-release.aab

# CI build
git tag v1.0.0 && git push origin v1.0.0   # or Actions -> Run workflow

# Reclaim disk when done
./clean.sh            # from repo root
```

Related: [MOBILE_APP_GUIDE.md](MOBILE_APP_GUIDE.md) (full Capacitor/dev details),
[GO_LIVE_AND_COSTS_GUIDE.md](GO_LIVE_AND_COSTS_GUIDE.md) (backend go-live & costs).
