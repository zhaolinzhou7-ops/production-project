#!/usr/bin/env bash
# Mac 用户双击此文件即可生成报告（会在“终端”里运行）。
cd "$(dirname "$0")" || exit 1
echo "============================================"
echo "  AI 爆款内容雷达 - 正在生成报告..."
echo "============================================"

# 优先用 python3，找不到再试 python
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "[提示] 没找到 Python。请到 https://www.python.org 下载安装后重试。"
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

"$PY" 生成报告.py
echo ""
echo "完成后请双击本目录下的「报告.html」查看。"
read -n 1 -s -r -p "按任意键关闭…"
