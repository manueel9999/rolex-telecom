@echo off
chcp 65001 >nul
echo ==========================================
echo   Rolex Telecom - Windows Agent Setup
echo ==========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python не найден!
    echo    Скачайте с https://python.org/downloads
    echo    При установке отметьте "Add Python to PATH"
    pause
    exit /b 1
)

echo ✅ Python найден
echo.

:: Install dependencies
echo 📦 Установка зависимостей...
pip install -r requirements.txt
echo.

if errorlevel 1 (
    echo ❌ Ошибка установки зависимостей
    pause
    exit /b 1
)

echo ✅ Зависимости установлены
echo.
echo ==========================================
echo   Запуск агента...
echo ==========================================
echo.

python rolex_agent.py

pause
