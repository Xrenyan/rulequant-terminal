@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "runtime\node\node.exe" (
  echo Bundled node.exe was not found.
  echo Please unzip the whole RuleQuant package before starting.
  pause
  exit /b 1
)

if not exist "node_modules\next\dist\bin\next" if not exist ".next\standalone\server.js" (
  echo RuleQuant runtime files were not found.
  echo Please unzip the whole RuleQuant package before starting.
  pause
  exit /b 1
)

echo Starting RuleQuant...
echo Open URL: http://127.0.0.1:3030/dashboard
start "" "http://127.0.0.1:3030/dashboard"

if exist "node_modules\next\dist\bin\next" (
  "%~dp0runtime\node\node.exe" "%~dp0node_modules\next\dist\bin\next" start -p 3030 -H 127.0.0.1
) else (
  set PORT=3030
  set HOSTNAME=127.0.0.1
  cd /d "%~dp0.next\standalone"
  "%~dp0runtime\node\node.exe" "%~dp0.next\standalone\server.js"
)

endlocal
