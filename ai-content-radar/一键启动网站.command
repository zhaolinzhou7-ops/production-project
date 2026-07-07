#!/usr/bin/env bash
# Mac 用户双击此文件即可启动完整网站（需先安装并打开 Docker Desktop）。
cd "$(dirname "$0")/infra" || exit 1
echo "============================================"
echo "  AI 爆款内容雷达 - 正在启动完整网站..."
echo "  第一次启动需要几分钟，请耐心等待。"
echo "============================================"
echo ""
echo "启动后请打开浏览器访问："
echo "  控制台   http://localhost:3000"
echo "  接口文档 http://localhost:8000/docs"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "[提示] 没找到 Docker。请先到 https://www.docker.com 安装 Docker Desktop 并打开它。"
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

docker compose up --build
