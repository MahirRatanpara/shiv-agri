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

### One-time: point your shell at JDK 21

AGP 8.13 compiles against Java 21. Android Studio's **Run ▶** works out of the box
because it uses its own bundled JDK — but running `./gradlew` from a terminal uses
whatever `JAVA_HOME` (or `java` on `PATH`) resolves to, which on a typical macOS
setup is JDK 17. That fails with:

```
> Task :capacitor-android:compileDebugJavaWithJavac FAILED
  Java compilation initialization error
      error: invalid source release: 21
```

Check what you have:

```bash
java -version && /usr/libexec/java_home -V
```

If nothing reports 21+, use the JDK bundled with Android Studio:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

Set it per-terminal (or prefix a single command with it) rather than in `~/.zshrc`
— exporting it globally switches *every* project on the machine to 21, which may
break ones pinned to 17. `frontend/scripts/run-android.sh` already does this
detection itself in `ensure_jdk21()`, so builds driven through that script need no
manual export; a bare `./gradlew` invocation does.

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

Note the signing difference: `assembleDebug` signs with the auto-generated debug
keystore (`~/.android/debug.keystore`), **not** your release key. Use
`./gradlew assembleRelease` / `installRelease` to exercise the release-signed path.
This matters for Google Sign-In — see §Google Sign-In certificates below.

### Smoke-test the debug build in Android Studio (before you ship)

The usual pre-release check: run a **debug** build on an emulator pointed at the
**production** API, so you can validate real flows before uploading anything.

Two different things get called "production" here, so be precise about what Run ▶
actually gives you:

| Layer | What Run ▶ produces |
|---|---|
| Web assets | Whatever `cap sync` last copied — **production** (`https://shivagri.com/api`) unless you synced with `--dev` |
| Build type | `debug`, signed with `~/.android/debug.keystore` — **never** your release key |

**Steps**

1. Sync the production web build and open the project — the Gradle root is
   `frontend/android`, not the repo root:
   ```bash
   cd frontend
   npm run cap:sync            # ng build --configuration production + cap sync
   npx cap open android
   ```
2. Wait for **Gradle sync** to finish (first run takes a few minutes).
3. Toolbar: select run configuration **app**, then pick your emulator from the
   device dropdown. Create one in **Device Manager** if the list is empty.
4. Press **▶ Run** (`Ctrl+R`). Studio builds, installs and launches.

**The one gotcha:** Studio builds only the *native* project — it does **not**
rebuild your Angular code. Editing anything under `src/` and pressing Run ▶
reinstalls stale web assets. Re-run `npm run cap:sync` first, every time.
`./scripts/run-android.sh` does the build, sync and IDE open in one step.

**No `JAVA_HOME` setup needed for Run ▶** — Studio uses its bundled JDK 21. The
export above is only for invoking `./gradlew` from a terminal.

**Equivalent from the terminal**, skipping the IDE:

```bash
cd frontend && npx ng build --configuration production && npx cap sync android
cd android && ./gradlew installDebug
adb shell monkey -p com.shivagri.app -c android.intent.category.LAUNCHER 1
```

**Verify what you're actually running** — which API the bundle targets, and which
certificate signed it:

```bash
grep -o 'apiUrl:"[^"]*"' frontend/android/app/src/main/assets/public/main-*.js
apksigner verify --print-certs \
  frontend/android/app/build/outputs/apk/debug/app-debug.apk | grep SHA-1
```

**Debugging:** with the app running, open `chrome://inspect/#devices` in desktop
Chrome and click **inspect** under `com.shivagri.app` for full DevTools (console,
network, storage) against the WebView. Login failures are far more specific there
than in the UI. `adb logcat` covers the native side.

> ⚠️ A debug-signed build exercises the **debug** SHA-1 OAuth client. Google login
> passing here does *not* prove it works for Play Store users, who run the app
> signing certificate — see §Google Sign-In certificates below. Test an
> `installRelease` build before rollout.

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

## Google Sign-In certificates

Native Google Sign-In on Android goes through **Credential Manager**, which only
issues a token if Google Cloud has an **Android OAuth client** registered for
package `com.shivagri.app` **plus the SHA-1 of the certificate that signed the
running app**. Each Android OAuth client holds exactly one package + one SHA-1, so
you need one client per signing certificate.

Get the fingerprints:

```bash
# Debug cert — signs everything Android Studio Run ▶ / assembleDebug installs
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android | grep 'SHA1:'

# Release cert — the keystore referenced by android/keystore.properties
keytool -list -v -keystore <storeFile> -alias <keyAlias> | grep 'SHA1:'
```

Register each in Google Cloud Console → **APIs & Services → Credentials → Create
Credentials → OAuth client ID → Android** (same project as the web client in
`environment.prod.ts`). Paste the SHA-1 exactly as `keytool` prints it: uppercase,
colon-separated, SHA-1 not SHA-256.

Which certificates you need depends on Play App Signing:

| Certificate | Signs | Needed for |
|---|---|---|
| Debug | Run ▶ / `assembleDebug` builds | Local development |
| Upload key (`keystore.properties`) | The AAB you upload | Local release builds, uploads |
| Play app signing key | What Play delivers to users | **Every Play Store install** |

Find the last one in Play Console → **Test and release → Setup → App integrity →
App signing → App signing key certificate**. If Google generated its own key at
enrollment it will differ from your upload key and needs its own OAuth client. If
you enrolled by supplying your existing key, the two fingerprints match and one
client covers both.

> ⚠️ Registering only the debug fingerprint is the classic trap: sign-in works
> perfectly on your machine and is broken for every Play Store user. Register the
> **app signing** fingerprint before shipping.

You never reference these Android client IDs in app code — the app keeps sending
`environment.googleClientId` (the *web* client) as `webClientId`. The Android
clients exist purely so Google recognises the app. New clients can take a few
minutes to propagate.

Related backend requirement: the API must allow the WebView's origins
(`http://localhost`, `capacitor://localhost`) in CORS, or the login request is
blocked after Google returns a valid token. See `backend/src/server.js`.

---

## Quick reference

```bash
# JDK 21 required for a bare ./gradlew (Studio Run ▶ handles this itself)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

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
