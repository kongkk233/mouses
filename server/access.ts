import express from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EnvironmentConfig } from "./environment.js";
import { createTicket, readTicket, newChallenge, ssoDigest } from "./sso.js";
import { SPRITE_VERSION } from "../shared/generated-assets.js";
const COOKIE = "nook_session";
const WEEK = 7 * 86400000;
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function issueSession(
  password: string,
  now = Date.now(),
  duration = WEEK,
): string {
  const payload = `${now + duration}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${createHmac("sha256", password).update(payload).digest("base64url")}`;
}
export function verifySession(
  token: string,
  password: string,
  now = Date.now(),
): boolean {
  if (token.length > 256) return false;
  const [expiry, nonce, signature, ...extra] = token.split(".");
  if (
    extra.length ||
    !/^\d+$/.test(expiry || "") ||
    !/^[a-f0-9]{32}$/.test(nonce || "") ||
    !signature ||
    Number(expiry) <= now
  )
    return false;
  return equal(
    signature,
    createHmac("sha256", password)
      .update(`${expiry}.${nonce}`)
      .digest("base64url"),
  );
}
function safeReturnPath(value: unknown): string {
  return typeof value === "string" &&
    value.length <= 2048 &&
    (value === "/" ||
      value === "/admin" ||
      value.startsWith("/?") ||
      /^\/session\/authorize\?challenge=[A-Za-z0-9_-]{43}$/.test(value)) &&
    !/[\\\u0000-\u001f]/.test(value)
    ? value
    : "/";
}
function loginPage(error = "", returnTo = "/", admin = false) {
  const target = safeReturnPath(returnTo).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fbf7f4"><title>回到小窝 · 鼠鼠小窝</title><link rel="icon" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(ellipse at 70% 20%,#f1e1d9,transparent 60%),#fbf7f4;color:#6b4a54;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;padding:24px}main{width:min(360px,100%);text-align:center}img{width:180px;height:180px;object-fit:contain}h1{font-size:28px;font-family:'Songti SC',serif;font-weight:600;letter-spacing:2px;margin:12px 0 28px}form{text-align:left;background:#fffdf9;border:1px solid #eadbd3;border-radius:19px;padding:25px;box-shadow:0 8px 40px #8c56500a}label{font-size:13px;color:#806770;display:block;margin-bottom:10px}input,select{width:100%;height:46px;background:#fbf7f3;border:1px solid #e4d4ce;border-radius:9px;padding:12px;font-size:16px;color:#65464f;outline:none}input:focus{border-color:#b06c80;box-shadow:0 0 0 3px #b06c8015}button{border:0;border-radius:9px;width:100%;height:46px;background:#ad5d70;color:white;margin-top:19px;font-size:14px;cursor:pointer}button:hover{background:#98495f}p{font-size:12px;color:#9e4f49;line-height:1.7;margin:12px 0 0}footer{margin-top:24px;font-size:10px;color:#8a7074;letter-spacing:2px}</style></head><body><main><img src="/assets/mice/cream-idle.webp?v=${SPRITE_VERSION}" alt="等待你的小鼠"><h1>欢迎回到小窝</h1><form method="post" action="/session"><input type="hidden" name="returnTo" value="${target}"><label for="username">登录身份</label><select id="username" name="username" style="margin-bottom:18px" autocomplete="username"><option value="user" ${admin ? "" : "selected"}>小窝访问</option><option value="admin" ${admin ? "selected" : ""}>管理员 admin</option></select><label for="password">访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required autofocus>${error ? `<p role="alert">${error}</p>` : ""}<button type="submit">进入小窝</button></form><footer>鼠鼠小窝 · MOUSE NOOK</footer></main></body></html>`;
}
function cookie(req: express.Request, name: string) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export const requireAdmin: express.RequestHandler = (_req, res, next) => {
  if (res.locals.role !== "admin") {
    res.status(403).json({
      error: "需要管理员身份，请使用 admin 登录",
      field: "authorization",
    });
    return;
  }
  next();
};
export function accessGate(db: DatabaseSync, config: EnvironmentConfig) {
  const router = express.Router();
  const attempts = new Map<string, { count: number; until: number }>();
  const password = process.env.APP_PASSWORD;
  const staging = config.name === "staging";
  const adminCookie = staging ? "nook_admin_test" : "nook_admin";
  const stateCookie = "nook_sso_state";
  const allowed = new Set([
    config.origin,
    `http://127.0.0.1:${process.env.PORT || 3001}`,
    `http://localhost:${process.env.PORT || 3001}`,
  ]);
  const sameOrigin = (req: express.Request) =>
    !!req.headers.origin && allowed.has(req.headers.origin);
  db.exec(`CREATE TABLE IF NOT EXISTS access_sessions (
    token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS consumed_tickets (
    nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`);
  const setCookie = (
    req: express.Request,
    name: string,
    value: string,
    maxAge: number,
  ) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? "; Secure" : ""}`;
  const adminSession = (req: express.Request) => {
    const token = issueSession(config.adminPassword, Date.now(), 12 * 3600000);
    db.prepare("DELETE FROM access_sessions WHERE expires_at<=?").run(
      Date.now(),
    );
    db.prepare("INSERT INTO access_sessions VALUES (?,?)").run(
      ssoDigest(token),
      Date.now() + 12 * 3600000,
    );
    return setCookie(req, adminCookie, token, 12 * 3600);
  };
  const role = (req: express.Request): "admin" | "member" | null => {
    const basic = req.headers.authorization?.startsWith("Basic ")
      ? Buffer.from(req.headers.authorization.slice(6), "base64").toString()
      : "";
    const admin = cookie(req, adminCookie);
    if (
      config.adminPassword &&
      (equal(basic, `admin:${config.adminPassword}`) ||
        (verifySession(admin, config.adminPassword) &&
          !!db
            .prepare(
              "SELECT 1 FROM access_sessions WHERE token_hash=? AND expires_at>?",
            )
            .get(ssoDigest(admin), Date.now())))
    )
      return "admin";
    if (
      !staging &&
      (!password ||
        equal(basic, `admin:${password}`) ||
        equal(basic, `user:${password}`) ||
        verifySession(cookie(req, COOKIE), password))
    )
      return "member";
    return null;
  };
  router.get("/session/bridge.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res
      .type("application/javascript")
      .send('document.getElementById("sso-continue").requestSubmit();');
  });
  router.get("/session/connect", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!staging || !config.productionOrigin || !config.verificationKey) {
      res.status(503).send("测试环境统一登录尚未配置");
      return;
    }
    const state = newChallenge();
    res.setHeader("Set-Cookie", setCookie(req, stateCookie, state, 120));
    res.redirect(
      303,
      `${config.productionOrigin}/session/authorize?challenge=${ssoDigest(state)}`,
    );
  });
  router.get("/session/authorize", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // Cross-origin form POSTs need a verifiable Origin; tickets never enter URLs.
    res.setHeader("Referrer-Policy", "origin");
    const challenge = String(req.query.challenge || "");
    if (
      staging ||
      !config.stagingOrigin ||
      !config.signingKey ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    ) {
      res.status(400).send("测试环境登录请求无效");
      return;
    }
    if (role(req) !== "admin") {
      res
        .type("html")
        .send(loginPage("", `/session/authorize?challenge=${challenge}`, true));
      return;
    }
    const ticket = createTicket(config, challenge);
    res
      .type("html")
      .send(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>进入测试环境</title><body><form id="sso-continue" method="post" action="${config.stagingOrigin}/session/sso"><input type="hidden" name="ticket" value="${ticket}"><button type="submit">进入测试环境</button></form><script src="/session/bridge.js"></script></body></html>`,
      );
  });
  router.post(
    "/session/sso",
    express.urlencoded({ extended: false, limit: "8kb" }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (!staging || req.headers.origin !== config.productionOrigin) {
        res.status(403).send("登录来源无效");
        return;
      }
      try {
        const ticket = readTicket(
          config,
          req.body?.ticket,
          cookie(req, stateCookie),
        );
        db.prepare("DELETE FROM consumed_tickets WHERE expires_at<=?").run(
          Date.now(),
        );
        const inserted = db
          .prepare("INSERT OR IGNORE INTO consumed_tickets VALUES (?,?)")
          .run(ticket.nonce, ticket.expires);
        if (!inserted.changes) throw new Error("登录凭据已使用，请重新进入");
        res.setHeader("Set-Cookie", [
          adminSession(req),
          setCookie(req, stateCookie, "", 0),
        ]);
        res.redirect(303, "/");
      } catch {
        res
          .status(400)
          .send("登录凭据无效、已过期或已使用，请从管理控制台重新进入");
      }
    },
  );
  router.post(
    "/session",
    express.urlencoded({ extended: false, limit: "8kb" }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const admin = req.body?.username === "admin";
      const returnTo = safeReturnPath(req.body?.returnTo);
      if (!sameOrigin(req)) {
        res
          .status(403)
          .send(loginPage("请从小窝页面重新登录", returnTo, admin));
        return;
      }
      if (
        !admin &&
        (returnTo === "/admin" || returnTo.startsWith("/session/authorize?"))
      ) {
        res
          .status(403)
          .send(loginPage("管理入口请使用管理员身份登录", returnTo, true));
        return;
      }
      const ip = req.ip || "local",
        now = Date.now();
      let limit = attempts.get(ip);
      if (!limit || limit.until <= now)
        limit = { count: 0, until: now + 60000 };
      if (limit.count >= 8) {
        res
          .status(429)
          .send(loginPage("尝试次数较多，请一分钟后重试", returnTo, admin));
        return;
      }
      const given =
        typeof req.body?.password === "string" ? req.body.password : "";
      const expected = admin ? config.adminPassword : password;
      if ((staging && !admin) || !expected || !equal(given, expected)) {
        limit.count++;
        if (attempts.size > 1000) attempts.clear();
        attempts.set(ip, limit);
        res
          .status(401)
          .send(
            loginPage(
              "密码不正确或此身份不可用，请重试",
              returnTo,
              admin || staging,
            ),
          );
        return;
      }
      attempts.delete(ip);
      res.setHeader(
        "Set-Cookie",
        admin
          ? adminSession(req)
          : setCookie(req, COOKIE, issueSession(expected), WEEK / 1000),
      );
      res.redirect(303, admin && returnTo === "/" ? "/admin" : returnTo);
    },
  );
  router.post("/session/logout", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!sameOrigin(req)) {
      res.status(403).send("请从小窝页面退出");
      return;
    }
    db.prepare("DELETE FROM access_sessions WHERE token_hash=?").run(
      ssoDigest(cookie(req, adminCookie)),
    );
    const names = staging ? [adminCookie, stateCookie] : [COOKIE, adminCookie];
    res.setHeader(
      "Set-Cookie",
      names.map((name) => setCookie(req, name, "", 0)),
    );
    res.redirect(303, "/");
  });
  const publicAssets = new Set([
    "/assets/mice/cream-idle.webp",
    "/favicon.svg",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
  ]);
  router.use((req, res, next) => {
    res.locals.role = role(req);
    if (publicAssets.has(req.path)) {
      next();
      return;
    }
    if (
      res.locals.role &&
      (req.path !== "/admin" || res.locals.role === "admin")
    ) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    if (req.path !== "/" && req.path !== "/admin")
      res.status(401).json({
        error: "访问已过期，请重新登录后重试",
        field: "authentication",
      });
    else
      res
        .status(200)
        .type("html")
        .send(loginPage("", req.originalUrl, staging || req.path === "/admin"));
  });
  return router;
}
