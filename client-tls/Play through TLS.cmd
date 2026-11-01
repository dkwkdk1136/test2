@echo off
setlocal
title Metal Rage Online - TLS
cd /d "%~dp0"
if not exist "%~dp0runtime\node.exe" (
    echo [ERROR] Bundled runtime missing. Extract the complete client package.
    pause
    exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0launch.js"
if errorlevel 1 pause
endlocal
