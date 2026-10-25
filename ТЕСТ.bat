@echo off
setlocal
cd /d "%~dp0"
title Might of Orakul — QA

echo.
echo ========================================
echo   MIGHT OF ORAKUL  —  полный тестер
echo   бой / экономика / тропа / API / 1000
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing packages...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist "server\node_modules\" (
  echo Installing server packages...
  call npm.cmd install --prefix server
  if errorlevel 1 (
    echo server npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo --- 1/2  Игра: бой, мана, магия, существа, экономика, тропа ---
call npm.cmd test
set GAME_ERR=%ERRORLEVEL%
echo.

echo --- 2/2  Сервер: вход, безопасность, 1000 игроков ---
call npm.cmd run test:server
set SERVER_ERR=%ERRORLEVEL%
echo.

if not "%GAME_ERR%"=="0" goto fail
if not "%SERVER_ERR%"=="0" goto fail
echo ========================================
echo   Всё зелёное. Можно играть.
echo ========================================
pause
endlocal
exit /b 0

:fail
echo ========================================
echo   Есть поломки. Текст FAIL выше.
echo ========================================
pause
endlocal
exit /b 1
