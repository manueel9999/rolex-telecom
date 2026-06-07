@echo off
title Rolex Telecom Agent

echo ============================================
echo   Rolex Telecom - Windows Agent
echo ============================================
echo.

REM Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found!
    echo    Download from https://python.org/downloads
    echo    Check "Add Python to PATH" during install!
    pause
    exit /b 1
)

echo [OK] Python found:
python --version
echo.

REM Install dependencies
echo [INFO] Installing dependencies...
pip install websockets pywin32 --quiet --disable-pip-version-check
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Install failed
    echo Try: pip install websockets pywinauto pywin32
    pause
    exit /b 1
)

echo [OK] Dependencies installed
echo.

REM Check Phone Link
echo [INFO] Make sure Phone Link (Svyaz s telefonom) is
echo        running and connected to your phone.
echo.

echo ============================================
echo   Starting agent...
echo   Server: ws://72.56.236.204:3000/ws
echo   Device: 57NvLjFgq4
echo ============================================
echo.

python rolex_agent.py %*

echo.
echo [INFO] Agent stopped
pause
