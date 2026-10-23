#!/usr/bin/env bash
# Build committed source into an isolated release; data and secrets stay outside releases.
set -euo pipefail
DEPLOY_HOST="${1:-oracle}"
DEPLOY_DOMAIN="${2:-mouses.ninthflux.com}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9_.@-]+$ ]] || { echo 'Invalid SSH host'; exit 1; }
[[ "$DEPLOY_DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid domain'; exit 1; }
if [[ -n "$(git status --porcelain)" ]]; then echo 'Commit all changes before deployment.'; exit 1; fi
DEPLOY_SHA="$(git rev-parse HEAD)"
DEPLOY_RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-${DEPLOY_SHA:0:8}"
DEPLOY_PATH="/srv/mouse-nook/releases/$DEPLOY_RELEASE"
ssh "$DEPLOY_HOST" "sudo install -d -o ubuntu -g ubuntu /srv/mouse-nook/releases && mkdir '$DEPLOY_PATH'"
git archive --format=tar HEAD | ssh "$DEPLOY_HOST" "tar -xf - -C '$DEPLOY_PATH'"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && npm ci --include=dev --ignore-scripts --no-audit --no-fund && npm run build && npm test && npm prune --omit=dev --ignore-scripts --no-audit --no-fund"
ssh "$DEPLOY_HOST" "sudo python3 - '$DEPLOY_PATH' '$DEPLOY_DOMAIN' '$DEPLOY_SHA'" <<'PY'
import os,sys,pathlib,secrets,subprocess,shutil,json,time
release,domain,sha=sys.argv[1:]
root=pathlib.Path('/srv/mouse-nook')
r=subprocess.run(['getent','passwd','mouse-nook'],capture_output=True)
if r.returncode:subprocess.run(['useradd','--system','--home','/var/lib/mouse-nook','--shell','/usr/sbin/nologin','mouse-nook'],check=True)
subprocess.run(['install','-d','-m','0700','-o','mouse-nook','-g','mouse-nook','/var/lib/mouse-nook'],check=True)
env=pathlib.Path('/etc/mouse-nook.env')
if not env.exists():
 env.write_text(f'HOST=127.0.0.1\nPORT=18326\nDATA_DIR=/var/lib/mouse-nook\nAPP_ORIGIN=https://{domain}\nTRUST_PROXY=1\nPUSH_ENABLED=1\nVAPID_SUBJECT=mailto:admin@{domain}\nAPP_PASSWORD={secrets.token_urlsafe(24)}\n')
 os.chmod(env,0o600)
for name in ['mouse-nook.service','mouse-nook-backup.service','mouse-nook-backup.timer']:
 shutil.copy2(pathlib.Path(release)/'deploy'/name,pathlib.Path('/etc/systemd/system')/name)
current=root/'current'
previous=os.readlink(current) if current.is_symlink() else None
if previous:
 backup=root/'previous'
 if backup.is_symlink():backup.unlink()
 backup.symlink_to(previous)
(root/'next').symlink_to(release)
os.replace(root/'next',current)
(root/'deployment.json').write_text(json.dumps({'commit':sha,'release':release,'previous':previous,'domain':domain,'deployedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},indent=2))
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','mouse-nook.service','mouse-nook-backup.timer'],check=True)
subprocess.run(['systemctl','restart','mouse-nook.service'],check=True)
subprocess.run(['systemctl','start','mouse-nook-backup.timer'],check=True)
print('Activated release '+release+'; authentication credentials are stored in /etc/mouse-nook.env (not printed).')
PY
# Health is checked through SSH without placing secrets in argv or logs.
ssh "$DEPLOY_HOST" 'sudo python3 -' <<'PY'
import urllib.request,base64,pathlib,time,subprocess
values=dict(line.split('=',1) for line in pathlib.Path('/etc/mouse-nook.env').read_text().splitlines() if '=' in line)
req=urllib.request.Request('http://127.0.0.1:18326/api/health')
req.add_header('Authorization','Basic '+base64.b64encode(('admin:'+values['APP_PASSWORD']).encode()).decode())
for i in range(20):
 try:
  with urllib.request.urlopen(req,timeout=3) as r:
   if r.status==200:print('Authenticated health check passed.');break
 except Exception:
  if i==19:raise
  time.sleep(0.5)
subprocess.run(['systemctl','start','mouse-nook-backup.service'],check=True)
PY
printf 'Deployed commit %s to %s. Configure and validate the Caddy vhost before opening DNS.\n' "$DEPLOY_SHA" "$DEPLOY_HOST"
