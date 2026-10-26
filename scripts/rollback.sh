#!/usr/bin/env bash
set -euo pipefail
DEPLOY_HOST="${1:-oracle}"
DEPLOY_ENVIRONMENT="${2:-production}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9_.@-]+$ ]] || exit 1
[[ "$DEPLOY_ENVIRONMENT" == production || "$DEPLOY_ENVIRONMENT" == staging ]] || exit 1
ssh "$DEPLOY_HOST" "sudo python3 - '$DEPLOY_ENVIRONMENT'" <<'PY'
import os,pathlib,subprocess,sys,json
name='mouse-nook-test' if sys.argv[1]=='staging' else 'mouse-nook'
root=pathlib.Path('/srv')/name
previous=root/'previous'
if not previous.is_symlink():raise SystemExit('No previous release is available.')
target=previous.resolve()
if not (target/'dist-server/server/index.js').exists():raise SystemExit('Previous release is incomplete.')
next=root/'rollback-next'
if next.is_symlink():next.unlink()
next.symlink_to(target)
os.replace(next,root/'current')
metadata=root/'deployment-previous.json'
if metadata.exists():
 recorded=json.loads(metadata.read_text())
 if pathlib.Path(recorded['release']).resolve()==target:(root/'deployment.json').write_text(metadata.read_text())
subprocess.run(['systemctl','restart',name+'.service'],check=True)
print('Rolled back code to '+str(target)+'. Database preserved; schema version 1 is unchanged.')
PY
