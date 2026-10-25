@echo off
setlocal
cd /d "%~dp0"
title Orakul API home
echo.
echo ========================================
echo   Orakul API on this PC
echo   Saves: server\data\users.json
echo   Keep this window open
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo Install LTS from https://nodejs.org
  echo Then run this file again.
  pause
  exit /b 1
)

if not exist "server\node_modules\" (
  echo Installing server packages...
  call npm.cmd install --prefix server
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Listening on port 8787...
echo.
call npm.cmd start --prefix server
echo.
echo Server stopped.
pause
endlocal
