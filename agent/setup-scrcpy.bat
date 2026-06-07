@echo off
chcp 65001 >nul 2>&1
title Rolex Telecom — ws-scrcpy Setup

echo ============================================
echo   Rolex Telecom — ws-scrcpy Setup
echo   Экран телефона через браузер
echo ============================================
echo.

:: Check prerequisites
where adb >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] adb не найден в PATH!
    echo Установите Android Platform Tools:
    echo https://developer.android.com/tools/releases/platform-tools
    echo.
    echo Или добавьте папку с adb.exe в переменную PATH
    pause
    exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Установите Node.js: https://nodejs.org/
    pause
    exit /b 1
)

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Git не найден!
    echo Установите Git: https://git-scm.com/
    pause
    exit /b 1
)

:: Check connected devices
echo [1/4] Проверяю подключённые устройства...
adb devices -l
echo.

:: Clone or update ws-scrcpy
if exist "ws-scrcpy" (
    echo [2/4] ws-scrcpy уже установлен, обновляю...
    cd ws-scrcpy
    git pull
) else (
    echo [2/4] Клонирую ws-scrcpy...
    git clone https://github.com/NetrisTV/ws-scrcpy.git
    cd ws-scrcpy
)

:: Install dependencies
echo [3/4] Устанавливаю зависимости (это может занять несколько минут)...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] npm install не удался
    echo Попробуйте: npm install --force
    pause
    exit /b 1
)

:: Start ws-scrcpy
echo.
echo ============================================
echo [4/4] Запускаю ws-scrcpy...
echo.
echo Экран телефона будет доступен на:
echo   http://localhost:8000
echo.
echo Чтобы оператор мог видеть экран удалённо,
echo вставьте этот URL в настройках Rolex Telecom.
echo ============================================
echo.

call npm start

pause
