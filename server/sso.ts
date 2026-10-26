import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import type { EnvironmentConfig } from "./environment.js";

export const ssoDigest = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export const newChallenge = () => randomBytes(32).toString("base64url");
export function createTicket(
  config: EnvironmentConfig,
  challenge: string,
  now = Date.now(),
) {
  if (
    !config.signingKey ||
    !config.stagingOrigin ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge)
  )
    throw new Error("测试环境登录尚未配置");
  const payload = Buffer.from(
    JSON.stringify({
      issuer: config.origin,
      audience: config.stagingOrigin,
      role: "admin",
      challenge,
      nonce: newChallenge(),
      expires: now + 60000,
    }),
  ).toString("base64url");
  const key = createPrivateKey({
    key: Buffer.from(config.signingKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return (
    payload + "." + sign(null, Buffer.from(payload), key).toString("base64url")
  );
}
export function readTicket(
  config: EnvironmentConfig,
  ticket: unknown,
  state: string,
  now = Date.now(),
) {
  if (
    typeof ticket !== "string" ||
    ticket.length > 4096 ||
    !/^[A-Za-z0-9_-]{43}$/.test(state) ||
    !config.verificationKey ||
    !config.productionOrigin
  )
    throw new Error("登录凭据无效，请从管理控制台重新进入");
  const [payload, signature, ...extra] = ticket.split(".");
  const key = createPublicKey({
    key: Buffer.from(config.verificationKey, "base64"),
    format: "der",
    type: "spki",
  });
  if (
    extra.length ||
    !signature ||
    !verify(
      null,
      Buffer.from(payload),
      key,
      Buffer.from(signature, "base64url"),
    )
  )
    throw new Error("登录凭据无效，请从管理控制台重新进入");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    data.issuer !== config.productionOrigin ||
    data.audience !== config.origin ||
    data.role !== "admin" ||
    data.challenge !== ssoDigest(state) ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.nonce) ||
    !Number.isFinite(data.expires) ||
    data.expires <= now ||
    data.expires > now + 60000
  )
    throw new Error("登录凭据已过期或不属于当前浏览器，请重新进入");
  return data as { nonce: string; expires: number };
}
