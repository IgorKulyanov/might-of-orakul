@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Orakul API home
echo.
echo ========================================
echo   API on this PC — saves here
echo   File: server\data\users.json
echo   Do NOT close this window
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js missing — https://nodejs.org
  pause
  exit /b 1
)

if not exist "server\node_modules\" (
  echo Installing server packages...
  call npm.cmd install --prefix server
)

echo Listening on port 8787...
echo.
call npm.cmd start --prefix server
pause
endlocal
