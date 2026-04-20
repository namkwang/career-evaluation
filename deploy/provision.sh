#!/usr/bin/env bash
# Idempotent provisioning for the career-evaluation app on a fresh
# Ubuntu 24.04 Lightsail instance. Safe to re-run.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/namkwang/career-evaluation.git}"
APP_DIR="${APP_DIR:-/srv/career-evaluation}"
APP_USER="${APP_USER:-career}"
NODE_MAJOR=20

log() { printf '\n\033[1;34m[provision]\033[0m %s\n' "$*"; }

# --- system packages ---
log "apt update + base packages"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  python3.12 python3.12-venv python3-pip \
  git curl build-essential pkg-config \
  nginx ca-certificates

# --- node.js 20 via NodeSource ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')" != "$NODE_MAJOR" ]]; then
  log "installing node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
node -v; npm -v

# --- app user ---
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "creating user $APP_USER"
  sudo useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# --- clone or update repo ---
if [[ ! -d "$APP_DIR/.git" ]]; then
  log "cloning $REPO_URL"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
else
  log "updating existing clone"
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/master
fi

# --- backend ---
log "backend: python venv + deps"
sudo -u "$APP_USER" bash -lc "
  cd $APP_DIR/backend
  test -d .venv || python3.12 -m venv .venv
  .venv/bin/pip install --upgrade pip >/dev/null
  .venv/bin/pip install -e .
"

# --- frontend ---
log "frontend: npm ci + build"
sudo -u "$APP_USER" bash -lc "
  cd $APP_DIR
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npm run build
"

# --- systemd services ---
log "installing systemd units"
sudo tee /etc/systemd/system/career-backend.service >/dev/null <<EOF
[Unit]
Description=Career Evaluation FastAPI backend (uvicorn)
After=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/.env.local
ExecStart=$APP_DIR/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/career-frontend.service >/dev/null <<EOF
[Unit]
Description=Career Evaluation Next.js frontend
After=network-online.target career-backend.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env.local
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=BACKEND_URL=http://127.0.0.1:8000
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable career-backend career-frontend

# --- nginx reverse proxy ---
log "writing nginx site"
sudo tee /etc/nginx/sites-available/career >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 20M;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_buffering off;                # streaming endpoints
    proxy_cache off;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/career /etc/nginx/sites-enabled/career
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

log "provisioning done. next: upload .env.local and start services."
