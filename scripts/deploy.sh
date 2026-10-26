#!/usr/bin/env bash
# Publish one committed version without copying either environment's data.
set -euo pipefail
DEPLOY_HOST="${1:-oracle}"
DEPLOY_DOMAIN="${2:-mouses.ninthflux.com}"
DEPLOY_ENVIRONMENT="${3:-production}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9_.@-]+$ ]] || { echo 'Invalid SSH host'; exit 1; }
[[ "$DEPLOY_DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid domain'; exit 1; }
[[ "$DEPLOY_ENVIRONMENT" == production || "$DEPLOY_ENVIRONMENT" == staging ]] || { echo 'Invalid environment'; exit 1; }
if [[ -n "$(git status --porcelain)" ]]; then echo 'Commit all changes before deployment.'; exit 1; fi
DEPLOY_SHA="$(git rev-parse HEAD)"
DEPLOY_RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-${DEPLOY_SHA:0:8}"
DEPLOY_ROOT="/srv/mouse-nook"
if [[ "$DEPLOY_ENVIRONMENT" == staging ]]; then DEPLOY_ROOT="/srv/mouse-nook-test"; fi
DEPLOY_PATH="$DEPLOY_ROOT/releases/$DEPLOY_RELEASE"
ssh "$DEPLOY_HOST" "sudo install -d -o ubuntu -g ubuntu '$DEPLOY_ROOT/releases' && mkdir '$DEPLOY_PATH'"
git archive --format=tar HEAD | ssh "$DEPLOY_HOST" "tar -xf - -C '$DEPLOY_PATH'"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && npm ci --include=dev --ignore-scripts --no-audit --no-fund && npm run build && npm test && npm prune --omit=dev --ignore-scripts --no-audit --no-fund"
ssh "$DEPLOY_HOST" "sudo python3 '$DEPLOY_PATH/scripts/configure-environments.py' '$DEPLOY_PATH' '$DEPLOY_DOMAIN' '$DEPLOY_SHA' '$DEPLOY_ENVIRONMENT'"
