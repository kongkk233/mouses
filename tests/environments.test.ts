import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironment } from "../server/environment.js";
import {
  createTicket,
  newChallenge,
  readTicket,
  ssoDigest,
} from "../server/sso.js";

const keys = generateKeyPairSync("ed25519");
const signing = keys.privateKey
  .export({ format: "der", type: "pkcs8" })
  .toString("base64");
const verification = keys.publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");
const adminPassword = randomUUID(),
  memberPassword = randomUUID(),
  testPassword = randomUUID();
const statusToken = randomUUID();

test("environment configuration fails closed and SSO binds issuer, audience, browser and expiry", () => {
  assert.throws(
    () =>
      loadEnvironment({
        APP_ENV: "staging",
        ADMIN_PASSWORD: adminPassword,
        PUSH_ENABLED: "0",
      }),
    /DATA_DIR/,
  );
  assert.throws(
    () =>
      loadEnvironment({
        APP_ENV: "staging",
        ADMIN_PASSWORD: adminPassword,
        PUSH_ENABLED: "0",
        DATA_DIR: "/var/lib/mouse-nook",
      }),
    /DATA_DIR/,
  );
  assert.throws(
    () =>
      loadEnvironment({
        APP_ENV: "staging",
        ADMIN_PASSWORD: adminPassword,
        PUSH_ENABLED: "0",
        DATA_DIR: "/isolated",
        STAGING_SIGNING_KEY: signing,
      }),
    /signing key/,
  );
  assert.throws(
    () =>
      loadEnvironment({ APP_ENV: "staging", ADMIN_PASSWORD: adminPassword }),
    /PUSH_ENABLED/,
  );
  assert.throws(
    () => loadEnvironment({ ADMIN_PASSWORD: "same", APP_PASSWORD: "same" }),
    /differ/,
  );
  assert.throws(
    () =>
      loadEnvironment({
        STAGING_STATUS_URL: "https://example.com/internal/status",
      }),
    /loopback/,
  );
  assert.throws(
    () => loadEnvironment({ STAGING_ORIGIN: "https://example.com/bad" }),
    /origins/,
  );
  const prod = loadEnvironment({
    APP_ORIGIN: "https://prod.example.com",
    STAGING_ORIGIN: "https://test.example.com",
    STAGING_SIGNING_KEY: signing,
  });
  const stage = loadEnvironment({
    APP_ENV: "staging",
    DATA_DIR: "/isolated-test",
    ADMIN_PASSWORD: testPassword,
    PUSH_ENABLED: "0",
    APP_ORIGIN: "https://test.example.com",
    PRODUCTION_ORIGIN: prod.origin,
    STAGING_VERIFY_KEY: verification,
  });
  const state = newChallenge(),
    now = Date.now();
  const ticket = createTicket(prod, ssoDigest(state), now);
  assert.ok(readTicket(stage, ticket, state, now).nonce);
  assert.throws(() => readTicket(stage, ticket + "x", state, now));
  assert.throws(() => readTicket(stage, ticket, newChallenge(), now));
  assert.throws(() => readTicket(stage, ticket, state, now + 60001));
  assert.throws(() =>
    readTicket(
      { ...stage, origin: "https://other.example.com" },
      ticket,
      state,
      now,
    ),
  );
  assert.throws(() =>
    readTicket(
      { ...stage, productionOrigin: "https://evil.example.com" },
      ticket,
      state,
      now,
    ),
  );
});

async function port() {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const result = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return result;
}
test("two real instances isolate roles, databases and cookies, with single-use browser-bound SSO", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nook-environments-"));
  const productionPort = await port(),
    stagingPort = await port();
  const production = `http://127.0.0.1:${productionPort}`,
    staging = `http://127.0.0.1:${stagingPort}`;
  const children: ReturnType<typeof spawn>[] = [];
  t.after(async () => {
    await Promise.all(
      children
        .filter((child) => child.exitCode === null)
        .map(async (child) => {
          child.kill("SIGTERM");
          await once(child, "exit");
        }),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const start = async (isStaging: boolean) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_ENV: isStaging ? "staging" : "production",
          NODE_ENV: "production",
          PORT: String(isStaging ? stagingPort : productionPort),
          HOST: "127.0.0.1",
          APP_ORIGIN: isStaging ? staging : production,
          PUSH_ENABLED: "0",
          DATA_DIR: join(directory, isStaging ? "staging" : "production"),
          APP_PASSWORD: memberPassword,
          ADMIN_PASSWORD: isStaging ? testPassword : adminPassword,
          PRODUCTION_ORIGIN: production,
          STAGING_ORIGIN: isStaging ? "" : staging,
          STAGING_SIGNING_KEY: isStaging ? "" : signing,
          STAGING_VERIFY_KEY: isStaging ? verification : "",
          ENV_STATUS_TOKEN: statusToken,
          STAGING_STATUS_URL: isStaging ? "" : staging + "/internal/status",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Instance did not start"));
      }, 10000);
      child.stdout!.on("data", (chunk) => {
        if (chunk.toString().includes("Mouse Nook API")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Instance exited ${code}`));
      });
    });
    return child;
  };
  let prodProcess = await start(false);
  let stageProcess = await start(true);
  const basic =
    "Basic " + Buffer.from("admin:" + memberPassword).toString("base64");
  const login = async (base: string, password: string, username = "admin") =>
    fetch(base + "/session", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ password, username }),
      redirect: "manual",
    });
  const request = (base: string, path: string, cookie: string) =>
    fetch(base + path, { headers: { cookie }, redirect: "manual" });
  const adminLogin = await login(production, adminPassword);
  assert.equal(adminLogin.status, 303);
  assert.equal(adminLogin.headers.get("location"), "/admin");
  const productionCookie = adminLogin.headers.get("set-cookie")!.split(";")[0];
  assert.doesNotMatch(adminLogin.headers.get("set-cookie")!, /Domain=/i);
  assert.match(adminLogin.headers.get("set-cookie")!, /HttpOnly/);
  assert.equal((await login(production, memberPassword)).status, 401);
  assert.equal(
    (
      await fetch(production + "/api/admin/environments", {
        headers: { authorization: basic },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(staging + "/api/state", { headers: { authorization: basic } }))
      .status,
    401,
  );
  assert.equal((await login(staging, memberPassword, "user")).status, 401);
  assert.equal(
    (await request(staging, "/api/state", productionCookie)).status,
    401,
  );
  assert.equal((await fetch(staging + "/internal/status")).status, 404);
  assert.equal(
    (await (await fetch(staging + "/manifest.webmanifest")).json()).short_name,
    "小窝测试",
  );
  const session = await (
    await request(production, "/api/session", productionCookie)
  ).json();
  assert.equal(session.role, "admin");
  assert.equal(session.environment, "production");
  const environments = await (
    await request(production, "/api/admin/environments", productionCookie)
  ).json();
  assert.equal(environments.environments.length, 2);
  assert.equal(environments.environments[1].healthy, true);
  assert.equal(environments.environments[1].pushEnabled, false);

  const connect = await fetch(staging + "/session/connect", {
    redirect: "manual",
  });
  const stateCookie = connect.headers.get("set-cookie")!.split(";")[0];
  const authorize = connect.headers.get("location")!;
  assert.ok(authorize.startsWith(production + "/session/authorize?challenge="));
  const denied = await fetch(authorize, { headers: { authorization: basic } });
  assert.doesNotMatch(await denied.text(), /name="ticket"/);
  const approval = await fetch(authorize, {
    headers: { cookie: productionCookie },
  });
  const html = await approval.text();
  assert.equal(approval.headers.get("cache-control"), "no-store");
  assert.equal(approval.headers.get("referrer-policy"), "origin");
  const ticket = html.match(/name="ticket" value="([^"]+)"/)![1];
  const exchange = (cookie: string, origin = production) =>
    fetch(staging + "/session/sso", {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie,
        origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ticket }),
    });
  assert.equal((await exchange("")).status, 400);
  assert.equal(
    (await exchange(stateCookie, "https://evil.example.com")).status,
    403,
  );
  const entered = await exchange(stateCookie);
  assert.equal(entered.status, 303);
  const stagingCookie = entered.headers
    .getSetCookie()
    .find((v) => v.startsWith("nook_admin_test="))!
    .split(";")[0];
  assert.equal((await exchange(stateCookie)).status, 400);
  assert.equal(
    (await request(production, "/api/state", stagingCookie)).status,
    401,
  );
  const stageSession = await (
    await request(staging, "/api/session", stagingCookie)
  ).json();
  assert.equal(stageSession.role, "admin");
  assert.equal(stageSession.environment, "staging");
  const initial = await (
    await request(staging, "/api/state", stagingCookie)
  ).json();
  const created = await fetch(staging + "/api/commands", {
    method: "POST",
    headers: {
      cookie: stagingCookie,
      origin: staging,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "cage.create",
      payload: { code: "STAGING-ONLY" },
      opId: randomUUID(),
      expectedRevision: initial.revision,
    }),
  });
  assert.equal(created.status, 200);
  const productionState = await (
    await request(production, "/api/state", productionCookie)
  ).json();
  assert.equal(productionState.cages.length, 0);
  stageProcess.kill("SIGTERM");
  await once(stageProcess, "exit");
  stageProcess = await start(true);
  assert.equal(
    (await (await request(staging, "/api/state", stagingCookie)).json())
      .cages[0].code,
    "STAGING-ONLY",
  );
  prodProcess.kill("SIGTERM");
  await once(prodProcess, "exit");
  prodProcess = await start(false);
  assert.equal(
    (await request(production, "/api/admin/environments", productionCookie))
      .status,
    200,
  );
  const logout = await fetch(production + "/session/logout", {
    method: "POST",
    headers: { cookie: productionCookie, origin: production },
    redirect: "manual",
  });
  assert.equal(logout.status, 303);
  assert.equal(
    (await request(production, "/api/admin/environments", productionCookie))
      .status,
    401,
  );
  assert.equal(
    (await request(staging, "/api/state", stagingCookie)).status,
    200,
  );
});
