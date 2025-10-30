#!/bin/bash
# Script để cập nhật package trong container đang chạy
# Sử dụng: docker compose exec python-backend bash update_package.sh

echo "Updating openai package..."
pip install --no-cache-dir --upgrade "openai==1.109.0" "httpx>=0.27.0"

echo "Restarting uvicorn..."
pkill -f uvicorn || true
# uvicorn sẽ tự động restart nếu có restart policy

echo "Done! Package updated."

