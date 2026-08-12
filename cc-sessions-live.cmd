@echo off
rem === Claude Code sessions live view - open as an app window via Chrome --app ===
setlocal
set "URL=http://localhost:7843"

rem Start the server in the background (hidden window = no console strip on screen).
rem If it is already running, the server detects EADDRINUSE and exits (safe to re-run).
powershell -NoProfile -Command "Start-Process node -WindowStyle Hidden -ArgumentList '%~dp0cc-sessions-server.mjs'"

rem Give the server a moment to come up (ping works without stdin).
ping -n 2 127.0.0.1 >nul

rem Locate chrome.exe
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --app=%URL% --window-size=580,760 --user-data-dir="%LocalAppData%\cc-sessions-app"
) else (
  echo Chrome not found. Opening with default browser.
  start "" %URL%
)
endlocal
