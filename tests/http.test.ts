import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
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
