@echo off
setlocal
cd /d "%~dp0"

echo 双人学习计划 - 临时公网共享启动器
echo.
echo 这个窗口会启动本机服务，并通过 localtunnel 生成一个 https 公网地址。
echo 把生成的 https 地址发给同学，双方输入同一个邀请码即可共用数据。
echo 注意：电脑和这个窗口需要保持开启；长期稳定网址请按 PUBLIC_DEPLOYMENT.md 部署。
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo 没找到 Node.js，无法启动网站。
  pause
  exit /b 1
)

start "Study Planner Server" cmd /k "cd /d ""%~dp0"" && node server.mjs"
timeout /t 3 /nobreak >nul

start "" "http://127.0.0.1:4173"
echo 正在创建公网地址。首次运行可能会下载 localtunnel，请等待出现 https://... 链接。
echo.
npx.cmd --yes localtunnel --port 4173

echo.
echo 公网隧道已结束。
pause
