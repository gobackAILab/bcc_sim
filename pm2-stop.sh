#!/bin/bash
# bcc-sim 웹 서버 정지/제거
set -euo pipefail
cd "$(dirname "$0")"
pm2 stop bcc-sim-web || true
pm2 delete bcc-sim-web || true
pm2 save
pm2 status
