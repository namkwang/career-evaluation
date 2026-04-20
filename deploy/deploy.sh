#!/usr/bin/env bash
# Pull latest code and hot-restart services. Used by manual redeploys
# and by the GitHub Actions workflow.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/career-evaluation}"
APP_USER="${APP_USER:-career}"
BRANCH="${BRANCH:-master}"

log() { printf '\n\033[1;34m[deploy]\033[0m %s\n' "$*"; }

log "fetching branch $BRANCH"
sudo -u "$APP_USER" git -C "$APP_DIR" fetch --prune origin
sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"

log "backend deps"
sudo -u "$APP_USER" bash -lc "
  cd $APP_DIR/backend
  .venv/bin/pip install -e . >/dev/null
"

log "frontend deps + build"
sudo -u "$APP_USER" bash -lc "
  cd $APP_DIR
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npm run build
"

log "restart services"
sudo systemctl restart career-backend
sudo systemctl restart career-frontend

log "healthcheck"
sleep 3
curl -fsS http://127.0.0.1:8000/healthz | head -1 || { echo 'backend healthcheck failed'; exit 1; }
curl -fsS -o /dev/null -w 'frontend HTTP %{http_code}\n' http://127.0.0.1:3000/ || { echo 'frontend healthcheck failed'; exit 1; }
log "deploy ok"
