@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Orakul Tunnel
echo.
echo ========================================
echo   Tunnel: internet -^> localhost:8787
echo   1) First run SERVEР-ДОМА.bat (API)
echo   2) Copy https://....trycloudflare.com
echo   3) Cloudflare Pages -^> VITE_API_URL
echo      (no slash at end) -^> Redeploy
echo ========================================
echo.
echo Keep this window open. New URL after reboot.
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared not found. Install from Cloudflare docs.
  pause
  exit /b 1
)

REM http2 often works when quic/530 fails
cloudflared tunnel --url http://127.0.0.1:8787 --protocol http2
pause
endlocal
