@echo off
setlocal
cd /d "%~dp0"
title Orakul Tunnel
echo.
echo ========================================
echo   Tunnel: internet -^> this PC :8787
echo   1. Run SERVER-DOMA.bat first (API window)
echo   2. Copy https://....trycloudflare.com
echo   3. Cloudflare Pages: VITE_API_URL
echo      then Redeploy the site
echo ========================================
echo.
echo Keep this window open.
echo After reboot you get a NEW url.
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo ERROR: cloudflared not found.
  pause
  exit /b 1
)

cloudflared tunnel --url http://127.0.0.1:8787 --protocol http2
echo.
echo Tunnel stopped.
pause
endlocal
