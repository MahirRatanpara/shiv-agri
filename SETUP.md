# Shiv Agri Setup Guide

## Prerequisites
- Node.js 18+
- Docker & Docker Compose
- kubectl (for Kubernetes)
- MongoDB (optional for local development)

## Local Development

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### MongoDB Local Setup
```bash
mongod --dbpath /path/to/data
mongosh < database/init-mongo.js
```

## Docker Setup

### Build Images
```bash
docker build -t shiv-agri-backend:latest ./backend
docker build -t shiv-agri-frontend:latest ./frontend
```

### Run with Docker Compose
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

## Kubernetes Deployment

### Create Namespace
```bash
kubectl apply -f infra/namespace.yaml
```

### Deploy MongoDB
```bash
kubectl apply -f infra/mongodb-deployment.yaml -n shiv-agri
```

### Deploy Backend
```bash
kubectl apply -f infra/backend-deployment.yaml -n shiv-agri
```

### Deploy Frontend
```bash
kubectl apply -f infra/frontend-deployment.yaml -n shiv-agri
```

### Check Status
```bash
kubectl get pods -n shiv-agri
kubectl get services -n shiv-agri
```

### Initialize Database
```bash
kubectl exec -it <mongodb-pod-name> -n shiv-agri -- mongosh shiv-agri
```
Then run the commands from `database/init-mongo.js`

## Access Application

### Docker Compose
- Frontend: http://localhost
- Backend: http://localhost:3000
- MongoDB: localhost:27017

### Kubernetes
```bash
kubectl get service frontend -n shiv-agri
```
Use the external IP or LoadBalancer address

## Environment Variables

### Backend
- `PORT`: Server port (default: 3000)
- `MONGODB_URI`: MongoDB connection string
- `NODE_ENV`: Environment (development/production)
