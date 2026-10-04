#!/usr/bin/env bash
# Rebuild + restart the ScamGuard backend container using the current .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Building backend image..."
sudo -n docker build -t scamguard-ai-backend:latest ./backend

echo "==> Restarting container..."
sudo -n docker stop scamguard-backend >/dev/null 2>&1 || true
sudo -n docker rm scamguard-backend >/dev/null 2>&1 || true
sudo -n docker run -d \
  --name scamguard-backend \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file .env \
  -v hf-cache:/root/.cache/huggingface \
  scamguard-ai-backend:latest >/dev/null

echo "==> Waiting for health..."
for i in $(seq 1 30); do
  code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || true)
  if [[ "$code" == "200" ]]; then
    echo "✅ Backend healthy."
    exit 0
  fi
  sleep 2
done
echo "⚠️  Backend did not become healthy in time. Check: sudo docker logs scamguard-backend" >&2
exit 1
