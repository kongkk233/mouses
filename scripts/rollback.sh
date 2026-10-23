#!/usr/bin/env bash
set -euo pipefail
DEPLOY_HOST="${1:-oracle}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9_.@-]+$ ]] || exit 1
ssh "$DEPLOY_HOST" 'sudo python3 -' <<'PY'
import os,pathlib,subprocess
root=pathlib.Path('/srv/mouse-nook')
previous=root/'previous'
if not previous.is_symlink():raise SystemExit('No previous release is available.')
target=previous.resolve()
if not (target/'dist-server/server/index.js').exists():raise SystemExit('Previous release is incomplete.')
next=root/'rollback-next'
next.symlink_to(target)
os.replace(next,root/'current')
subprocess.run(['systemctl','restart','mouse-nook.service'],check=True)
print('Rolled back code to '+str(target)+'. Database preserved; schema version 1 is unchanged.')
PY
