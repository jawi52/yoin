@echo off
title Yoin Downloader Launcher
echo ===================================================
echo               Yoin Media Downloader
echo ===================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Python is not installed or not in your PATH.
    echo Attempting to install Python 3 automatically via Windows Package Manager [winget]...
    echo.
    winget install --id Python.Python.3.10 --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [ERROR] Automatic Python installation failed.
        echo Please install Python manually from: https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [SUCCESS] Python has been installed successfully!
    echo.
    echo =======================================================================
    echo   IMPORTANT: Please CLOSE this window and open run.bat again!
    echo   This is required so that Windows reloads the system PATH variables.
    echo =======================================================================
    echo.
    pause
    exit /b 0
)

:: Check if FFmpeg is installed
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] FFmpeg is not installed or not in your PATH.
    echo Yoin requires FFmpeg to merge high-quality video and audio formats.
    echo Attempting to install FFmpeg automatically via Windows Package Manager [winget]...
    echo.
    winget install --id Gyan.FFmpeg.Essentials --silent --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [ERROR] Automatic FFmpeg installation failed.
        echo Yoin will still run, but high-quality mergers may fail.
        echo Please install FFmpeg manually later.
        echo.
        pause
    ) else (
        echo.
        echo [SUCCESS] FFmpeg has been installed successfully!
        echo.
        echo =======================================================================
        echo   IMPORTANT: Please CLOSE this window and open run.bat again!
        echo   This is required so that Windows reloads the system PATH variables
        echo   and Yoin can detect the newly installed FFmpeg.
        echo =======================================================================
        echo.
        pause
        exit /b 0
    )
)

echo [1/3] Checking and installing Python dependencies...
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Failed to install requirements. Attempting to continue...
    echo.
)

if "%1"=="--background" goto start_server

echo [2/3] Starting web browser...
start http://localhost:8000

:start_server
set ENABLE_AUTO_SHUTDOWN=true
echo [3/3] Launching FastAPI local server...
echo Server starting at http://127.0.0.1:8000
if not "%1"=="--background" (
    echo Press Ctrl+C in this window to stop the server.
    echo.
)
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
if %errorlevel% neq 0 (
    if not "%1"=="--background" (
        pause
    )
)
