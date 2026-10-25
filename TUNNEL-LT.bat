@echo off
setlocal
cd /d "%~dp0"
title Orakul Tunnel localtunnel
echo.
echo ========================================
echo   Tunnel via localtunnel (VPN-friendly)
echo   1. Run SERVER-DOMA.bat first
echo   2. Copy https://....loca.lt URL
echo   3. Pages VITE_API_URL = that URL
echo   4. Redeploy site
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  pause
  exit /b 1
)

echo Starting... first run may download package.
echo.
call npx.cmd --yes localtunnel --port 8787
echo.
echo Tunnel stopped.
pause
endlocal
