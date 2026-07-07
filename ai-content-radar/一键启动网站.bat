@echo off
chcp 65001 >nul
cd /d "%~dp0infra"
echo ============================================
echo   AI 爆款内容雷达 - 正在启动完整网站...
echo   第一次启动需要几分钟，请耐心等待。
echo ============================================
echo.
echo 启动后请打开浏览器访问：
echo   控制台   http://localhost:3000
echo   接口文档 http://localhost:8000/docs
echo.
docker compose up --build
if errorlevel 1 (
  echo.
  echo [提示] 启动失败，通常是没装/没打开 Docker Desktop。
  echo 请先安装并打开 Docker Desktop（等它变成 running 状态）再重试。
)
pause
