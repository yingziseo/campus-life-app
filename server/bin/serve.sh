#!/usr/bin/env bash
# 启动原型预览服务：bin/serve.sh [端口]，默认 8100
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8100}"
[ -f storage/campus.db ] || php bin/init-db.php
echo "预览地址: http://0.0.0.0:${PORT}/preview.html"
exec php -S "0.0.0.0:${PORT}" -t ../web router.php
