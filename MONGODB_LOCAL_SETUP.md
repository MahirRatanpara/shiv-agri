# 🗄️ MongoDB Local Development Setup

Complete guide for running MongoDB locally for Shiv Agri development using Docker.

---

## 📋 Prerequisites

- ✅ Docker Desktop installed and running
- ✅ Docker Compose installed (comes with Docker Desktop)
- ✅ Terminal/Command Line access

---

## 🚀 Quick Start

### Option 1: Using Helper Scripts (Recommended)

```bash
# Start MongoDB with sample data
./scripts/start-mongodb.sh

# Stop MongoDB
./scripts/stop-mongodb.sh

# Reset database (delete all data and reload samples)
./scripts/reset-mongodb.sh

# Access MongoDB shell
./scripts/mongodb-shell.sh
```

### Option 2: Using Docker Compose Directly

```bash
# Start MongoDB
docker-compose -f docker-compose.local.yml up -d

# Stop MongoDB
docker-compose -f docker-compose.local.yml down

# View logs
docker-compose -f docker-compose.local.yml logs -f

# Restart
docker-compose -f docker-compose.local.yml restart
```

### Option 3: Using Docker Commands

```bash
# Build custom MongoDB image
cd database
docker build -t shiv-agri-mongodb .

# Run container
docker run -d \
  --name shiv-agri-mongodb-local \
  -p 27017:27017 \
  -v mongodb_data:/data/db \
  shiv-agri-mongodb

# Stop container
docker stop shiv-agri-mongodb-local

# Remove container
docker rm shiv-agri-mongodb-local
```

---

## 📂 Project Structure

```
shiv-agri/
├── docker-compose.local.yml          # MongoDB setup for local dev
├── database/
│   ├── Dockerfile                    # Custom MongoDB image
│   └── init-mongo.js                 # Database initialization script
└── scripts/
    ├── start-mongodb.sh              # Start MongoDB
    ├── stop-mongodb.sh               # Stop MongoDB
    ├── reset-mongodb.sh              # Reset database
    └── mongodb-shell.sh              # Access MongoDB shell
```

---

## 🔧 Configuration Details

### Docker Compose Configuration

**File:** `docker-compose.local.yml`

```yaml
services:
  mongodb:
    image: mongo:7
    container_name: shiv-agri-mongodb-local
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: shiv-agri
    volumes:
      - ./database/init-mongo.js:/docker-entrypoint-initdb.d/init-mongo.js:ro
      - mongodb_data_local:/data/db
```

**Features:**
- ✅ MongoDB 7 (latest stable)
- ✅ Auto-initialization with sample data
- ✅ Data persistence with named volumes
- ✅ Health checks configured
- ✅ Automatic restart on failure

### Connection Details

| Parameter | Value |
|-----------|-------|
| **Host** | `localhost` |
| **Port** | `27017` |
| **Database** | `shiv-agri` |
| **Connection String** | `mongodb://localhost:27017/shiv-agri` |
| **Container Name** | `shiv-agri-mongodb-local` |

### Environment Variables

Update `backend/.env`:
```bash
MONGODB_URI=mongodb://localhost:27017/shiv-agri
```

---

## 📊 Sample Data

The database is automatically initialized with 3 sample projects:

### 1. Green Valley Landscaping
- **Location:** Ahmedabad, Gujarat
- **Status:** RUNNING
- **Land Size:** 5000 sqft
- **Owner:** Rajesh Patel (9876543210)

### 2. Rose Garden Development
- **Location:** Surat, Gujarat
- **Status:** COMPLETED
- **Land Size:** 2 acres
- **Owner:** Priya Shah (9123456789)

### 3. Urban Terrace Garden
- **Location:** Vadodara, Gujarat
- **Status:** UPCOMING
- **Land Size:** 1500 sqft
- **Owner:** Neha Desai (9345678901)

---

## 🛠️ Common Operations

### Start MongoDB
```bash
./scripts/start-mongodb.sh
```

**Output:**
```
========================================
  Shiv Agri - MongoDB Local Setup
========================================

Starting MongoDB container...
Waiting for MongoDB to be ready...

✓ MongoDB is running successfully!

Connection Details:
  Host: localhost
  Port: 27017
  Database: shiv-agri
  Connection String: mongodb://localhost:27017/shiv-agri

Ready for development! 🚀
```

### Stop MongoDB
```bash
./scripts/stop-mongodb.sh
```

### Reset Database
```bash
./scripts/reset-mongodb.sh

# Prompts for confirmation:
# WARNING: This will delete all data in the database!
# Are you sure you want to continue? (yes/no): yes
```

### Access MongoDB Shell
```bash
./scripts/mongodb-shell.sh

# Inside the shell:
> show collections
> db.projects.find().pretty()
> db.projects.countDocuments()
> exit
```

---

## 🔍 Verification Commands

### Check if MongoDB is Running
```bash
docker ps | grep shiv-agri-mongodb-local
```

### View Logs
```bash
docker logs -f shiv-agri-mongodb-local
```

### Check Health Status
```bash
docker inspect shiv-agri-mongodb-local --format='{{.State.Health.Status}}'
# Should return: healthy
```

### Test Connection
```bash
# Using mongosh (if installed locally)
mongosh mongodb://localhost:27017/shiv-agri

# Using Docker
docker exec -it shiv-agri-mongodb-local mongosh mongodb://localhost:27017/shiv-agri
```

---

## 📝 MongoDB Shell Commands

### Basic Operations
```javascript
// Switch to shiv-agri database
use shiv-agri

// Show all collections
show collections

// Count documents
db.projects.countDocuments()

// Find all projects
db.projects.find().pretty()

// Find projects by status
db.projects.find({ status: "RUNNING" }).pretty()

// Find projects by city
db.projects.find({ "location.city": "Ahmedabad" }).pretty()

// Get project statistics
db.projects.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])

// Search projects by name
db.projects.find({
  projectName: { $regex: "Garden", $options: "i" }
}).pretty()
```

### Indexes
```javascript
// View all indexes
db.projects.getIndexes()

// Create custom index
db.projects.createIndex({ "location.city": 1, status: 1 })
```

### Data Management
```javascript
// Insert new project
db.projects.insertOne({
  projectName: "Test Project",
  status: "UPCOMING",
  location: {
    address: "123 Test St",
    city: "Rajkot",
    state: "Gujarat",
    pincode: "360001",
    coordinates: { latitude: 22.3039, longitude: 70.8022 }
  },
  landInfo: {
    size: 2000,
    unit: "sqft"
  },
  contacts: [{
    name: "Test User",
    phone: "9999999999",
    role: "OWNER",
    isPrimary: true
  }],
  createdAt: new Date(),
  updatedAt: new Date()
})

// Update project
db.projects.updateOne(
  { projectName: "Test Project" },
  { $set: { status: "RUNNING" } }
)

// Delete project
db.projects.deleteOne({ projectName: "Test Project" })

// Delete all projects (careful!)
db.projects.deleteMany({})

// Drop collection
db.projects.drop()
```

---

## 🐛 Troubleshooting

### Issue: Port 27017 Already in Use

**Solution 1 - Find and stop the process:**
```bash
# macOS/Linux
lsof -ti:27017 | xargs kill -9

# Windows
netstat -ano | findstr :27017
taskkill /PID <PID> /F
```

**Solution 2 - Use different port:**
```yaml
# In docker-compose.local.yml
ports:
  - "27018:27017"

# Update backend/.env
MONGODB_URI=mongodb://localhost:27018/shiv-agri
```

### Issue: Container Won't Start

**Check Docker status:**
```bash
docker info
```

**Check logs:**
```bash
docker-compose -f docker-compose.local.yml logs
```

**Remove and restart:**
```bash
docker-compose -f docker-compose.local.yml down
docker-compose -f docker-compose.local.yml up -d
```

### Issue: Data Not Persisting

**Check volumes:**
```bash
docker volume ls | grep mongodb

# Inspect volume
docker volume inspect shiv-agri_mongodb_data_local
```

### Issue: Init Script Not Running

**Rebuild container:**
```bash
docker-compose -f docker-compose.local.yml down -v
docker-compose -f docker-compose.local.yml up -d
```

**Check if script was executed:**
```bash
docker exec -it shiv-agri-mongodb-local mongosh mongodb://localhost:27017/shiv-agri --eval "db.projects.countDocuments()"
# Should return: 3
```

---

## 🗑️ Clean Up

### Stop and Remove Container
```bash
docker-compose -f docker-compose.local.yml down
```

### Remove All Data (Volumes)
```bash
docker-compose -f docker-compose.local.yml down -v
# OR
docker volume rm shiv-agri_mongodb_data_local
```

### Remove MongoDB Image
```bash
docker rmi mongo:7
```

### Complete Cleanup
```bash
# Stop and remove everything
docker-compose -f docker-compose.local.yml down -v --rmi all

# Remove all unused volumes
docker volume prune -f

# Remove all unused containers
docker container prune -f
```

---

## 📊 Data Backup & Restore

### Backup Database
```bash
# Backup to file
docker exec shiv-agri-mongodb-local mongodump \
  --db=shiv-agri \
  --out=/data/backup

# Copy backup to host
docker cp shiv-agri-mongodb-local:/data/backup ./backup
```

### Restore Database
```bash
# Copy backup to container
docker cp ./backup shiv-agri-mongodb-local:/data/restore

# Restore from backup
docker exec shiv-agri-mongodb-local mongorestore \
  --db=shiv-agri \
  /data/restore/shiv-agri
```

---

## 🔐 Security Notes

### For Local Development (Current Setup)
- ✅ No authentication required (localhost only)
- ✅ Not exposed to external networks
- ✅ Data persists in named Docker volumes

### For Production Deployment
Add authentication:
```yaml
environment:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: securepassword
  MONGO_INITDB_DATABASE: shiv-agri
```

Update connection string:
```bash
MONGODB_URI=mongodb://admin:securepassword@localhost:27017/shiv-agri?authSource=admin
```

---

## 📈 Performance Tuning

### Monitor Performance
```bash
# Connect to MongoDB shell
./scripts/mongodb-shell.sh

# Check server status
db.serverStatus()

# Check collection stats
db.projects.stats()

# Show current operations
db.currentOp()
```

### Optimize Indexes
```javascript
// Analyze query performance
db.projects.find({ status: "RUNNING" }).explain("executionStats")

// Rebuild indexes
db.projects.reIndex()
```

---

## 🔗 Integration with Backend

### Backend Configuration

**File:** `backend/.env`
```bash
PORT=3000
MONGODB_URI=mongodb://localhost:27017/shiv-agri
NODE_ENV=development
```

### Test Connection from Backend
```bash
cd backend
npm start

# Should see:
# Connected to MongoDB
# Server is running on port 3000
```

### Test API Endpoints
```bash
# Get all projects
curl http://localhost:3000/api/landscaping/projects

# Get statistics
curl http://localhost:3000/api/landscaping/stats

# Should return sample data
```

---

## 📚 Additional Resources

### MongoDB Documentation
- [MongoDB Manual](https://docs.mongodb.com/manual/)
- [Docker Hub - MongoDB](https://hub.docker.com/_/mongo)
- [Mongoose Documentation](https://mongoosejs.com/docs/)

### Docker Documentation
- [Docker Compose](https://docs.docker.com/compose/)
- [Docker Volumes](https://docs.docker.com/storage/volumes/)

---

## ✅ Verification Checklist

- [ ] Docker Desktop is running
- [ ] MongoDB container is running
- [ ] Can connect to MongoDB on port 27017
- [ ] Database has 3 sample projects
- [ ] Backend can connect to MongoDB
- [ ] API endpoints return data
- [ ] Frontend can fetch projects
- [ ] Data persists after container restart

---

## 🎯 Next Steps

1. ✅ **MongoDB is running** - You're ready to develop!
2. 🔄 **Start Backend** - `cd backend && npm start`
3. 🔄 **Start Frontend** - `cd frontend && ng serve`
4. 🎉 **Access Application** - http://localhost:4200/landscaping

---

**MongoDB local development environment is ready! 🚀**

For questions or issues, check the troubleshooting section or review Docker logs.
