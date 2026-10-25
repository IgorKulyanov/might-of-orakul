@echo off
setlocal
cd /d "%~dp0"
set SRC=%~dp0server\data\users.json
set DESTDIR=%USERPROFILE%\Desktop\orakul-backups
if not exist "%SRC%" (
  echo No users.json yet. Start the API once first.
  pause
  exit /b 1
)
if not exist "%DESTDIR%" mkdir "%DESTDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set STAMP=%%i
set DEST=%DESTDIR%\users-%STAMP%.json
copy /Y "%SRC%" "%DEST%" >nul
echo Copied to:
echo   %DEST%
pause
endlocal
