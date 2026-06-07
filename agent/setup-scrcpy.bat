@echo off
title Rolex Telecom - scrcpy Setup

echo ============================================
echo   Rolex Telecom - scrcpy Setup
echo   Phone screen mirroring
echo ============================================
echo.

:: Check adb
where adb >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] adb not in PATH, will use bundled version.
    echo.
)

:: Download scrcpy if not present
if exist "scrcpy" (
    echo [1/2] scrcpy folder found, skipping download.
) else (
    echo [1/2] Downloading scrcpy (pre-built, no compilation needed)...
    echo.
    
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/Genymobile/scrcpy/releases/download/v3.2/scrcpy-win64-v3.2.zip' -OutFile 'scrcpy.zip'"
    
    if not exist "scrcpy.zip" (
        echo [ERROR] Download failed!
        echo Download manually:
        echo https://github.com/Genymobile/scrcpy/releases
        echo Extract to "scrcpy" folder next to this script.
        pause
        exit /b 1
    )
    
    echo Extracting...
    powershell -Command "Expand-Archive -Path 'scrcpy.zip' -DestinationPath '.' -Force"
    
    :: Rename extracted folder
    for /d %%D in (scrcpy-win64*) do rename "%%D" "scrcpy"
    
    del "scrcpy.zip" 2>nul
    echo [OK] scrcpy downloaded and extracted.
)

echo.

:: Check phone connection
echo [2/2] Checking phone connection...
scrcpy\adb.exe devices -l
echo.
echo ============================================
echo.
echo READY! Choose how to start:
echo.
echo   1 - Mirror phone screen (window on this PC)
echo   2 - Mirror + audio forwarding
echo   3 - Mirror phone screen (stay open)
echo.
echo After starting, share this window via
echo VDO.ninja to let the operator see it.
echo ============================================
echo.

:menu
set /p choice="Enter choice (1/2/3): "

if "%choice%"=="1" (
    echo Starting scrcpy...
    scrcpy\scrcpy.exe --window-title "Rolex Phone" --stay-awake
    goto end
)
if "%choice%"=="2" (
    echo Starting scrcpy with audio...
    scrcpy\scrcpy.exe --window-title "Rolex Phone" --stay-awake --audio-codec=aac
    goto end
)
if "%choice%"=="3" (
    echo Starting scrcpy (stays open)...
    scrcpy\scrcpy.exe --window-title "Rolex Phone" --stay-awake --turn-screen-off
    goto end
)

echo Invalid choice, try again.
goto menu

:end
echo.
echo scrcpy closed.
pause
