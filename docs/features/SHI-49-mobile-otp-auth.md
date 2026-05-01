# SHI-49 — Mobile OTP Authentication via WhatsApp

> **Parent epic:** SHI-48 — Rewire Farm Management Module
> **Status:** Design phase
> **Branch:** `feature/shi49`
> **Owner:** Mahir Ratanpara

---

## 1. Goal

Deliver a second authentication channel — **mobile number + OTP delivered via WhatsApp** — alongside the existing Google OAuth flow. Both channels mint the **same JWT shape**, so all downstream guards, interceptors, and RBAC continue to work without changes.

### Channel Strategy

| Surface | Auth Method | User Type |
|---|---|---|
| **Website** (`shivagri.in`) | Google OAuth (existing) | Internal staff (admin, manager, lab_technician, assistant) |
| **Mobile Application** (planned) | Mobile number + WhatsApp OTP (this ticket) | Farmers (`user` role) |

The website's `/login` keeps Google OAuth as the primary flow. A secondary "Login with Mobile" link is added for testing/edge cases, navigating to `/login/otp`. The mobile application (separate initiative) will use the OTP flow as its only login path.

---

## 2. Architecture

### High-Level Flow

```
┌────────────────────┐         ┌──────────────────────┐
│ Website /login     │────────▶│  Google OAuth        │──┐
│ (internal staff)   │         │  (existing flow)     │  │
└────────────────────┘         └──────────────────────┘  │
                                                         ▼
                                                ┌──────────────────┐
                                                │  Same JWT format │
                                                │  (24h expiry)    │
                                                ▼──────────────────┘
                                                         ▲
┌────────────────────┐         ┌──────────────────────┐  │
│ Mobile App         │────────▶│  Mobile + OTP        │──┘
│ Website /login/otp │         │  (this ticket)       │
│ (farmers)          │         └──────────────────────┘
└────────────────────┘                    │
                                          │ OTP sent via
                                          ▼
                              ┌──────────────────────┐
                              │ Meta WhatsApp        │
                              │ Cloud API (direct)   │
                              └──────────────────────┘
```

### Why WhatsApp Cloud API (Direct)

| Option | Decision | Rationale |
|---|---|---|
| **Meta WhatsApp Cloud API** | ✅ Chosen | Lowest cost long-term, no BSP markup, full API control, aligns with future WhatsApp messaging roadmap (prescription delivery, farm notifications) |
| BSP wrapper (AiSensy, WATI, Interakt) | ❌ Rejected | Adds ~₹0.40+/msg markup, vendor lock-in |
| Twilio WhatsApp | ❌ Rejected | Premium pricing, overkill for India scale |
| SMS providers (MSG91, 2Factor) | ❌ Rejected | DLT registration overhead, weaker deliverability than WhatsApp, doesn't fit roadmap |
| Firebase Phone Auth | ❌ Rejected | Replaces our OTP lifecycle (we want to own attempts/rate limiting in MongoDB) |

### Constraint: WhatsApp-Only

**Decision:** Users without WhatsApp cannot log in via OTP. This is acceptable for v1 because:
- Indian farmer WhatsApp penetration is very high
- Reduces complexity (no SMS fallback to maintain)
- If support tickets indicate gaps, SMS fallback can be added later behind the same `messagingService` abstraction

---

## 3. Backend Design

### 3.1 Schema Changes

**`backend/src/models/User.js`** — minimal additions, **role enum unchanged**:

```javascript
mobileNumber: {
  type: String,
  unique: true,
  sparse: true,
  index: true,
  trim: true
  // E.164 format, e.g. "+919876543210"
},
authMethod: {
  type: String,
  enum: ['google', 'otp', 'both'],
  default: 'google'
}
```

**Role for OTP-authed farmers:** existing `user` role (no enum change). Confirmed by product owner.

**`backend/src/models/OtpToken.js`** — new collection:

```javascript
{
  mobileNumber: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },     // bcrypt-hashed OTP
  expiresAt: { type: Date, required: true },     // TTL index — auto-deletes
  attempts: { type: Number, default: 0, max: 3 },
  requestCount: { type: Number, default: 1 },    // for rate limiting
  requestWindowStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}
```

**Indexes:**
- `{ mobileNumber: 1 }` — lookup
- `{ expiresAt: 1 }` with TTL `expireAfterSeconds: 0` — auto-cleanup

### 3.2 Migration

One-time script: backfill all existing users with `authMethod: 'google'`.

```
backend/src/scripts/migrate-auth-method.js
```

### 3.3 Services

**`backend/src/services/messagingService.js`** — provider-agnostic messaging facade.

```javascript
// Public API
sendOtp(mobileNumber, otp)
sendTemplate(mobileNumber, templateName, params)  // for future use
```

Driver selected by `MESSAGING_PROVIDER` env var:
- `whatsapp_cloud` — production, calls Meta Graph API
- `console` — dev/staging, logs OTP to backend console (per ticket spec)

**`backend/src/services/messaging/whatsappCloudDriver.js`** — Meta Cloud API integration:
- POST to `https://graph.facebook.com/{version}/{phone_number_id}/messages`
- Uses authentication category template
- Includes copy-code button parameter

**`backend/src/services/messaging/consoleDriver.js`** — dev driver, just logs.

**`backend/src/services/otpService.js`** — OTP lifecycle:
- `generateOtp(mobileNumber)` — crypto-random 6-digit, hash, store, return for delivery
- `verifyOtp(mobileNumber, otp)` — fetch token, compare hash, increment attempts on fail, lock after 3
- `enforceRateLimit(mobileNumber)` — max 3 OTP requests per phone per 15 min

### 3.4 API Endpoints

**`backend/src/routes/auth.js`** — two new public routes:

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/request-otp` | `{ mobileNumber }` | `{ message, expiresIn: 300 }` |
| POST | `/api/auth/verify-otp` | `{ mobileNumber, otp }` | `{ accessToken, user }` (same shape as Google flow) |

**Security:**
- E.164 phone validation (libphonenumber-js)
- OTP never returned in API response
- Hashed storage in DB
- Rate limit: 3 requests per phone per 15 min → 429 with retry-after
- Attempt limit: 3 wrong OTPs → token invalidated, must request new

**Logging (Winston):**
- OTP request received (mobile masked, e.g., `+91987****210`)
- WhatsApp API call latency + status
- Verification result (success/failure)
- Rate-limit triggers
- Never log raw OTP or full mobile number in production

### 3.5 RBAC

No new permissions. OTP-verified users are created with the existing `user` role and inherit its permissions (currently mapped to limited farmer-facing capabilities).

---

## 4. Frontend Design

### 4.1 New Page: `pages/otp-login/`

**Route:** `/login/otp` (public, no `authGuard`)

**Step 1 — Phone Entry**
- Single input with `+91` prefix label (locked for v1; configurable later)
- "Send OTP" CTA, disabled until 10-digit Indian mobile entered
- Loading state during request
- Error states: invalid format, rate-limited (show cooldown), network error

**Step 2 — OTP Entry**
- 6-box auto-advance OTP input (paste support)
- "Verify" CTA, disabled until 6 digits entered
- 60-second resend countdown
- "Resend OTP" link (disabled during countdown)
- Error states: wrong OTP (show attempts remaining), expired token, network error
- "Change mobile number" link to go back to Step 1

**Success:**
- Store JWT in `localStorage` under same key as Google OAuth
- Redirect to `/farm-management` (new screen from SHI-48 epic)

### 4.2 Login Page Update

`pages/login/login.ts` — add a secondary CTA:

> **"Login with mobile number →"** *(navigates to `/login/otp`)*

Below the existing Google OAuth button, separated by a subtle divider. Matches existing minimalist design.

### 4.3 Service Updates

`services/auth.service.ts` — add:
- `requestOtp(mobileNumber: string): Observable<{ message: string; expiresIn: number }>`
- `verifyOtp(mobileNumber: string, otp: string): Observable<{ accessToken: string; user: User }>`

### 4.4 Routing

`app.routes.ts` — register `/login/otp` → `OtpLoginComponent`. No guard.

### 4.5 Styling

Match existing login design language:
- Theme: `#1b5e20` (dark green primary), `#33691e` (header secondary)
- Typography: Roboto 16px body, Poppins for headings
- Button + input styles from existing `custom.css`
- Tablet-friendly (48px+ touch targets per UX standards)
- Skeleton/loading states per the design system

---

## 5. Meta WhatsApp Cloud API Setup (One-Time)

> Done by product owner before staging deploy. Code uses env vars and works against the console driver until these are filled in.

### Phase 1 — Meta Business Account
1. Go to **business.facebook.com** → Create Account
2. Business name: `Shiv Agri` (must match GST/registration docs)
3. Add details: address, website, GST/Tax ID

### Phase 2 — Business Verification (1–7 days, runs in background)
1. Settings → Security Center → Start Verification
2. Upload **GST certificate** (cleanest single doc for India)
3. Phone verification via call/SMS
4. Required to lift the 250-recipient/24h cap before launch

### Phase 3 — Meta Developer App
1. **developers.facebook.com** → Create App → use case "Other" → type "Business"
2. App name: `Shivagri WhatsApp` (internal)
3. Link to Business Manager from Phase 1
4. Add Product → **WhatsApp** → Set Up
5. This auto-creates a WhatsApp Business Account (WABA)

### Phase 4 — Phone Number
1. WhatsApp → API Setup → Add phone number
2. **Use a number NOT currently active on WhatsApp/WhatsApp Business app**
3. Display name: `Shiv Agri` (avoid generic terms like "OTP", "Verify" — auto-rejected)
4. Category: Agriculture or Professional Services
5. Verify via SMS/voice
6. Display name review: ~1–2 days

**Save these values** (env vars):
- `WHATSAPP_PHONE_NUMBER_ID` — numeric, from API Setup page
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — from same page

### Phase 5 — Authentication Template
1. WhatsApp Manager → Message Templates → Create Template
2. **Category: Authentication** (fast-approval, cheaper pricing)
3. Name: `shivagri_otp` (snake_case)
4. Language: English (Gujarati can be added later)
5. Body uses Meta's locked authentication format:
   ```
   {{1}} is your verification code. For your security, do not share this code.
   ```
6. Add **"Copy code"** button (recommended — tap-to-copy on user's phone)
7. Code expiry: 5 minutes (matches backend logic)
8. Approval: usually <1 hour

### Phase 6 — Permanent Access Token
Default 24h tokens are useless for production. Create a System User token:

1. Business Manager → Settings → Users → System Users → Add
2. Name: `shivagri-whatsapp-system-user`, Role: Admin
3. Add Assets → select WABA → check **Manage** + **Send messages**
4. Generate Token:
   - App: Meta app from Phase 3
   - Expiration: **Never**
   - Permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
5. **Copy the token immediately** — shown once

### Phase 7 — Smoke Test

```bash
curl -X POST "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "91XXXXXXXXXX",
    "type": "template",
    "template": {
      "name": "shivagri_otp",
      "language": { "code": "en" },
      "components": [
        { "type": "body", "parameters": [{ "type": "text", "text": "123456" }] },
        { "type": "button", "sub_type": "url", "index": "0",
          "parameters": [{ "type": "text", "text": "123456" }] }
      ]
    }
  }'
```

A successful response returns a `messages` array with a message ID.

### Pitfalls
- Do NOT reuse a personal WhatsApp number — registration locks it out of the consumer app
- Display names like "OTP Service" or "Verify" are auto-rejected — use brand name
- Test number Meta provides only sends to a 5-recipient allowlist; graduate to your own number ASAP
- 250-recipient cap until business verification completes — plan launch around it

---

## 6. Environment Variables

```bash
# Messaging provider — flips between dev console and prod WhatsApp
MESSAGING_PROVIDER=console               # dev/staging
# MESSAGING_PROVIDER=whatsapp_cloud      # production

# WhatsApp Cloud API — only required when MESSAGING_PROVIDER=whatsapp_cloud
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_OTP_TEMPLATE_NAME=shivagri_otp
WHATSAPP_OTP_TEMPLATE_LANGUAGE=en

# OTP behavior (sensible defaults — override only if needed)
OTP_EXPIRY_SECONDS=300
OTP_MAX_ATTEMPTS=3
OTP_RATE_LIMIT_REQUESTS=3
OTP_RATE_LIMIT_WINDOW_SECONDS=900
```

---

## 7. Implementation Phases

### Phase A — Backend Foundation (no external deps)
1. Update `User.js` schema (mobile + authMethod)
2. Create `OtpToken.js` model with TTL index
3. Migration script for existing users
4. `messagingService` + `consoleDriver`
5. `otpService` (generation, verification, rate limiting)
6. Routes + controller for `/auth/request-otp` and `/auth/verify-otp`
7. Verify with curl + console-logged OTP

### Phase B — Frontend
1. `pages/otp-login/` component (TS, HTML, SCSS)
2. Service methods in `auth.service.ts`
3. Route registration
4. Login page secondary CTA
5. Verify end-to-end with backend console driver

### Phase C — WhatsApp Integration
1. `whatsappCloudDriver` implementation
2. Switch `MESSAGING_PROVIDER` in staging
3. Smoke test with real phone number
4. Logging/observability tweaks

### Phase D — Production Readiness
1. Verify business verification complete (lift recipient cap)
2. Confirm display name + template approved
3. Review rate-limit + attempt thresholds
4. Production env vars deployed
5. Monitor first cohort of OTP logins

---

## 8. Acceptance Criteria

- [ ] Farmer can request OTP with a valid Indian mobile number
- [ ] OTP delivered via WhatsApp template message
- [ ] OTP expires after 5 minutes
- [ ] Token locks after 3 wrong attempts
- [ ] Rate limit: max 3 OTP requests per phone per 15 minutes
- [ ] New User record created on first successful verify (with `user` role, `authMethod: 'otp'`)
- [ ] Existing User record reused if mobile number matches (sets `authMethod: 'both'` if previously `google`)
- [ ] JWT returned is valid for all existing protected routes
- [ ] OTP never exposed in API responses (dev console log only)
- [ ] 60-second resend cooldown shown in UI
- [ ] Frontend handles all error states (invalid phone, wrong OTP with attempts remaining, rate-limited, expired, network)
- [ ] Backend logs are useful for debugging without leaking secrets

---

## 9. Open Items / Future Work

- **Gujarati template** — add as a second language to the auth template once English flow is validated
- **SMS fallback** — only if support tickets show meaningful no-WhatsApp gaps
- **WhatsApp delivery webhooks** — not strictly required for OTP, but useful for delivery analytics; can be added under `/api/webhooks/whatsapp` later
- **General WhatsApp messaging** — same `messagingService` abstraction will power prescription delivery (SHI-52 territory) and farm notifications without rewrites
- **Mobile application** — separate Linear feature tracks the cross-platform mobile app strategy where this OTP flow becomes the primary login path

---

## 10. References

- Linear ticket: [SHI-49](https://linear.app/shiv-agri/issue/SHI-49/feature-1-mobile-otp-authentication-full-stack)
- Parent epic: [SHI-48](https://linear.app/shiv-agri/issue/SHI-48/rewire-farm-management-module-whiteboard-spec)
- Meta WhatsApp Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
- Authentication templates: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
