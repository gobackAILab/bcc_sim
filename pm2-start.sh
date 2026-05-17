#!/bin/bash
# bcc-sim 웹 서버를 pm2 에 등록/기동
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
echo
echo "→ http://localhost:21037"
pm2 status
