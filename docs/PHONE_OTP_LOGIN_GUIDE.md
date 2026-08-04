# Phone OTP Login — Setup & Usage Guide

This guide covers the phone-number + WhatsApp-OTP login flow added alongside the existing Google OAuth sign-in.

- **Backend:** Node/Express (`backend/src/controllers/otpAuthController.js`, `services/otpService.js`)
- **OTP delivery:** the existing `notification-service` (Spring Boot) via a new `POST /api/notifications/whatsapp/template` endpoint
- **Frontend:** Angular login page (`frontend/src/app/pages/login/`)
- **Provider:** WhatsApp Cloud API (Meta) — **requires an approved Authentication-category template**

---

## 1. Flow at a glance

```
┌──────────┐  POST /api/auth/otp/request          ┌──────────┐
│ Frontend │ ───────────────────────────────────► │ Backend  │
│ (Angular)│  { phoneCountryCode, phoneNumber }   │  api     │
└──────────┘                                      └────┬─────┘
                                                       │ 1. Rate-limit + cooldown check
                                                       │ 2. Generate 4-digit code, hash & cache in-memory (3 min)
                                                       │ 3. Call notification-service
                                                       ▼
                                                 ┌──────────────────────┐
                                                 │ notification-service │
                                                 │ POST /whatsapp/      │
                                                 │      template        │
                                                 └──────────┬───────────┘
                                                            │  WhatsApp Cloud API
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │   User's WhatsApp    │
                                                 │   "Your code is 4821"│
                                                 └──────────┬───────────┘
                                                            │
┌──────────┐  POST /api/auth/otp/verify    ◄────────────────┘
│ Frontend │ ───────────────────────────────► verify hash, find-or-create user,
│ (Angular)│  { phoneCountryCode, phoneNumber, otp }       issue JWT
└──────────┘                                  ◄───────  { accessToken, user }
```

OTPs live **only in memory** on the backend (single-instance assumption). Restarting `api` invalidates all in-flight codes.

---

## 2. Policy

| Setting | Value |
|---|---|
| Code length | **4 digits** |
| Code TTL | 3 minutes |
| Max verify attempts per code | 3 |
| Resend cooldown | 60 seconds |
| Hourly limit per phone | 3 OTPs / rolling hour |
| Storage | In-memory `Map` with periodic sweep |
| Hashing | SHA-256 (constant-time compare on verify) |

Adjust the constants at the top of `backend/src/services/otpService.js` if policy needs to change.

---

## 3. One-time setup

### 3.1 Create a WhatsApp message template

OTPs to users outside the 24-hour customer-service window are **only deliverable via approved templates**. Create one in Meta Business Manager:

1. **Meta Business Manager → WhatsApp Manager → Message templates → Create template**
2. **Category:** `Authentication`
3. **Name:** `otp_login` *(use a different name? remember to set `WHATSAPP_OTP_TEMPLATE_NAME`)*
4. **Language:** `English` *(set `WHATSAPP_OTP_TEMPLATE_LANGUAGE=en`; for Hindi use `hi`, Gujarati `gu`, etc.)*
5. **Body:**
   > `{{1}} is your verification code. For your security, do not share this code.`
6. **Add a "Copy code" button** (sub-type URL with the code as the parameter) — Meta strongly prefers this for Authentication templates, and our code passes the OTP both as the body parameter and the button parameter.
7. **Submit for review.** Authentication templates are usually approved within minutes.

After approval, the template name + language code must match your env vars (see §4).

> **Tip:** For local testing without an approved template, set
> `WHATSAPP_OTP_TEMPLATE_HAS_BUTTON=false` and use a Meta-provided sample template, or temporarily swap `notificationClient.js` to call `/whatsapp/text` instead.

### 3.2 One-time MongoDB index migration

Email and phone are now **both unique sparse identities** (1-1 correspondence — one email and one phone each map to exactly one user). Two index changes are required:

1. `users.email` must be `{ unique: true, sparse: true }` — the original live index was non-sparse, so it rejects phone-only signups (which have no email).
2. `users.metadata.phoneNumberNormalized` needs a new `{ unique: true, sparse: true }` index so one phone can't be claimed by two accounts.

Run the migration script **once** (idempotent; works against dev and prod). It cleans empty-string identity values, reports any pre-existing duplicates that would block the unique build, then rebuilds both indexes:

```bash
cd backend
node src/scripts/migrate-phone-email-unique.js --dry-run   # preview
node src/scripts/migrate-phone-email-unique.js             # apply
```

> If you skip this step the unique phone index can't build, and the very first phone-only signup fails with **E11000 duplicate key error** on `email: null`. If the script reports duplicate emails/phones, resolve those accounts by hand first, then re-run.

### 3.3 Environment variables (backend `api` service)

Add to `/var/www/shiv-agri/.env` (production) and your local `.env`:

```bash
# Where the backend should reach the notification microservice
NOTIFICATION_SERVICE_URL=http://notification-service:8082/api/notifications
NOTIFICATION_API_KEY=<same key set on notification-service>

# Template wiring
WHATSAPP_OTP_TEMPLATE_NAME=otp_login
WHATSAPP_OTP_TEMPLATE_LANGUAGE=en
WHATSAPP_OTP_TEMPLATE_HAS_BUTTON=true

# Defaults
DEFAULT_PHONE_COUNTRY_CODE=+91
DEFAULT_PHONE_SIGNUP_ROLE=user
```

The notification-service itself still needs `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` (see `notification-service/README.md` §3).

---

## 4. API contract

All routes are public (no JWT required) and live under `/api/auth/otp/...`.

### 4.1 `POST /api/auth/otp/request`

**Body:**
```json
{ "phoneCountryCode": "+91", "phoneNumber": "9876543210" }
```

**200 OK:**
```json
{
  "message": "Verification code sent via WhatsApp",
  "requestId": "8e7a-...",
  "phoneCountryCode": "+91",
  "phoneNumber": "9876543210",
  "otpLength": 4,
  "expiresInSeconds": 180,
  "expiresAt": 1717499000000,
  "resendAfterSeconds": 60,
  "maxAttempts": 3
}
```

**429 (cooldown / hourly limit):**
```json
{
  "error": "Please wait before requesting another code",
  "reason": "COOLDOWN",
  "retryAfterSeconds": 45
}
```

**502 (provider failure):** the OTP issuance is rolled back; the user can retry immediately.

### 4.2 `POST /api/auth/otp/verify`

**Body:**
```json
{ "phoneCountryCode": "+91", "phoneNumber": "9876543210", "otp": "4821" }
```

**200 OK (existing user) / 201 Created (new user):**
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOi...",
  "user": {
    "id": "...",
    "email": "",
    "name": "New User",
    "role": "user",
    "phoneCountryCode": "+91",
    "phoneNumber": "+91 9876543210",
    "phoneVerified": true,
    "roleRef": { ... }
  }
}
```

**400 (wrong code):**
```json
{ "error": "Incorrect code", "reason": "MISMATCH", "attemptsRemaining": 2 }
```

**410 (expired / used up):**
```json
{ "error": "Too many incorrect attempts. Request a new code.", "reason": "TOO_MANY_ATTEMPTS" }
```

### 4.3 Behavior on verify

1. The phone is normalized to `<countryDigits><nationalDigits>` (e.g. `919876543210`).
2. The backend looks for an existing user with `metadata.phoneNumberNormalized` matching.
3. **Found** → mark `phoneVerified = true`, refresh `lastLogin`, populate role, issue a session (see §10).
4. **Not found** → auto-create a user with `name: "New User"`, `role: "user"`, `phoneVerified: true`, link to the matching `Role` document, issue a session (201).

A user pre-provisioned by a manager (§11) is found by phone here, so the farmer's first phone-OTP login lands on the existing account and inherits every farm created for them.

---

## 5. New WhatsApp template endpoint on `notification-service`

```http
POST /api/notifications/whatsapp/template
X-API-Key: <NOTIFICATION_API_KEY>
Content-Type: application/json

{
  "to": "+919876543210",
  "templateName": "otp_login",
  "languageCode": "en",
  "bodyParameters": ["4821"],
  "buttonOtpCode": "4821"
}
```

- `bodyParameters` — positional substitutions for `{{1}}, {{2}} …` in the template body.
- `buttonOtpCode` — if your template has a URL-button copy-code action, pass the code here too. Omit (or send `null`) if your template has no button.

The endpoint shares the same auth (X-API-Key) and supports `?async=true`, though synchronous is recommended for OTPs.

---

## 6. Local development

### Run everything

```bash
# from repo root
docker compose up -d mongodb api notification-service
docker compose logs -f api notification-service
```

For WhatsApp delivery to actually work locally, the notification-service container needs valid Meta credentials. Without them you'll see:

```
[<requestId>] WhatsApp credentials are not configured
```

…and the OTP-request endpoint will return 502.

### Manual smoke test (without delivery)

If you want to test the flow end-to-end without delivering a real WhatsApp message, temporarily uncomment a log line in `otpAuthController.js` to log the OTP:

```js
console.log(`[${requestId}] DEV ONLY — code for ${e164}: ${code}`);
```

**Do not commit this.** The `requestId` is enough for production debugging — never log the plaintext code in prod.

### cURL examples

```bash
# 1. Request
curl -X POST http://localhost:3000/api/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phoneCountryCode":"+91","phoneNumber":"9876543210"}'

# 2. Verify (use the code received on WhatsApp)
curl -X POST http://localhost:3000/api/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phoneCountryCode":"+91","phoneNumber":"9876543210","otp":"4821"}'
```

---

## 7. Frontend UX notes

The login page (`/login`) now has two tabs:

- **Google** — **default**. The OAuth Authorization Code flow.
- **Phone (WhatsApp OTP)** — secondary tab. Country code dropdown (+91 first), national number input. Sends code, then shows 4 separate digit boxes that:
  - Auto-advance on input
  - Backspace moves focus back
  - Accept paste of full code
  - Auto-submit when all 4 digits are filled
  - Show live "Code expires in 2:47" and "Resend in 45s" counters
  - Show "N attempts left" after a wrong code

Design tokens align with `ui-ux-pro-max`'s "Minimal Single Column" pattern: 16–24px radii, organic shadow, generous whitespace, focus rings, tablet-bumped touch targets (54px), and `prefers-reduced-motion` support. The existing Shivagri purple gradient is preserved as the page background for brand continuity.

---

## 8. Operations / troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `502` on `/otp/request`, logs show `WHATSAPP_ACCESS_TOKEN not configured` | notification-service env missing | Set Meta creds in compose env / `.env` |
| `502` with `template_param_count_mismatch` | template body has more `{{n}}` than `bodyParameters` provided | Match the template's parameter count (we send 1 by default) |
| `132001` from Meta | template name/language not approved | Re-check `WHATSAPP_OTP_TEMPLATE_NAME` & language exactly match a *Approved* template |
| User never receives the code | sandbox-mode WhatsApp account, or template still in review | Approve template; add the recipient to test recipients |
| `429 COOLDOWN` immediately after first request | working as intended | Frontend respects `resendAfterSeconds`; tell user to wait |
| OTP works in dev but not after a deploy | in-memory store reset on restart | Expected; the user re-requests |
| Need persistence / multi-instance | scaling out the `api` service | Migrate `otpService` from `Map` to MongoDB collection with TTL index, or Redis |

### Useful log greps

Every request emits a UUID `requestId` you can correlate across services:

```bash
# backend
docker compose logs api | grep "<requestId>"

# notification-service
docker compose logs notification-service | grep "<requestId>"
```

---

## 9. Files changed in this work

**Backend:**
- `backend/src/models/User.js` — `email` made optional/sparse-unique; added `phoneVerified`, `phoneVerifiedAt`
- `backend/src/services/otpService.js` *(new)* — in-memory OTP store, policy, hashing
- `backend/src/services/notificationClient.js` *(new)* — thin HTTP client for notification-service
- `backend/src/controllers/otpAuthController.js` *(new)* — `requestOtp`, `verifyOtp`
- `backend/src/routes/auth.js` — wired `/auth/otp/request`, `/auth/otp/verify`

**Notification service:**
- `notification-service/.../service/WhatsAppService.java` — `sendTemplate(...)` method
- `notification-service/.../controller/dto/WhatsAppTemplateRequest.java` *(new)*
- `notification-service/.../controller/WhatsAppController.java` — `POST /whatsapp/template`

**Frontend:**
- `frontend/src/app/pages/login/login.ts` — tabbed UI, OTP entry state machine, timers
- `frontend/src/app/pages/login/login.html` — new layout
- `frontend/src/app/pages/login/login.css` — design-system aligned styling
- `frontend/src/app/services/auth.service.ts` — `requestPhoneOtp`, `verifyPhoneOtp`, `phoneVerified` field on `User`

**Compose / config:**
- `docker-compose.yml` and `docker-compose.prod.yml` — env vars on `api` for notification-service URL + key + template config

---

## 10. Session management (Google + phone unified)

Every login method — Google and phone OTP — now issues the **same** session:

- A short-lived **JWT access token** (`JWT_EXPIRES_IN`, default 24h), returned in the response body and sent by the frontend as `Authorization: Bearer …`.
- A long-lived **opaque refresh token** (`REFRESH_TOKEN_TTL_DAYS`, default 60d). Only its SHA-256 hash is stored on the user (`refreshToken` + `refreshTokenExpiresAt`); the raw value lives in an **httpOnly cookie**.

`POST /api/auth/refresh` (no body, `withCredentials`) reads the cookie, validates+rotates the refresh token, and returns a fresh access token. This works identically for phone and Google users, so **phone users no longer get logged out after 24h**. Pre-existing Google-only sessions are transparently upgraded onto this scheme on their next refresh (legacy Google-refresh-token fallback). `logout` clears the hash and the cookie.

Implementation: `backend/src/utils/session.js`.

---

## 11. Profile phone attach (add-only, locked)

A signed-in user with **no** phone yet can attach one via OTP. Once set, a number is **immutable for users** (admin-only change). Endpoints (both require auth):

- `POST /api/auth/profile/phone/request-otp` `{ phoneCountryCode, phoneNumber }`
- `POST /api/auth/profile/phone/verify-otp`  `{ phoneCountryCode, phoneNumber, otp }`

Both reject (409) if the account already has a phone, or if the number is already linked to a **different** account (the 1-1 guard). The legacy `PATCH /api/auth/profile` is now admin-only.

---

## 12. Manager-created farms auto-provision farmers

When an admin/manager creates a farm (`POST /api/projects`, manager mode) they enter a **mobile number (required)** and **email (optional)**:

- An existing farmer matching the phone → the farm is linked to them (by `clientId` = userId).
- An existing user matching the email but with no phone → the phone is attached (pre-provisioned).
- Nobody matches → a **new** user is created (`role: user`, `phoneVerified: false`) with the phone and optional email.

The farmer later signs in by phone OTP (or by Google, if the email was provided) and the pre-provisioned account — with all its farms — becomes theirs. Conflicts (phone/email already owned by a different account) are blocked with a clear error. Logic: `projectService.resolveOrCreateFarmer`.
