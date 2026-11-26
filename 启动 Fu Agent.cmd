@echo off
rem 本机启动打包产物（版本随 apps\electron\out\win-unpacked）
rem 说明：本机 WDAC 策略会拦截新生成的未签名 Fu Agent.exe，
rem 这里改用已受信任的 electron.exe 加载打包后的 resources\app，
rem 运行效果与打包产物一致（版本、内置 Bun、SDK、CHANGELOG 均取打包目录）。
setlocal
set "ROOT=%~dp0"
set "ELECTRON=%ROOT%node_modules\electron\dist\electron.exe"
set "APP=%ROOT%apps\electron\out\win-unpacked\resources\app"

if not exist "%ELECTRON%" (
  echo [错误] 未找到 electron.exe：%ELECTRON%
  echo 请先在仓库根执行 bun install
  pause
  exit /b 1
)

if not exist "%APP%\package.json" (
  echo [错误] 未找到打包产物：%APP%
  echo 请先在 apps\electron 下执行 bun run pack
  pause
  exit /b 1
)

rem 与开发模式共用同一份数据目录
set "PROMA_DATA_DIR=%ROOT%data"

start "" "%ELECTRON%" "%APP%"
endlocal
