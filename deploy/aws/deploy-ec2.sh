#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/wirebot}"
REPO_URL="${REPO_URL:-https://github.com/Octapus-systems/whatsapp_Dashboard.git}"
BRANCH="${BRANCH:-QrCodeandconnecting}"

sudo apt-get update
sudo apt-get install -y git ca-certificates curl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR/deploy/aws"

if [ ! -f .env ]; then
  cp .env.ec2.example .env
  echo "Created $APP_DIR/deploy/aws/.env. Edit secrets, then rerun this script."
  exit 1
fi

sudo docker compose -f docker-compose.ec2.yml up -d --build
sudo docker compose -f docker-compose.ec2.yml ps
