@echo off
title Cognito Launcher
echo =====================================================================
echo    COGNITO - Offline Document Intelligence & Search Suite
echo =====================================================================
echo.

echo [1/3] Stopping any old Cognito server instances...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [2/3] Starting Cognito local sync and QA server in background...
start /b python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

echo [3/3] Launching web interface in default browser...
timeout /t 3 /nobreak >nul
start http://localhost:8000

echo.
echo Cognito is running successfully!
echo You can minimize this window. Close this terminal window to stop the server.
echo.
pause
