#!/usr/bin/env python3
"""Activate one isolated environment; run as root on the deployment host."""
import base64
import datetime
import json
import os
import pathlib
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.parse

release, domain, sha, environment = sys.argv[1:]
if environment not in ["production", "staging"]:
    raise SystemExit("Invalid deployment environment")


def load(path):
    return dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line and not line.startswith("#")) if path.exists() else {}


def save(path, values):
    temporary = path.with_name(path.name + ".next")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as output:
        os.fchmod(output.fileno(), 0o600)
        output.write("".join(key + "=" + value + "\n" for key, value in values.items()))
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


production_file = pathlib.Path("/etc/mouse-nook.env")
production = load(production_file)
production.setdefault("APP_ORIGIN", "https://" + (domain if environment == "production" else "mouses.ninthflux.com"))
production.setdefault("HOST", "127.0.0.1")
production.setdefault("PORT", "18326")
production.setdefault("DATA_DIR", "/var/lib/mouse-nook")
production.setdefault("APP_PASSWORD", secrets.token_urlsafe(24))
production.setdefault("ADMIN_PASSWORD", secrets.token_urlsafe(24))
production.setdefault("PUSH_ENABLED", "1")
production.setdefault("VAPID_SUBJECT", "mailto:admin@" + production["APP_ORIGIN"].split("://", 1)[1])
production.setdefault("STAGING_ORIGIN", "https://mouses-test.ninthflux.com")
production.setdefault("ENV_STATUS_TOKEN", secrets.token_urlsafe(32))
expected_origin = production["STAGING_ORIGIN"] if environment == "staging" else production["APP_ORIGIN"]
if urllib.parse.urlsplit(expected_origin).hostname != domain:
    raise SystemExit("Deployment domain does not match the configured environment")
if "STAGING_SIGNING_KEY" not in production:
    generated = json.loads(subprocess.check_output([
        "/usr/bin/node", "-e",
        "const c=require('node:crypto'),k=c.generateKeyPairSync('ed25519');"
        "console.log(JSON.stringify({private:k.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),"
        "public:k.publicKey.export({format:'der',type:'spki'}).toString('base64')}))",
    ], text=True))
    production["STAGING_SIGNING_KEY"] = generated["private"]
    production["STAGING_VERIFY_KEY"] = generated["public"]
production.update(APP_ENV="production", TRUST_PROXY="1", STAGING_STATUS_URL="http://127.0.0.1:18327/internal/status")
save(production_file, production)
staging_file = pathlib.Path("/etc/mouse-nook-test.env")
staging = load(staging_file)
staging.setdefault("ADMIN_PASSWORD", secrets.token_urlsafe(24))
staging.update(
    APP_ENV="staging", HOST="127.0.0.1", PORT="18327", DATA_DIR="/var/lib/mouse-nook-test",
    APP_ORIGIN=production["STAGING_ORIGIN"], PRODUCTION_ORIGIN=production["APP_ORIGIN"],
    TRUST_PROXY="1", PUSH_ENABLED="0", STAGING_VERIFY_KEY=production["STAGING_VERIFY_KEY"],
    ENV_STATUS_TOKEN=production["ENV_STATUS_TOKEN"],
)
for key in ["APP_PASSWORD", "STAGING_SIGNING_KEY", "STAGING_STATUS_URL"]:
    staging.pop(key, None)
save(staging_file, staging)

testing = environment == "staging"
name = "mouse-nook-test" if testing else "mouse-nook"
values = staging if testing else production
root = pathlib.Path("/srv") / name
data = pathlib.Path(values["DATA_DIR"])
if subprocess.run(["getent", "passwd", name], stdout=subprocess.DEVNULL).returncode:
    subprocess.run(["useradd", "--system", "--home", str(data), "--shell", "/usr/sbin/nologin", name], check=True)
subprocess.run(["install", "-d", "-m", "0700", "-o", name, "-g", name, str(data)], check=True)
if testing and not (data / "mouse-nook.sqlite").exists():
    subprocess.run(["runuser", "-u", name, "--", "env", "DATA_DIR=" + str(data), "/usr/bin/node", str(pathlib.Path(release) / "dist-server/server/seed.js")], check=True)

units = [name + ".service"] if testing else ["mouse-nook.service", "mouse-nook-backup.service", "mouse-nook-backup.timer"]
if not testing and subprocess.run(["systemctl", "is-active", "--quiet", "mouse-nook.service"]).returncode == 0:
    subprocess.run(["systemctl", "start", "mouse-nook-backup.service"], check=True)
for unit in units:
    shutil.copy2(pathlib.Path(release) / "deploy" / unit, pathlib.Path("/etc/systemd/system") / unit)

current = root / "current"
previous = os.readlink(current) if current.is_symlink() else None
old_metadata = (root / "deployment.json").read_text() if (root / "deployment.json").exists() else None
if previous:
    if old_metadata:
        (root / "deployment-previous.json").write_text(old_metadata)
    link = root / "previous"
    if link.is_symlink():
        link.unlink()
    link.symlink_to(previous)
deployed_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
release_info = pathlib.Path(release) / "release.json"
release_info.write_text(json.dumps({"commit": sha, "deployedAt": deployed_at, "environment": environment}))
release_info.chmod(0o644)
next_link = root / "next"
if next_link.is_symlink():
    next_link.unlink()
next_link.symlink_to(release)
os.replace(next_link, current)
(root / "deployment.json").write_text(json.dumps({
    "commit": sha, "release": release, "previous": previous, "domain": domain,
    "environment": environment, "deployedAt": deployed_at,
}, indent=2))
try:
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", name + ".service"], check=True)
    subprocess.run(["systemctl", "restart", name + ".service"], check=True)
    request = urllib.request.Request("http://127.0.0.1:" + values["PORT"] + "/api/health")
    request.add_header("Authorization", "Basic " + base64.b64encode(("admin:" + values["ADMIN_PASSWORD"]).encode()).decode())
    for attempt in range(30):
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                if response.status == 200:
                    break
        except Exception:
            if attempt == 29:
                raise RuntimeError("Authenticated health check failed") from None
            time.sleep(0.3)
    if not testing:
        subprocess.run(["systemctl", "enable", "--now", "mouse-nook-backup.timer"], check=True)
        subprocess.run(["systemctl", "start", "mouse-nook-backup.service"], check=True)
except Exception:
    if previous:
        if next_link.is_symlink():
            next_link.unlink()
        next_link.symlink_to(previous)
        os.replace(next_link, current)
        if old_metadata:
            (root / "deployment.json").write_text(old_metadata)
        subprocess.run(["systemctl", "restart", name + ".service"], check=True)
        print("Activation failed; restored previous release.")
    raise
print(json.dumps({"environment": environment, "commit": sha, "release": release, "health": "ok"}))
