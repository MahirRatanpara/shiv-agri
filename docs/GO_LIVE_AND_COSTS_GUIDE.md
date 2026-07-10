# Shiv Agri — Go-Live & Costs Guide (Web · iOS · Android)

How we take each of the three applications **live**, the **challenges** to expect, and the
**money required in India** to run it.

This guide assumes the codebase state after Capacitor was added (see
[`MOBILE_APP_GUIDE.md`](MOBILE_APP_GUIDE.md)). It complements — does not replace — the existing
web infrastructure doc [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md).

> **The single most important thing to know before you start:**
> The app signs users in with **Google Sign-In** and is a **WebView wrapper** around the Angular
> site. Both facts create real App Store / Play Store review risk (Apple Guidelines **4.8** and
> **4.2**). Read [§4 Challenges](#4-challenges-to-expect) *before* you build store assets, or you
> will likely get rejected and lose 1–2 weeks. This is not optional reading.

---

## 0. The three deliverables at a glance

| App | Artifact | Where it goes live | Who controls the release |
|-----|----------|--------------------|--------------------------|
| **Web** | Docker images (`frontend`, `api`, `nginx`) | `https://shivagri.com` on the Hostinger VPS | You — `git push` triggers CI/CD |
| **Android** | `.aab` (Android App Bundle) | Google **Play Store** | Google review (hours–days) |
| **iOS** | `.ipa` | Apple **App Store** | Apple review (usually 24–48h) |

All three serve the **same Angular code**. The backend API is shared and unchanged.

---

## 1. Deploying the Web app (summary)

This is already live and fully documented in [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md).
In short:

1. Push to `main` → **GitHub Actions** builds Docker images and pushes them to **Docker Hub**.
2. The workflow SSHes into the **Hostinger VPS** and runs `docker compose -f docker-compose.prod.yml up -d`.
3. **nginx** serves the frontend and reverse-proxies `/api` to the Node container.
4. **certbot** keeps the Let's Encrypt TLS certificate renewed.

**Nothing about this changed when we added Capacitor.** The mobile apps consume the same
`https://shivagri.com/api`, so keeping the web/API healthy automatically keeps the mobile apps
working. Making a web change live = `git push origin main`.

> Because the mobile apps depend on this API, treat the API as **production-critical for three
> clients now**, not one. A breaking API change can break shipped app versions that users can't
> instantly update.

---

## 2. Deploying the Android app (Google Play)

### 2.1 One-time account setup
1. Create a **Google Play Console** account → pay the **one-time $25** fee.
2. For an organization account, complete **identity + D-U-N-S / business verification**
   (Google now requires verified org details; can take a few days).
3. Set up the **payments profile** (needed even for free apps to accept the agreement).

### 2.2 Prepare the release build
Play requires an **Android App Bundle (`.aab`)**, signed, in **release** mode.

```bash
cd frontend
npm run build                 # production web build
npx cap sync android
npx cap open android          # opens Android Studio
```
In Android Studio:
1. **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. Create (once) an **upload keystore** — a `.jks` file + passwords.
   **Back this up securely; losing it means you can't update the app** (unless you enrolled in
   Play App Signing key reset).
3. Set `versionCode` (integer, must increase every upload) and `versionName` (e.g. `1.0.0`)
   in `android/app/build.gradle`.
4. Build → you get `app-release.aab`.

> **Play App Signing:** Google re-signs the app with a key it manages; your keystore is only the
> *upload* key. Keep both concepts in mind when rotating keys.

### 2.3 First submission
1. Play Console → **Create app** → fill store listing (title, short/long description, icon
   512×512, feature graphic 1024×500, phone + tablet screenshots).
2. Complete the mandatory questionnaires:
   - **Data safety** form (what data you collect — you collect account info via Google login,
     usage data, uploads).
   - **Content rating** questionnaire.
   - **Target audience**, **Ads** declaration, **Privacy Policy URL** (required — host one on
     `shivagri.com/privacy`).
3. Upload the `.aab` to a track:
   - **Internal testing** (fastest, up to 100 testers) → recommended first.
   - **Closed / Open testing** → **Production**.
4. Roll out. First production review can take a few hours to a few days.

### 2.4 Updates
Bump `versionCode`, rebuild the `.aab`, upload to the track, roll out. Users auto-update.

---

## 3. Deploying the iOS app (Apple App Store)

> **Hard requirement: you need a Mac.** Xcode (build, sign, upload) is macOS-only. If nobody has
> a Mac, see the cost options in [§5](#5-costs-in-india).

### 3.1 One-time account setup
1. Enroll in the **Apple Developer Program** → **$99/year**.
   - **Organization** enrollment needs a **D-U-N-S number** (free, ~1–2 weeks to obtain) and a
     legal entity. **Individual** enrollment is faster but publishes under a personal name.
2. In **App Store Connect**, create the app record with bundle id **`com.shivagri.app`**.

### 3.2 Signing
1. In Xcode → **App** target → **Signing & Capabilities** → select your **Team**; enable
   *Automatically manage signing* (Xcode creates certificates + provisioning profiles).
2. For a physical test device, it must be registered to your team.

### 3.3 Prepare the release build
```bash
cd frontend
npm run build
npx cap sync ios
npx cap open ios              # opens Xcode
```
In Xcode:
1. Set **Version** (e.g. `1.0.0`) and **Build** (increment every upload) on the App target.
2. Select destination **Any iOS Device (arm64)**.
3. **Product → Archive** → when the Organizer opens, **Distribute App → App Store Connect → Upload**.

### 3.4 First submission (TestFlight → App Store)
1. The uploaded build appears in **App Store Connect → TestFlight** after processing (~15–60 min).
   Test it on real devices via TestFlight first.
2. Fill the **App Store listing**: name, subtitle, description, keywords, **screenshots for each
   required device size** (6.7", 6.5", 5.5", iPad if supported), app icon 1024×1024, **support
   URL**, **Privacy Policy URL**.
3. Complete **App Privacy** ("nutrition labels") — declare Google-login account data, usage, etc.
4. Answer **Export Compliance** (uses HTTPS → usually "uses standard encryption, exempt").
5. Submit for **App Review**. Typical turnaround 24–48h; rejections restart the clock.

### 3.5 Updates
Bump Build (and Version for feature releases), Archive, upload, submit for review.

---

## 4. Challenges to expect

### 4.1 Apple Guideline 4.8 — Google Sign-In requires an alternative *(highest risk)*
Apple requires that any app offering a third-party/social login (Google) **also offer a
login option that lets users keep data private** — in practice, **Sign in with Apple**, unless
your alternative meets 4.8's privacy criteria (no data collection beyond name/email, no
advertising with it, etc.).
- **Impact:** Almost certain rejection if the *only* login is Google.
- **Fix options:** Add **Sign in with Apple** to the app (requires backend work: verify Apple
  identity tokens in the Node API, create/link the user), **or** add an email/password login that
  satisfies the criteria. Budget backend + frontend time for this **before** iOS submission.

### 4.2 Apple Guideline 4.2 — "minimum functionality" for WebView wrappers *(high risk)*
Apps that are essentially a website in a shell get rejected. We already added native behaviors
(status bar, splash, keyboard, hardware back, safe-area) which helps, but reviewers may still
push back.
- **Mitigations:** Emphasize native integrations; consider adding at least one clearly-native
  feature (e.g. **push notifications**, camera for uploads, offline caching). Make sure the app
  never shows a bare browser chrome, error pages, or dead external links.

### 4.3 Privacy policy & data declarations *(blocking on both stores)*
Both stores **require a public Privacy Policy URL** and accurate data declarations
(Play **Data safety**, Apple **App Privacy**). You collect Google account data, uploads, and
usage data — declare all of it. Host the policy at e.g. `shivagri.com/privacy`.

### 4.4 Network security *(functional)*
- **iOS ATS** and **Android cleartext blocking** both require **HTTPS**. Our API is
  `https://shivagri.com/api`, so we're fine — but any `http://` or IP-based endpoint will fail
  silently on device. Never point a release build at `localhost` or plain HTTP.
- **CORS:** the API's `ALLOWED_ORIGINS` is set for the website's origin. Native WebViews send
  origins like `capacitor://localhost` (iOS) and `https://localhost` (Android). If you see CORS
  failures on device, add those origins to `ALLOWED_ORIGINS` on the API.

### 4.5 Google Sign-In client configuration *(functional)*
The current web Google Client ID is a **Web** client. Native Google Sign-In typically needs
**iOS** and **Android OAuth client IDs** (with the bundle id / SHA-1 fingerprint registered in
Google Cloud Console) and often the `@codetrix-studio/capacitor-google-auth` plugin or similar.
Verify login actually works **on device**, not just in the browser — this is a frequent surprise.

### 4.6 App signing key management *(operational)*
- **Android:** losing the upload keystore blocks updates. Store it + passwords in a password
  manager and an offline backup.
- **iOS:** certificates/profiles expire; renew before releases. Consider **fastlane match** if
  multiple people build.

### 4.7 Store assets & metadata *(time sink)*
Screenshots for many device sizes, icons at multiple resolutions, feature graphic, descriptions,
keywords, age ratings. Budget real time for this — it's often underestimated.

### 4.8 Review latency & rejections *(schedule risk)*
Plan for **at least one rejection cycle**. Don't announce a launch date that assumes first-pass
approval. TestFlight/internal-testing tracks let you validate before the public review.

### 4.9 Ongoing OS/policy churn *(maintenance)*
Google raises the **target API level** requirement yearly; Apple requires building against recent
SDKs. Expect to rebuild + resubmit periodically just to stay compliant, even with no feature
changes. Run `npx cap doctor` and keep Capacitor/plugins updated.

### 4.10 One API, three clients that can't all update instantly
Web users get changes immediately; app users update on their own schedule (and only after store
review). **Version your API and avoid breaking changes** so an old shipped app keeps working.

---

## 5. Costs in India

> Figures are **approximate (2026)** and for planning only — **verify current prices**. USD→INR
> assumed ≈ **₹86**. Store fees are billed by Apple/Google and may include local taxes/GST.

### 5.1 Mandatory — to publish

| Item | Frequency | USD | Approx INR | Notes |
|------|-----------|-----|------------|-------|
| **Apple Developer Program** | **per year** | $99 | **~₹8,500–9,900** | Apple's India price often shown ~₹9,900 incl. taxes. Required for App Store + TestFlight. |
| **Google Play Console** | **one-time** | $25 | **~₹2,150** | Single lifetime fee per developer account. |
| **Domain** (`shivagri.com`) | per year | — | **~₹1,000–1,500** | Already owned; renewal. |
| **VPS** (Hostinger) | per month | — | **~₹500–1,200/mo** (~₹6,000–15,000/yr) | Already running the web + API. Shared by all 3 apps. |
| **TLS / SSL** | — | free | **₹0** | Let's Encrypt via certbot (already set up). |

**Minimum to get all three live (year 1), assuming domain + VPS already exist:**
roughly **₹11,000–13,000 one-time-ish** (Apple ₹~9,900 + Google ₹~2,150), then **~₹9,900/year**
recurring for Apple, plus your existing domain + VPS.

### 5.2 Conditional — likely needed

| Item | When | Approx INR | Notes |
|------|------|------------|-------|
| **A Mac to build iOS** | If no one has a Mac | **Mac mini from ~₹60,000** (one-time) | Xcode is macOS-only. |
| **Cloud Mac** (alternative) | Instead of buying | **~₹1,700–6,000/mo** (MacinCloud/MacStadium ~$20–70) | Pay only during build/release cycles. |
| **D-U-N-S number** | Apple/Play **organization** accounts | **₹0** | Free from Dun & Bradstreet; ~1–2 weeks to issue. |
| **Sign in with Apple work** | To pass Guideline 4.8 | Dev time (not a fee) | Backend + frontend effort; see §4.1. |

### 5.3 Optional / scale-dependent

| Item | Approx INR | Notes |
|------|------------|-------|
| **MongoDB Atlas** | Free (M0) → **~₹800–1,300/mo** for shared paid | Only if you move off VPS-hosted Mongo. |
| **Push notifications (FCM/APNs)** | **₹0** | FCM is free; APNs included in Apple Program. Dev time to integrate. |
| **Google Maps / other Google APIs** | Usage-based | Only if you add maps; has a monthly free allowance. |
| **Object storage / CDN for uploads** | Usage-based | If uploads outgrow the VPS disk. |
| **Play/App Store revenue share** | 15–30% of sales | **Only if you sell the app or use in-app purchases.** A free app pays nothing here. |

### 5.4 Realistic first-year budget (typical case)

Assuming you **already** have the domain + VPS, need to **buy nothing** for Mac (borrow/existing),
and the app is **free** to users:

- Apple Developer: **~₹9,900**
- Google Play (one-time): **~₹2,150**
- **≈ ₹12,000 in store fees for year 1**, then **≈ ₹9,900/year** ongoing (Apple renewal).

Add **~₹60,000 one-time** if you must buy a Mac, or **~₹2,000–6,000/month** for a cloud Mac used
only around releases.

---

## 6. Suggested go-live sequence

1. **Web:** already live — keep API stable (it's now serving three clients).
2. **Backend prerequisite:** implement **Sign in with Apple** (or a compliant alt login) and
   register **native Google OAuth client IDs**. Verify login **on real devices**.
3. **Host the Privacy Policy** at `shivagri.com/privacy`.
4. **Android first** (cheaper, faster review): internal testing → closed → production.
5. **iOS second:** TestFlight → submit for review; be ready for a 4.2/4.8 rejection and iterate.
6. **Set up store assets** (icons, screenshots, descriptions) — start early, it takes longer than expected.
7. After launch, establish a **rebuild-and-resubmit** cadence for OS/policy compliance.

---

## 7. Pre-submission checklist

- [ ] Release build points at **`https://shivagri.com/api`** (never localhost/HTTP).
- [ ] `ALLOWED_ORIGINS` on the API includes native WebView origins if needed.
- [ ] Login works **on a real iOS device and a real Android device** (not just the browser).
- [ ] **Sign in with Apple** (or compliant alternative) implemented — iOS.
- [ ] Privacy Policy URL live and linked in both stores.
- [ ] Play **Data safety** + Apple **App Privacy** forms completed accurately.
- [ ] App icon + all required screenshot sizes prepared.
- [ ] `versionCode`/`Build` incremented from any previous upload.
- [ ] Upload keystore (Android) + signing certs (iOS) backed up securely.
- [ ] Tested via **Internal Testing** (Play) and **TestFlight** (iOS) before public rollout.
```
