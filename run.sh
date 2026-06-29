#!/usr/bin/env bash
# 启动自动排产系统 (后端 API + 前端页面)
set -e
cd "$(dirname "$0")"
echo "启动服务: http://127.0.0.1:8000"
exec python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 "$@"
