@echo off
setlocal
rem Install this BAT beside MetalRage.exe in data\System.
set "TLS_LAUNCHER=%~dp0..\..\TLS\Play through TLS.cmd"
if not exist "%TLS_LAUNCHER%" (
    echo [ERROR] TLS launcher not found. Put the TLS folder beside data.
    pause
    exit /b 1
)
call "%TLS_LAUNCHER%"
endlocal
