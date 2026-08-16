@echo off
setlocal
title BCCWE Invoicing - local server

REM Run from THIS file's own folder, so the launcher keeps working if the
REM project is moved to another drive or folder.
cd /d "%~dp0"

echo ================================================
echo    BCCWE Invoicing - local server
echo ================================================
echo    Folder: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js was not found on this computer.
  echo.
  echo      Install it from https://nodejs.org ^(the LTS button^),
  echo      then close this window and double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "server.js" (
  echo  [X] server.js is not in this folder.
  echo.
  echo      This launcher must sit in the same folder as server.js.
  echo.
  pause
  exit /b 1
)

if not exist "db-config.json" (
  echo  [X] db-config.json is missing - the server cannot start without it.
  echo.
  echo      Copy db-config.example.json to db-config.json and fill in
  echo      your database details, then run this again.
  echo.
  pause
  exit /b 1
)

echo    Starting the server. Your browser opens in a few seconds.
echo.
echo    Address:  http://localhost:3000
echo.
echo    Leave this window OPEN while you use the system.
echo    Press Ctrl+C here to stop it.
echo.

REM Open the browser a few seconds later, once the server is listening -
REM opening it immediately would just show "cannot connect".
start "" /min cmd /c "timeout /t 4 /nobreak >nul & explorer http://localhost:3000"

node server.js

echo.
echo ================================================
echo    The server has stopped.
echo ================================================
echo.
echo    If it stopped straight away, the reason is printed above.
echo      EADDRINUSE      - port 3000 is already in use; another copy
echo                        of this window may still be running.
echo      ECONNREFUSED    - MySQL is not running. Start it in the
echo                        XAMPP Control Panel and try again.
echo      Access denied   - the user or password in db-config.json
echo                        does not match your database.
echo.
pause
