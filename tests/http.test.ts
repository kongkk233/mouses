import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
test("real HTTP API protects origins, saves atomically, replays and survives restart", async () => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const dir = await mkdtemp(join(tmpdir(), "mouse-nook-http-")),
    base = `http://127.0.0.1:${port}`,
    password = randomUUID(),
    authorization =
      "Basic " + Buffer.from("admin:" + password).toString("base64");
  const start = async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          APP_ORIGIN: base,
          APP_PASSWORD: password,
          DATA_DIR: dir,
          PUSH_ENABLED: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("API did not start")),
        10000,
      );
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("Mouse Nook API")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`API exited ${code}`));
      });
    });
    return child;
  };
  let child = await start();
  const get = async (path = "/api/state") => {
    const r = await fetch(base + path, { headers: { authorization } });
    assert.equal(r.status, 200);
    return r.json();
  };
  const post = async (body: any, origin = base) =>
    fetch(base + "/api/commands", {
      method: "POST",
      headers: { authorization, "Content-Type": "application/json", origin },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(base + "/api/state")).status, 401);
    for (const path of [
      "/api/export",
      "/api/backup",
      "/assets/mice/missing.webp",
      "/assets/private.js",
    ])
      assert.equal((await fetch(base + path)).status, 401);
    const login = await fetch(base + "/");
    assert.equal(login.status, 200);
    assert.match(await login.text(), /欢迎回到小窝/);
    assert.equal(login.headers.get("www-authenticate"), null);
    const linkedLogin = await fetch(base + "/?panel=reminders&context=test");
    assert.ok(
      (await linkedLogin.text()).includes(
        'name="returnTo" value="/?panel=reminders&amp;context=test"',
      ),
    );
    const badPassword = await fetch(base + "/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        origin: base,
      },
      body: new URLSearchParams({
        password: "wrong",
        returnTo: '/?x="/><script>alert(1)</script>',
      }),
      redirect: "manual",
    });
    assert.equal(badPassword.status, 401);
    assert.doesNotMatch(await badPassword.text(), /<script>/);
    const rejected = await fetch(base + "/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        origin: "https://untrusted.invalid",
      },
      body: new URLSearchParams({ password }),
      redirect: "manual",
    });
    assert.equal(rejected.status, 403);
    const session = await fetch(base + "/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        origin: base,
      },
      body: new URLSearchParams({ password, returnTo: "/?panel=reminders" }),
      redirect: "manual",
    });
    assert.equal(session.status, 303);
    assert.equal(session.headers.get("location"), "/?panel=reminders");
    const externalReturn = await fetch(base + "/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        origin: base,
      },
      body: new URLSearchParams({ password, returnTo: "//untrusted.invalid/" }),
      redirect: "manual",
    });
    assert.equal(externalReturn.headers.get("location"), "/");
    const cookie = session.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const signed = await fetch(base + "/api/state", {
      headers: { cookie: cookie.split(";")[0] },
    });
    assert.equal(signed.status, 200);

    let s = await get();
    const first = {
      type: "cage.create",
      payload: { code: "HTTP-A" },
      expectedRevision: s.revision,
      opId: randomUUID(),
    };
    assert.equal((await post(first, "https://untrusted.invalid")).status, 403);
    const r = await post(first);
    assert.equal(r.status, 200);
    const created = await r.json(),
      id = created.result.id;
    s = created.state;
    const replay = await post(first);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(
      (
        await post({
          ...first,
          opId: randomUUID(),
          payload: { code: "HTTP-B" },
        })
      ).status,
      409,
    );
    const invalid = await post({
      type: "mouse.create",
      payload: { code: "BROKEN", cageId: id, dob: "2099-01-01" },
      expectedRevision: s.revision,
      opId: randomUUID(),
    });
    assert.equal(invalid.status, 422);
    assert.equal((await get()).mice.length, 0);
    const sw = await fetch(base + "/sw.js", { headers: { authorization } });
    assert.equal(sw.status, 200);
    assert.match(await sw.text(), /notificationclick/);
    for (const path of [
      "/assets/mice/missing.webp",
      "/missing.js",
      "/missing-page",
    ]) {
      const missing = await fetch(base + path, { headers: { authorization } });
      assert.equal(missing.status, 404);
      assert.doesNotMatch(
        missing.headers.get("content-type") || "",
        /text\/html/,
      );
    }
    const exported = await fetch(base + "/api/export", {
      headers: { authorization },
    });
    assert.equal(exported.status, 200);
    assert.match(
      exported.headers.get("content-disposition")!,
      /attachment.*\.json/,
    );
    assert.equal(exported.headers.get("cache-control"), "no-store");
    const archive = await exported.json();
    assert.equal(archive.format, "mouse-nook");
    assert.equal(archive.version, 1);
    assert.deepEqual(archive.state, await get());
    assert.equal(JSON.stringify(archive).includes(password), false);
    const backup = await fetch(base + "/api/backup", {
      headers: { authorization },
    });
    assert.equal(backup.status, 200);
    assert.match(
      backup.headers.get("content-disposition")!,
      /attachment.*\.sqlite/,
    );
    const bytes = Buffer.from(await backup.arrayBuffer());
    assert.equal(bytes.subarray(0, 16).toString(), "SQLite format 3\u0000");
    const backupPath = join(dir, "download.sqlite");
    await writeFile(backupPath, bytes);
    const saved = new DatabaseSync(backupPath);
    try {
      assert.equal(
        saved.prepare("PRAGMA integrity_check").get()!.integrity_check,
        "ok",
      );
      assert.equal(
        saved.prepare("SELECT count(*) AS n FROM cages").get()!.n,
        1,
      );
      assert.equal(
        JSON.parse(
          saved.prepare("SELECT payload FROM cages").get()!.payload as string,
        ).id,
        id,
      );
    } finally {
      saved.close();
    }
    const restoreDir = join(dir, "restored");
    await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "scripts/restore.ts", backupPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATA_DIR: restoreDir },
      },
    );
    const restored = new DatabaseSync(join(restoreDir, "mouse-nook.sqlite"));
    try {
      assert.equal(
        JSON.parse(
          restored.prepare("SELECT payload FROM cages").get()!
            .payload as string,
        ).id,
        id,
      );
      assert.equal(
        restored.prepare("SELECT revision FROM meta").get()!.revision,
        s.revision,
      );
    } finally {
      restored.close();
    }
    child.kill("SIGTERM");
    await once(child, "exit");
    child = await start();
    const persisted = await get();
    assert.equal(persisted.cages[0].id, id);
    assert.equal(persisted.cages.length, 1);
    assert.equal(persisted.revision, s.revision);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});
