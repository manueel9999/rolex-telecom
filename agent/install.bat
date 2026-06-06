@echo off
chcp 65001 >nul 2>&1
title Rolex Telecom Agent

echo ==========================================
echo   Rolex Telecom - Windows Agent Setup
echo ==========================================
echo.

REM Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python ne najden!
    echo    Skachajte s https://python.org/downloads
    echo    Pri ustanovke otmet'te "Add Python to PATH"
    pause
    exit /b 1
)

echo [OK] Python najden
python --version
echo.

REM Install dependencies
echo [INFO] Ustanovka zavisimostej...
pip install websockets pywinauto pywin32 --quiet
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Oshibka ustanovki
    pause
    exit /b 1
)

echo [OK] Zavisimosti ustanovleny
echo.
echo ==========================================
echo   Zapusk agenta...
echo ==========================================
echo.

python rolex_agent.py %*

echo.
echo [INFO] Agent ostanovlen
pause
