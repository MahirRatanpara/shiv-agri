# Notification Service

Stateless Spring Boot microservice that sends WhatsApp messages (via WhatsApp Cloud API) and Gmail emails (via OAuth2 + SMTP) for the Shiv-Agri platform.

- **Port:** `8082`
- **Stack:** Java 17, Spring Boot 3.2.5
- **Storage:** None (stateless — no database)
- **Auth:** static API key in `X-API-Key` header
- **Container:** `shivagri-notification`
- **Image:** `${DOCKERHUB_USERNAME}/shiv-agri-notification`

---

## 1. Features

| Capability | Endpoint | Notes |
|---|---|---|
| Send WhatsApp text | `POST /api/notifications/whatsapp/text` | Up to 4096 chars |
| Send WhatsApp media | `POST /api/notifications/whatsapp/media` | image / video / audio / document via public URL |
| Send WhatsApp template | `POST /api/notifications/whatsapp/template` | Required for OTPs and unsolicited messages |
| Send email (plain or HTML) | `POST /api/notifications/email` | JSON body, no attachments |
| Send email with attachments | `POST /api/notifications/email/with-attachments` | `multipart/form-data` |
| Health probe | `GET /actuator/health` | Unauthenticated |

Every endpoint supports `?async=true`. When `async=true` the service returns `202 Accepted` immediately and processes the send on a background thread pool (`notification-async` executor).

---

## 2. Configuration

All config is via environment variables (12-factor). No properties files need to be touched.

### Required

| Variable | Purpose |
|---|---|
| `NOTIFICATION_API_KEY` | Static API key callers must send as `X-API-Key`. Generate with `openssl rand -hex 32`. |

### WhatsApp Cloud API (required if WhatsApp endpoints are used)

| Variable | Default | Purpose |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | — | The phone number ID from Meta Business Manager |
| `WHATSAPP_ACCESS_TOKEN` | — | System user permanent token (`whatsapp_business_messaging` scope) |
| `WHATSAPP_API_VERSION` | `v21.0` | Graph API version |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | `91` | Prefixed to 10-digit numbers (set to empty string to disable) |
| `WHATSAPP_API_BASE_URL` | `https://graph.facebook.com` | Override only for testing |

### Gmail OAuth (required if email endpoints are used)

| Variable | Default | Purpose |
|---|---|---|
| `GMAIL_FROM_ADDRESS` | — | The Gmail/Workspace address that will appear as the sender |
| `GMAIL_FROM_NAME` | `Shiv-Agri` | Display name on outgoing mail |
| `GMAIL_OAUTH_CLIENT_ID` | — | OAuth2 client ID from Google Cloud Console |
| `GMAIL_OAUTH_CLIENT_SECRET` | — | OAuth2 client secret |
| `GMAIL_OAUTH_REFRESH_TOKEN` | — | Long-lived refresh token for `GMAIL_FROM_ADDRESS` |
| `GMAIL_SMTP_HOST` | `smtp.gmail.com` | |
| `GMAIL_SMTP_PORT` | `587` | STARTTLS port |

### Async tuning (optional)

| Variable | Default |
|---|---|
| `NOTIFICATION_ASYNC_CORE_POOL_SIZE` | `4` |
| `NOTIFICATION_ASYNC_MAX_POOL_SIZE` | `16` |
| `NOTIFICATION_ASYNC_QUEUE_CAPACITY` | `200` |

---

## 3. Setting up WhatsApp Cloud APIx

1. Create a Meta Business account: <https://business.facebook.com/>.
2. In Meta for Developers, create a new app of type **Business** → add the **WhatsApp** product.
3. Under WhatsApp → API Setup, you'll see a **Phone Number ID** and a temporary access token. Note the phone number ID — this is `WHATSAPP_PHONE_NUMBER_ID`.
4. For production, create a **System User** in Business Manager, grant it access to the WhatsApp Business Account with the `whatsapp_business_messaging` permission, and generate a **permanent token**. That is `WHATSAPP_ACCESS_TOKEN`.
5. Add at least one recipient phone number to "Allowed Test Numbers" until your business verification is complete.
6. (For free-form messages outside the 24-hour customer window, you must use approved message templates — out of scope for this service's v1, which sends free-form text/media.)

---

## 4. Setting up Gmail OAuth

The service signs in to SMTP using XOAUTH2 with an access token that is refreshed from a stored refresh token.

1. Open Google Cloud Console → create or pick a project.
2. Enable the **Gmail API** for that project.
3. Configure the **OAuth consent screen**:
   - User type: **External** (or Internal if Workspace)
   - Add scope: `https://mail.google.com/`
   - Add the sending Gmail account as a test user (only needed while the consent screen is in "Testing").
4. Create **OAuth client ID** credentials → application type **Desktop app**. Save the **Client ID** and **Client secret**.
5. Obtain a refresh token for the sending account. The easiest path is the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
   1. Click the gear ⚙ → check **Use your own OAuth credentials** → paste the client ID and secret.
   2. In Step 1, scroll to "Gmail API v1" and select `https://mail.google.com/`. Click **Authorize APIs**, sign in as the sender Gmail account, allow access.
   3. In Step 2, click **Exchange authorization code for tokens**. Copy the **refresh_token** — that is `GMAIL_OAUTH_REFRESH_TOKEN`.
6. Set `GMAIL_FROM_ADDRESS` to the address you authorized in step 5. Refresh tokens are bound to that specific Google account.

Access tokens are cached in-memory and refreshed automatically ~60 seconds before they expire. If SMTP auth fails the service invalidates the cache and retries the send once.

---

## 5. API Reference

All requests must include:

```
Content-Type: application/json   (or multipart/form-data for attachments)
X-API-Key: <NOTIFICATION_API_KEY>
```

### 5.1 Send WhatsApp text

`POST /api/notifications/whatsapp/text?async=false`

```json
{
  "to": "9876543210",
  "message": "Your soil test report is ready.",
  "previewUrl": false
}
```

- `to`: 10-digit local number (default country code prefixed automatically) or full international format.
- `previewUrl`: optional. When `true`, WhatsApp generates a link preview for URLs in the body.

### 5.2 Send WhatsApp media

`POST /api/notifications/whatsapp/media?async=false`

```json
{
  "to": "9876543210",
  "mediaType": "image",
  "mediaUrl": "https://cdn.shiv-agri.com/reports/abc.pdf",
  "caption": "Optional caption",
  "filename": "soil-report.pdf"
}
```

- `mediaType`: `image`, `video`, `audio`, or `document`.
- `mediaUrl`: must be a publicly reachable HTTPS URL — WhatsApp Cloud API fetches it server-side.
- `caption`: ignored for `audio`.
- `filename`: only honored for `document`.

### 5.3 Send email (no attachments)

`POST /api/notifications/email?async=false`

```json
{
  "to": ["customer@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Soil test results — Plot #42",
  "body": "<p>Hi,</p><p>Your report is attached.</p>",
  "html": true
}
```

### 5.3a Send WhatsApp template (OTPs and out-of-window messages)

`POST /api/notifications/whatsapp/template?async=false`

WhatsApp Cloud API only delivers free-form text/media to users who are inside an active 24-hour customer-service window. For OTPs to new users (or any unsolicited message), you **must** use a pre-approved message template from Meta Business Manager.

```json
{
  "to": "+919876543210",
  "templateName": "otp_login",
  "languageCode": "en",
  "bodyParameters": ["4821"],
  "buttonOtpCode": "4821"
}
```

- `templateName` — exact name of an *Approved* template in your WhatsApp Business Account.
- `languageCode` — must match the template's approved language (`en`, `hi`, `gu`, etc.).
- `bodyParameters` — positional fills for `{{1}}, {{2}} …` in the template body. Order matters.
- `buttonOtpCode` — optional. For Authentication-category templates with a "Copy code" URL button, pass the OTP here as well. Omit for templates without a button.

**Creating an OTP template (one-time, per WhatsApp Business Account):**

1. Meta Business Manager → WhatsApp Manager → Message templates → **Create template**
2. Category: **Authentication**
3. Name: `otp_login`, Language: `English`
4. Body: `{{1}} is your verification code. For your security, do not share this code.`
5. Add a "Copy code" URL button
6. Submit — Authentication templates are typically approved within minutes.

See `docs/PHONE_OTP_LOGIN_GUIDE.md` for the full end-to-end OTP-login wiring.

### 5.4 Send email with attachments

`POST /api/notifications/email/with-attachments?async=false`

`Content-Type: multipart/form-data`

Two parts:

| Part name | Content-Type | Purpose |
|---|---|---|
| `payload` | `application/json` | Same JSON as 5.3 |
| `attachments` | one or more files | Repeated form field |

Example with `curl`:

```bash
curl -X POST 'http://localhost:8082/api/notifications/email/with-attachments' \
  -H 'X-API-Key: '"$NOTIFICATION_API_KEY" \
  -F 'payload={"to":["customer@example.com"],"subject":"Report","body":"See attached","html":false};type=application/json' \
  -F 'attachments=@/tmp/soil-report.pdf' \
  -F 'attachments=@/tmp/photo.jpg'
```

### 5.5 Response shapes

**Sync success (200):**

```json
{
  "requestId": "8c1f...",
  "status": "SENT",
  "channel": "whatsapp",
  "providerMessageId": "wamid.HBgM...",
  "message": "Message delivered to provider",
  "timestamp": "2026-05-22T10:15:30Z"
}
```

**Async accepted (202):**

```json
{
  "requestId": "8c1f...",
  "status": "ACCEPTED",
  "channel": "email",
  "providerMessageId": null,
  "message": "Send queued for asynchronous delivery",
  "timestamp": "2026-05-22T10:15:30Z"
}
```

**Error (4xx/5xx):**

```json
{
  "error": "PROVIDER_ERROR",
  "message": "WhatsApp API rejected the request: 400 BAD_REQUEST",
  "timestamp": "2026-05-22T10:15:30Z"
}
```

Error codes: `VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED`, `PAYLOAD_TOO_LARGE`, `PROVIDER_ERROR`, `NOTIFICATION_ERROR`, `CONFIG_ERROR`, `INTERNAL_ERROR`.

---

## 6. Running locally

### With docker-compose

The service is already wired into `docker-compose.yml`. Create or extend the repo-root `.env`:

```bash
NOTIFICATION_API_KEY=dev-api-key-change-me
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
GMAIL_FROM_ADDRESS=you@gmail.com
GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
GMAIL_OAUTH_REFRESH_TOKEN=...
```

Then:

```bash
docker compose up -d notification-service
docker compose logs -f notification-service
```

Service is reachable on `http://localhost:8082`.

### Without Docker

```bash
cd notification-service
./mvnw spring-boot:run
```

Export the same environment variables in your shell first.

### Smoke test

```bash
curl -s http://localhost:8082/actuator/health

curl -X POST 'http://localhost:8082/api/notifications/whatsapp/text' \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $NOTIFICATION_API_KEY" \
  -d '{"to":"9876543210","message":"Hello from Shiv-Agri"}'
```

---

## 7. CI / CD

### Pipeline

The service uses the same reusable workflow as `media-service`:

- **Trigger:** push to `main` touching `notification-service/**`, or manual `workflow_dispatch`.
- **Workflow file:** `.github/workflows/deploy-notification.yml` → calls `.github/workflows/deploy-service.yml`.
- **Steps:**
  1. Build the Docker image with Buildx (registry cache).
  2. Push to Docker Hub as `${DOCKERHUB_USERNAME}/shiv-agri-notification:latest` plus a `main-<sha>` tag.
  3. SSH into the Hostinger VPS, `docker compose pull notification-service`, `up -d --no-deps notification-service`.

### Required GitHub Actions secrets

Already configured at the repo level — these are shared with the other services:

| Secret | Purpose |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub user |
| `DOCKERHUB_TOKEN` | Docker Hub access token (write) |
| `SERVER_SSH_KEY` | Private key for deploy user |
| `SERVER_USER` | SSH user on Hostinger VPS |
| `SERVER_HOST` | VPS host / IP |

### Production environment file

On the VPS, `/var/www/shiv-agri/.env` must contain the runtime variables consumed by `docker-compose.prod.yml`:

```bash
# Notification service
NOTIFICATION_API_KEY=<32-byte random hex>
WHATSAPP_PHONE_NUMBER_ID=<from Meta>
WHATSAPP_ACCESS_TOKEN=<permanent system-user token>
WHATSAPP_API_VERSION=v21.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91
GMAIL_FROM_ADDRESS=noreply@yourdomain.com
GMAIL_FROM_NAME=Shiv-Agri
GMAIL_OAUTH_CLIENT_ID=<google client id>
GMAIL_OAUTH_CLIENT_SECRET=<google client secret>
GMAIL_OAUTH_REFRESH_TOKEN=<refresh token>
```

After adding new variables, on the server:

```bash
cd /var/www/shiv-agri
docker compose -f docker-compose.prod.yml up -d --no-deps notification-service
```

### Manual rollback

```bash
ssh deploy@<server>
cd /var/www/shiv-agri
docker compose -f docker-compose.prod.yml pull notification-service
# or pin to a specific tag:
docker pull <user>/shiv-agri-notification:main-<sha>
docker tag <user>/shiv-agri-notification:main-<sha> <user>/shiv-agri-notification:latest
docker compose -f docker-compose.prod.yml up -d --no-deps notification-service
```

---

## 8. Operational notes

- **Stateless:** no DB, no in-flight retries beyond the one Gmail token-refresh retry. If you need at-least-once delivery, route through the existing `api` service and persist there, or extend this service to write a log collection.
- **Async failure handling:** async failures are logged but not retried and not surfaced to the caller. For high-value notifications use sync mode and let the caller decide on retry policy.
- **Health endpoint:** `/actuator/health` is the only unauthenticated path; the Docker `HEALTHCHECK` polls it.
- **Logging:** every request gets a `requestId` (UUID) emitted on the first log line; grep on it to trace a single send end-to-end.
- **No PII in logs:** message bodies are logged by length only, not content. Recipient phone numbers and email addresses are logged (operationally necessary). Adjust `logging.level.com.shivagri.notification` if you need quieter logs.

---

## 9. Layout

```
notification-service/
├── Dockerfile
├── pom.xml
├── mvnw, .mvn/                                # Maven wrapper
├── README.md                                  # this file
└── src/main/
    ├── java/com/shivagri/notification/
    │   ├── NotificationServiceApplication.java
    │   ├── config/                            # @ConfigurationProperties + beans
    │   ├── security/ApiKeyAuthFilter.java
    │   ├── controller/                        # WhatsApp + Email REST controllers
    │   ├── service/                           # WhatsAppService, EmailService, GmailOAuthTokenService
    │   └── exception/                         # GlobalExceptionHandler + custom exceptions
    └── resources/application.yml
```
