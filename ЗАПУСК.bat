@echo off
setlocal
cd /d "%~dp0"
title Might of Orakul

echo.
echo ========================================
echo   MIGHT OF ORAKUL
echo ========================================
echo.
echo  Starting game...
echo  Browser will open automatically.
echo  Do NOT close this black window.
echo  Close this window to stop the game.
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo Install LTS from https://nodejs.org
  echo Then run ZAPUSK.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing packages, wait...
  echo.
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed. Send me the error text.
    pause
    exit /b 1
  )
)

if not exist "server\node_modules\" (
  echo Installing server packages...
  call npm.cmd install --prefix server
)

echo.
echo  С телефона (тот же Wi-Fi):
echo  1^) В чёрном окне ниже найди строку Network
echo  2^) Открой этот адрес в браузере телефона
echo  Пример: http://192.168.0.15:5173/
echo.
echo Opening browser in 3 seconds...
echo.

start "" "%~dp0open-browser.bat"

call npm.cmd run dev

echo.
echo Server stopped.
pause
endlocal
