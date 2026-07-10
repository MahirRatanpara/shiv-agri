# Shiv Agri — Mobile App (Capacitor) Guide

This document explains **what we added**, **why**, and **exactly how to build, run, and test**
the app on an iOS Simulator and an Android Emulator.

> TL;DR — the same Angular app now ships three ways: the existing **website**, an **iOS app**,
> and an **Android app**. The Node.js backend is unchanged. Nothing about the existing web
> build or deployment was modified in a breaking way — everything here is additive.

---

## 1. What we did and why

### The goal
Ship the existing Angular frontend as **native iOS and Android apps** in addition to the web
deployment, **without forking the codebase** and **without touching the Node backend**.

### The tool: Capacitor
[Capacitor](https://capacitorjs.com) (by the Ionic team) wraps a normal web build in a thin
native shell. It:
- Loads our compiled Angular app (`dist/frontend/browser`) inside a native WebView.
- Exposes native device features (status bar, splash screen, keyboard, hardware back button)
  through JS plugins.
- Produces real Xcode and Android Studio projects we can build, sign, and submit to the stores.

We chose **plain Capacitor (no Ionic UI framework)** because the app already has its own
styling (Bootstrap + custom CSS). We only need the native bridge, not Ionic's components.

### How one codebase serves three targets

```
                         ┌───────────────────────────┐
                         │   Angular source (src/)    │
                         └─────────────┬─────────────┘
                                       │  ng build
                                       ▼
                         dist/frontend/browser/  (static web app)
                          │                 │
             ┌────────────┘                 └───────────────┐
             ▼                                               ▼
     Web hosting (existing)                        npx cap sync  (copies build
     — nginx / your deploy                          into ios/ and android/)
                                                     │              │
                                                     ▼              ▼
                                                 Xcode          Android Studio
                                                 → iOS app      → Android app
```

The web build is the single source of truth. `cap sync` just copies that build into the
native projects — it never changes how the website is built or deployed.

### Files added / changed (all additive)

| File | Change |
|------|--------|
| `frontend/capacitor.config.ts` | **New.** App ID `com.shivagri.app`, name, `webDir`, plugin defaults. |
| `frontend/ios/`, `frontend/android/` | **New.** Generated native projects (committed to git). |
| `frontend/package.json` | Added Capacitor deps + `cap:sync` / `cap:ios` / `cap:android` scripts. |
| `frontend/src/app/app.ts` | Native-only init (status bar, splash hide, Android back button). No-op on web. |
| `frontend/src/app/app.css` | `env(safe-area-inset-*)` padding so content clears the notch/home indicator. |
| `frontend/src/index.html` | `viewport-fit=cover`; loads local fonts + prettyPhoto CSS. |
| `frontend/angular.json` | Added vendored `fonts.css` + `owl.carousel.min.css` to the styles list. |
| `frontend/src/assets/fonts/` | **New.** Vendored Google Fonts (see §6). |
| `frontend/src/assets/css/prettyPhoto.min.css` + `assets/images/prettyPhoto/` | **New.** Vendored lightbox assets. |
| `frontend/src/assets/css/custom.css`, `.../invoices/invoices.css` | Removed Google Fonts `@import`s (now local). |

Key config values (in `capacitor.config.ts`):
- **App ID / bundle id:** `com.shivagri.app`
- **App name:** `Shiv Agri Consultancy`
- **webDir:** `dist/frontend/browser` (Angular 20 nests the browser build here)

---

## 2. How the app talks to the backend on a device

Native apps **cannot** use relative URLs or `localhost` — those resolve to the phone itself.

Our npm scripts build with **`--configuration production`**, which uses
`src/app/environments/environment.prod.ts`:

```ts
apiUrl: 'https://shivagri.com/api'   // absolute HTTPS — works on device
```

So the native apps automatically talk to the live API over HTTPS. The `localhost:3000` dev URL
(`environment.ts`) is only ever used by `ng serve` in a browser and is **never** shipped to a device.

> To point the mobile apps at a different API later (e.g. a staging host), change the URL in
> `environment.prod.ts`, or introduce a dedicated `environment.native.ts` + build configuration.

---

## 3. Native plugins we wired up

| Plugin | What it does here |
|--------|-------------------|
| `@capacitor/status-bar` | Dark icons on a white status bar (matches the light theme). |
| `@capacitor/splash-screen` | Shows for ~2s on launch, then hides once the app is ready. |
| `@capacitor/app` | Handles the **Android hardware/gesture back button** (go back, or exit at root). |
| `@capacitor/keyboard` | Resizes the WebView so inputs stay visible above the keyboard. |

All native code runs behind `Capacitor.isNativePlatform()` in `app.ts`, so **the web build's
runtime behavior is unchanged**.

Safe-area handling (`app.css`) uses `env(safe-area-inset-*)`, which resolves to `0` on the web
and to the real notch/home-indicator insets on device — again, no web impact.

---

## 4. One-time setup per machine

### iOS (macOS only)
1. Install **Xcode** from the App Store.
2. Install command line tools: `xcode-select --install`
3. Open Xcode once to accept the license and let it install components.
4. (Simulator only needs the above. A **physical device** additionally needs a free Apple ID
   set as the signing team in Xcode → target **App** → *Signing & Capabilities*.)

> We use Swift Package Manager (no CocoaPods), so there is no `pod install` step.

### Android
1. Install **Android Studio**.
2. First launch → **More Actions → SDK Manager**: install an **Android SDK Platform** (API 34+)
   and **Android SDK Build-Tools**.
3. **More Actions → Virtual Device Manager** → create an emulator (e.g. Pixel 7, API 34).
4. Ensure a **JDK 17+** is available (Android Studio bundles one).

---

## 5. Building & running

Run all commands from the **`frontend/`** directory.

### The everyday loop
Whenever you change app code, rebuild + copy into the native projects:

```bash
npm run cap:sync        # ng build (production) + copy into ios/ and android/
```

Then run from the IDE (below). `cap:ios` and `cap:android` do the sync **and** open the IDE
for you in one step.

### ▶ iOS Simulator

**Easiest:**
```bash
cd frontend
npm run cap:ios         # builds, syncs, opens Xcode
```
In Xcode:
1. Top toolbar: select the **App** scheme and a simulator (e.g. *iPhone 15*).
2. Press **▶ Run** (Cmd+R). The simulator boots and launches the app.

**Fully from the terminal (no clicking):**
```bash
cd frontend
npm run build           # or: npx ng build
npx cap sync ios
npx cap run ios         # pick a simulator from the list; it builds & launches
```

### ▶ Android Emulator

**Easiest:**
```bash
cd frontend
npm run cap:android     # builds, syncs, opens Android Studio
```
In Android Studio:
1. Wait for the Gradle sync to finish (first time takes a few minutes).
2. Top toolbar: pick your emulator (e.g. *Pixel 7 API 34*).
3. Press **▶ Run** (Ctrl+R). The emulator boots and launches the app.

**Fully from the terminal (no clicking):**
```bash
cd frontend
npm run build
npx cap sync android
npx cap run android     # pick an emulator from the list; it builds & launches
```

---

## 6. Offline assets — why we vendored fonts & CSS

A native app has no guaranteed internet on first paint, and CDNs may be blocked. We moved every
externally-loaded style/font into the app bundle so it renders identically offline:

- **Google Fonts** (Roboto, Roboto Slab, Roboto Condensed, Poppins, Lato, Noto Sans,
  Noto Sans Gujarati) → downloaded `woff2` files in `src/assets/fonts/google/`, declared in
  `src/assets/fonts/fonts.css`. The 5 `@import`s in `custom.css` and the Noto `@import` in
  `invoices.css` were removed.
- **Owl Carousel CSS** → local `src/assets/css/owl.carousel.min.css` (bundled via `angular.json`).
- **prettyPhoto lightbox** → local `prettyPhoto.min.css` + 32 theme images under
  `src/assets/images/prettyPhoto/`. It's loaded as a **static asset** (via `index.html`) rather
  than bundled, because its images share filenames across theme folders and would collide under
  Angular's flat asset output. This produces one harmless build note:
  `WARNING: Unable to locate stylesheet: /assets/css/prettyPhoto.min.css` — the file **is**
  copied and served correctly; the warning is only that Angular didn't fingerprint it.

**Verified:** loading the app produces **zero** requests to `fonts.googleapis.com`,
`fonts.gstatic.com`, or `cdnjs.cloudflare.com`. Fonts load from local `/media/*.woff2`.

> Note: Google **Sign-In** (`accounts.google.com`) is a live API call, not an asset — it still
> requires internet, which is expected for authentication.

---

## 7. Expected build output

`npm run build` finishes with **three known, pre-existing/benign warnings**:
1. `bundle initial exceeded maximum budget` — pre-existing; the app bundle is large.
2. `Module 'regenerator-runtime/runtime' … is not ESM` — pre-existing.
3. `Unable to locate stylesheet: /assets/css/prettyPhoto.min.css` — expected (see §6).

None are errors. The build succeeds and `cap sync` copies it into both native projects.

---

## 8. Troubleshooting

| Symptom | Fix |
|--------|-----|
| App shows a white screen | You didn't build before syncing. Run `npm run cap:sync`. |
| Old content after code changes | You must rebuild + sync every time: `npm run cap:sync`, then re-run in the IDE. |
| API calls fail on device | Confirm `environment.prod.ts` `apiUrl` is a reachable HTTPS URL and the API is up. |
| Android "SDK location not found" | Open the project in Android Studio once so it writes `local.properties`. |
| iOS won't run on a physical device | Set a signing team in Xcode → App target → *Signing & Capabilities*. |
| Gradle/Xcode changes after `npm install` | Re-run `npx cap sync` to update native plugin registrations. |

---

## 9. Command cheat-sheet

```bash
# from frontend/
npm run build          # production web build (dist/frontend/browser)
npm run cap:sync       # build + copy into ios/ and android/
npm run cap:ios        # build + sync + open Xcode
npm run cap:android    # build + sync + open Android Studio

npx cap run ios        # build + launch on a chosen simulator (terminal only)
npx cap run android    # build + launch on a chosen emulator (terminal only)
npx cap doctor         # sanity-check the Capacitor setup
```
