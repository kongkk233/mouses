import express from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const COOKIE = "nook_session";
const WEEK = 7 * 86400000;
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function issueSession(password: string, now = Date.now()): string {
  const payload = `${now + WEEK}.${randomBytes(16).toString("hex")}`;
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
function loginPage(error = "") {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fbf7f4"><title>回到小窝 · 鼠鼠小窝</title><link rel="icon" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(ellipse at 70% 20%,#f1e1d9,transparent 60%),#fbf7f4;color:#6b4a54;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;padding:24px}main{width:min(360px,100%);text-align:center}img{width:180px;height:180px;object-fit:contain}h1{font-size:28px;font-family:'Songti SC',serif;font-weight:600;letter-spacing:2px;margin:12px 0 28px}form{text-align:left;background:#fffdf9;border:1px solid #eadbd3;border-radius:19px;padding:25px;box-shadow:0 8px 40px #8c56500a}label{font-size:13px;color:#806770;display:block;margin-bottom:10px}input{width:100%;height:46px;background:#fbf7f3;border:1px solid #e4d4ce;border-radius:9px;padding:12px;font-size:16px;color:#65464f;outline:none}input:focus{border-color:#b06c80;box-shadow:0 0 0 3px #b06c8015}button{border:0;border-radius:9px;width:100%;height:46px;background:#ad5d70;color:white;margin-top:19px;font-size:14px;cursor:pointer}button:hover{background:#98495f}p{font-size:12px;color:#9e4f49;line-height:1.7;margin:12px 0 0}footer{margin-top:24px;font-size:10px;color:#8a7074;letter-spacing:2px}</style></head><body><main><img src="/assets/mice/cream-idle.webp" alt="等待你的小鼠"><h1>欢迎回到小窝</h1><form method="post" action="/session"><input type="hidden" name="username" autocomplete="username" value="admin"><label for="password">访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required autofocus>${error ? `<p role="alert">${error}</p>` : ""}<button type="submit">进入小窝</button></form><footer>鼠鼠小窝 · MOUSE NOOK</footer></main></body></html>`;
}
export function accessGate() {
  const router = express.Router(),
    attempts = new Map<string, { count: number; until: number }>();
  const password = process.env.APP_PASSWORD;
  const allowed = new Set(
    [
      process.env.APP_ORIGIN,
      `http://127.0.0.1:${process.env.PORT || 3001}`,
      `http://localhost:${process.env.PORT || 3001}`,
    ].filter(Boolean),
  );
  const sameOrigin = (req: express.Request) =>
    !!req.headers.origin && allowed.has(req.headers.origin);
  router.post(
    "/session",
    express.urlencoded({ extended: false, limit: "2kb" }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (!password) {
        res.redirect(303, "/");
        return;
      }
      if (!sameOrigin(req)) {
        res.status(403).send(loginPage("请从小窝页面重新登录"));
        return;
      }
      const ip = req.ip || "local",
        now = Date.now();
      let limit = attempts.get(ip);
      if (!limit || limit.until <= now)
        limit = { count: 0, until: now + 60000 };
      if (limit.count >= 8) {
        res.status(429).send(loginPage("尝试次数较多，请一分钟后重试"));
        return;
      }
      const given =
        typeof req.body?.password === "string" ? req.body.password : "";
      if (!equal(given, password)) {
        limit.count++;
        if (attempts.size > 1000) attempts.clear();
        attempts.set(ip, limit);
        res.status(401).send(loginPage("密码不正确，请重试"));
        return;
      }
      attempts.delete(ip);
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${issueSession(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${WEEK / 1000}${req.secure ? "; Secure" : ""}`,
      );
      res.redirect(303, "/");
    },
  );
  router.post("/session/logout", (req, res) => {
    if (!sameOrigin(req)) {
      res.status(403).send("请从小窝页面退出");
      return;
    }
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${req.secure ? "; Secure" : ""}`,
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
    if (!password || publicAssets.has(req.path)) {
      next();
      return;
    }
    const basic = req.headers.authorization?.startsWith("Basic ")
      ? Buffer.from(req.headers.authorization.slice(6), "base64").toString()
      : "";
    const token =
      (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(COOKIE + "="))
        ?.slice(COOKIE.length + 1) || "";
    if (equal(basic, `admin:${password}`) || verifySession(token, password)) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    if (req.path.startsWith("/api/"))
      res
        .status(401)
        .json({
          error: "访问已过期，请重新登录后重试",
          field: "authentication",
        });
    else res.status(200).type("html").send(loginPage());
  });
  return router;
}
