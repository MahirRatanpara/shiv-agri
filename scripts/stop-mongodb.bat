@echo off
REM Stop MongoDB for Windows

echo ========================================
echo   Stopping MongoDB
echo ========================================
echo.

echo Stopping MongoDB container...
docker-compose -f docker-compose.local.yml down

echo.
echo MongoDB stopped
echo.
echo To start again: scripts\start-mongodb.bat
echo To remove data: docker volume rm shiv-agri_mongodb_data_local
echo.
