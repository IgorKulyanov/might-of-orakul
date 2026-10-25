@echo off
setlocal
cd /d "%~dp0"
title Orakul API (домашний сервер)
echo.
echo ========================================
echo   API на этом компе — сейвы здесь
echo   Файл: server\data\users.json
echo   Не закрывай это окно (24/7)
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: нет Node.js — поставь с https://nodejs.org
  pause
  exit /b 1
)

if not exist "server\node_modules\" (
  echo Установка пакетов сервера...
  call npm.cmd install --prefix server
)

echo Слушаю порт 8787...
echo Сайт друзей: Cloudflare Pages + туннель (см. HOME-HOST.md)
echo.
call npm.cmd start --prefix server
pause
endlocal
