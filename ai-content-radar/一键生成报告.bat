@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   AI 爆款内容雷达 - 正在生成报告...
echo ============================================
python 生成报告.py
if errorlevel 1 (
  echo.
  echo [提示] 运行失败，通常是没装好 Python。
  echo 请到微软商店安装 Python 3.12，或访问 python.org 安装时勾选 Add to PATH。
)
echo.
echo 完成后请双击本目录下的「报告.html」查看。
pause
