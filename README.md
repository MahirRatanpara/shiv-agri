# 🌿 Shiv Agri - Agricultural and Landscaping Management Platform

A comprehensive role-based web platform for managing landscaping and farm operations, featuring project tracking, soil & water analysis, billing, and document management.

---

## 🎯 Project Status

### ✅ **Implemented Features**

#### Landscaping Management Module
- ✅ Complete CRUD operations for projects
- ✅ Dashboard with statistics and analytics
- ✅ Advanced filtering and search
- ✅ Contact management (multiple roles)
- ✅ Grid and list view modes
- ✅ Pagination and sorting
- ✅ Responsive design
- ✅ Full REST API backend
- ✅ Navigation integration

#### Infrastructure
- ✅ Angular 20 frontend
- ✅ Node.js + Express backend
- ✅ MongoDB 7 database
- ✅ Docker containerization
- ✅ Kubernetes ready
- ✅ CI/CD pipeline (Firebase)
- ✅ Local development setup

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Angular 20)               │
│  • Standalone Components                                │
│  • Reactive Forms                                       │
│  • HTTP Client with RxJS                                │
│  • Bootstrap 4 Styling                                  │
│  • Port: 4200                                           │
└────────────────────┬────────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────────┐
│              Backend (Node.js + Express)                │
│  • RESTful API                                          │
│  • DAO Layer Pattern                                    │
│  • Mongoose ODM                                         │
│  • CORS Enabled                                         │
│  • Port: 3000                                           │
└────────────────────┬────────────────────────────────────┘
                     │ Mongoose
┌────────────────────▼────────────────────────────────────┐
│                MongoDB 7 (Docker)                       │
│  • Projects Collection                                  │
│  • Optimized Indexes                                    │
│  • Sample Data Included                                 │
│  • Port: 27017                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker Desktop
- Git

### Start Development Environment

```bash
# 1. Start MongoDB
./scripts/start-mongodb.sh

# 2. Start Backend (new terminal)
cd backend
npm install
npm start

# 3. Start Frontend (new terminal)
cd frontend
npm install
ng serve

# 4. Access Application
open http://localhost:4200/landscaping
```

---

## 🗄️ MongoDB Setup

### Quick Commands
```bash
# Start MongoDB with sample data
./scripts/start-mongodb.sh

# Stop MongoDB
./scripts/stop-mongodb.sh

# Reset database
./scripts/reset-mongodb.sh

# Access MongoDB shell
./scripts/mongodb-shell.sh
```

**Connection:** `mongodb://localhost:27017/shiv-agri`

📖 **Complete guide:** [MONGODB_LOCAL_SETUP.md](./MONGODB_LOCAL_SETUP.md)

---

## 📚 Documentation

- **[QUICK_START.md](./QUICK_START.md)** - Get started quickly
- **[LANDSCAPING_MODULE_README.md](./LANDSCAPING_MODULE_README.md)** - Module documentation
- **[MONGODB_LOCAL_SETUP.md](./MONGODB_LOCAL_SETUP.md)** - MongoDB setup guide
- **[MONGODB_DOCKER_SUMMARY.md](./MONGODB_DOCKER_SUMMARY.md)** - Docker summary
- **[Application_Requirements.md](./Application_Requirements.md)** - Full requirements

---

## 🚧 Roadmap

### ✅ Phase 1 - Complete
- Landscaping Management Module
- MongoDB Docker setup
- Navigation integration
- Complete documentation

### 🔄 Phase 2 - Next
- File upload (AWS S3/GCS)
- Google Maps integration
- Email/WhatsApp services
- Google OAuth authentication

### 📋 Phase 3 - Future
- Farm Management
- Soil & Water Analysis
- Billing & Invoicing
- Mobile app

---

## ✅ System Status

| Component | Status | Port |
|-----------|--------|------|
| MongoDB | ✅ Working | 27017 |
| Backend API | ✅ Working | 3000 |
| Frontend | ✅ Working | 4200 |
| Docker | ✅ Ready | - |
| CI/CD | ✅ Active | - |

---

**Version:** 1.0.0
**Status:** Production Ready (Phase 1)

🚀 **Start developing:** `./scripts/start-mongodb.sh`
