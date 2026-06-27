@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo.
echo RuleQuant 启动脚本
echo ------------------

set NODE_EXE=node
if exist "%~dp0runtime\node\node.exe" (
  set NODE_EXE=%~dp0runtime\node\node.exe
)

"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 (
  echo 没有检测到可用的 Node.js。
  echo 如果这是完整包，请确认 runtime\node\node.exe 没有被杀毒软件删除。
  echo 也可以手动安装 Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo 没有检测到 node_modules，也没有 pnpm。
    echo 请使用完整包，或先安装 Node.js 后运行: npm install -g pnpm
    pause
    exit /b 1
  )
  echo 第一次运行，正在安装依赖...
  pnpm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络或 Node.js 环境。
    pause
    exit /b 1
  )
)

if not exist ".next\BUILD_ID" (
  echo 未发现生产构建，正在生成优化版本...
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo 当前包缺少生产构建，也没有 pnpm，无法现场构建。
    echo 请联系发送者重新提供完整包。
    pause
    exit /b 1
  )
  pnpm build
  if errorlevel 1 (
    echo 生产构建失败，请把窗口截图发给开发者。
    pause
    exit /b 1
  )
)

set PORT=
for %%P in (3000 3001 3002 3003 3004) do (
  powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>nul
  if not errorlevel 1 (
    set PORT=%%P
    goto found_port
  )
)

echo 3000-3004 端口都被占用，请先关闭旧的 RuleQuant 窗口后再试。
pause
exit /b 1

:found_port
set URL=http://localhost:%PORT%/dashboard

echo.
echo 已使用生产优化模式启动。
echo 如果浏览器没有自动打开，请手动打开:
echo %URL%
echo.
start "" "%URL%"

"%NODE_EXE%" node_modules\next\dist\bin\next start -p %PORT%

endlocal
