@echo off
setlocal
cd /d "%~dp0"
title Orakul Tunnel (интернет → этот комп)
echo.
echo ========================================
echo   Туннель: интернет → localhost:8787
echo   Сначала запусти СЕРВЕР-ДОМА.bat
echo   Скопируй https://....trycloudflare.com
echo   и поставь в Cloudflare Pages:
echo   VITE_API_URL = эта ссылка (без / в конце)
echo   Потом Redeploy сайта.
echo ========================================
echo.
echo Пока это окно открыто — URL не меняется.
echo Закроешь / перезагрузишь ПК — будет НОВЫЙ URL,
echo снова обнови VITE_API_URL и Redeploy.
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared не найден.
  echo Скачай: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

cloudflared tunnel --url http://127.0.0.1:8787
pause
endlocal
