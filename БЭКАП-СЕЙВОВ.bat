@echo off
setlocal
cd /d "%~dp0"
set SRC=%~dp0server\data\users.json
set DESTDIR=%USERPROFILE%\Desktop\orakul-backups
if not exist "%SRC%" (
  echo Нет файла %SRC% — сервер ещё не создал базу.
  pause
  exit /b 1
)
if not exist "%DESTDIR%" mkdir "%DESTDIR%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set STAMP=%%i
set DEST=%DESTDIR%\users-%STAMP%.json
copy /Y "%SRC%" "%DEST%" >nul
echo Скопировано:
echo   %DEST%
echo.
echo Этот файл = все аккаунты. Потом зальёшь на Render через админку restore
echo или положишь в server/data/users.json на платном сервере.
pause
endlocal
