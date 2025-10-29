@echo off
REM MongoDB Local Development Setup for Windows

echo ========================================
echo   Shiv Agri - MongoDB Local Setup
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo Error: Docker is not running
    echo Please start Docker Desktop and try again
    exit /b 1
)

echo Starting MongoDB container...
echo.

REM Start MongoDB using docker-compose
docker-compose -f docker-compose.local.yml up -d

REM Wait for MongoDB to be ready
echo.
echo Waiting for MongoDB to be ready...
timeout /t 5 /nobreak >nul

REM Check if container is running
docker ps | findstr shiv-agri-mongodb-local >nul
if errorlevel 1 (
    echo.
    echo Failed to start MongoDB
    echo Check logs with: docker-compose -f docker-compose.local.yml logs
    exit /b 1
)

echo.
echo MongoDB is running successfully!
echo.
echo Connection Details:
echo   Host: localhost
echo   Port: 27017
echo   Database: shiv-agri
echo   Connection String: mongodb://localhost:27017/shiv-agri
echo.
echo Sample Projects Loaded:
echo   1. Green Valley Landscaping (Ahmedabad) - RUNNING
echo   2. Rose Garden Development (Surat) - COMPLETED
echo   3. Urban Terrace Garden (Vadodara) - UPCOMING
echo.
echo Useful Commands:
echo   View logs:        docker logs -f shiv-agri-mongodb-local
echo   Stop MongoDB:     scripts\stop-mongodb.bat
echo   Connect CLI:      mongosh mongodb://localhost:27017/shiv-agri
echo   View containers:  docker ps
echo.
echo Ready for development!
