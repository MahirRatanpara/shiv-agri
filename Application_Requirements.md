
# 🌿 Application Requirements Document (Technical Version)

## 1. System Overview
The application is a **role-based web platform** for managing landscaping and farm operations, including soil & water analysis, project tracking, file management, billing, and reporting.  
The platform enables **Admins**, **Users**, and **Assistants** to interact through a secure web interface built with **modern web technologies (React / Angular frontend + Node.js / Spring Boot backend)** and **cloud storage integration** for handling project assets.

---

## 2. Architecture and Stack Recommendations
- **Frontend:** React.js or Angular (SPA)  
  - Authentication via Google OAuth 2.0  
  - Role-based routing (Protected routes)  
  - Responsive UI using Tailwind or Material Design  
  - Integration with REST APIs and Cloud Storage SDKs  

- **Backend:** Node.js (Express) or Spring Boot  
  - RESTful APIs with JWT-based session management  
  - Role-based authorization middleware  
  - Integration with OAuth 2.0 provider (Google)  
  - Microservice-ready architecture (modular controllers for each domain)  

- **Database:** PostgreSQL or MongoDB  
  - Tables/Collections for Users, Farms, Projects, Files, Visits, Reports, Billing, etc.  
  - Indexes on farm name, owner, and status for search and filtering  

- **Storage:**  
  - AWS S3 / Google Cloud Storage for design files, drone videos, reports, and PDFs.  
  - CDN-enabled delivery for fast media access.  

- **Deployment Environment:**  
  - Dockerized containers orchestrated via Kubernetes / OpenShift.  
  - CI/CD using GitHub Actions or Jenkins.  

- **Integrations:**  
  - Google OAuth for login  
  - WhatsApp Cloud API for message automation  
  - SendGrid or Gmail SMTP for emails  

---

## 3. Authentication and Access Control

### 3.1 Login and Registration
| Role | Login Type | Permissions |
|------|-------------|-------------|
| **Admin** | Google OAuth + Approval | Full CRUD access to all modules |
| **User (Client)** | Google OAuth + Approval | View/edit assigned farms, view invoices/reports |
| **Assistant** | OAuth (Admin-assigned only) | Limited access to upload drone footage |

- Authentication uses **OAuth 2.0 (Google Sign-In)** and **JWT tokens** for session management.  
- Refresh tokens for maintaining long sessions without repeated login.  
- Secure logout and token revocation.  
- Registration workflows include an **Admin approval queue**.

---

## 4. Access Rules
- **Public Access:** Only Home Page (marketing + contact info).  
- **Protected Routes:** All other modules (dashboard, project pages, reports).  
- **Session Management:** Stored securely via encrypted cookies or token storage; auto-expiration after inactivity.

---

## 5. Core Functional Modules

### 5.1 Home Page (Public)
- **Static + Dynamic Content**
  - Display current and past projects (carousel or grid).
  - Photo/video gallery integrated with storage API.
- **Admin Dashboard Access**
  - Editable sections (titles, descriptions, media).
  - CMS-like interface to update text/images dynamically.  
  - Data fetched via `/api/home-content`.

---

## 6. Admin Functional Modules

### 6.1 Landscaping Management
**Objective:** Manage all landscaping projects (Completed / Running / Upcoming).

#### Features:
- Dashboard with grid and filters for:
  - Farm name, status, location, and owner.
  - Search and sorting capabilities.
- **Project CRUD APIs:**
  - `/api/landscaping/projects` – list/create projects  
  - `/api/landscaping/project/:id` – view/update project details  
- **Data Elements per Project:**
  - Map Location (Google Maps API)
  - Land info (size, coordinates, irrigation data)
  - Contact details (Owner, Architect, Workers)
- **File Management:**
  - Upload Design Files (PDF/AutoCAD/Images)
  - Upload Drone Videos
  - Upload Quotations / Invoices
- **Communication Integration:**
  - Send Quotation/Invoice via Email and WhatsApp.
- **Document Management:**
  - Convert uploaded AutoCAD files to PDF (server-side rendering via AutoCAD API or LibreCAD).

---

### 6.2 Farm Management
**Objective:** Manage clients for agricultural farm operations.

#### Features:
- Project grid view with search, filter, and sort by farm.
- CRUD for farm registration and updates.
- Visit Calendar and Reminder System:
  - Store visits with date/time and responsible personnel.
  - Integrate with Google Calendar API for scheduling.
- **Diagnosis & Prescription Module:**
  - Store diagnosis notes per visit.
  - Generate treatment/prescription PDFs.
  - Send summary via WhatsApp/email.
- **File Upload & Media Handling:**
  - Upload and view photos, reports, AutoCAD files (PDF).
- **Financial Management:**
  - Generate Quotation, Invoice, and Receipt.
  - Maintain payment status and transaction history.
  - Integrate Razorpay / Stripe for optional online payment.

---

## 7. Soil & Water Analysis Module

### 7.1 Functionality
- Upload raw image of lab reading sheet (Soil/Water).
- Use **OCR (Tesseract.js / AWS Textract)** to extract tabular data.
- Apply pre-fed formulas for parameter calculations.

### 7.2 Reports
- **Water Report:**
  - Generate computed parameters (e.g., pH, EC, TDS).
- **Soil Report:**
  - Macro elements (N, P, K).
  - Micro elements (Zn, Fe, Mn, Cu).
- Store results as JSON + PDF output.
- Option to upload 3rd-party reports and **rebrand** with custom header/footer templates.

### 7.3 Bilingual Support
- All reports generated in **English and Gujarati**.
- Use language translation API or static text mapping.

---

## 8. Custom Billing & Payments

### 8.1 Invoice Management
- Auto-generated invoices linked to project/farm.
- Templates for quotation, invoice, and receipt (customizable letterhead).
- Payment tracking: PAID / UNPAID status.
- Batch billing and bulk mail dispatch.
- REST APIs:
  - `/api/billing/invoice/:id`  
  - `/api/billing/status/:id`  
  - `/api/billing/send/:channel` (email/WhatsApp)

---

## 9. Letter Pad Printing Module
- Generate digital letter pads using voice typing (Speech-to-Text API).  
- Custom fields: date, recipient, subject, body, signature.  
- Template storage and print preview.  
- Maintain a history of generated letters.  
- Send generated PDFs via WhatsApp or Email.

---

## 10. Technical & Non-Functional Requirements

| Category | Details |
|-----------|----------|
| **Security** | OAuth 2.0, JWT, HTTPS, data encryption, role-based access control |
| **Scalability** | Modular microservices, load-balanced API gateway |
| **Performance** | Caching of static assets (CDN), indexed database queries |
| **Logging & Monitoring** | ELK Stack / Prometheus for metrics and error tracking |
| **Backup & Recovery** | Daily cloud backup of DB + storage snapshots |
| **Localization** | Gujarati and English UI toggle |
| **Notifications** | Email/WhatsApp integration for reminders, billing, and approvals |

---

## 11. Suggested API Endpoints Summary
| Module | Endpoint | Method | Description |
|---------|-----------|--------|-------------|
| Auth | `/api/auth/google` | POST | Google OAuth login |
| Auth | `/api/auth/logout` | POST | Logout user |
| Projects | `/api/landscaping/projects` | GET/POST | List or create projects |
| Projects | `/api/landscaping/project/:id` | GET/PUT | View/update project details |
| Files | `/api/upload/:type` | POST | Upload photos/videos/reports |
| Billing | `/api/billing/invoice/:id` | GET/PUT | Retrieve or update billing details |
| Analysis | `/api/analysis/soil` | POST | Upload and process soil report |
| Analysis | `/api/analysis/water` | POST | Upload and process water report |
| Letters | `/api/letters/create` | POST | Generate letter pad document |

---

## 12. Future Enhancements
- Mobile app version with offline data sync.
- AI-based crop diagnosis from images.
- WhatsApp chatbot for project updates and reminders.
- Integration with IoT-based soil sensors.
