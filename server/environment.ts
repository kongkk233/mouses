import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface EnvironmentConfig {
  name: "production" | "staging" | "development";
  origin: string;
  productionOrigin: string;
  stagingOrigin: string;
  adminPassword: string;
  signingKey: string;
  verificationKey: string;
  statusToken: string;
  stagingStatusUrl: string;
}
function origin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Environment origins must use HTTPS or local HTTP");
  return url.origin;
}
export function loadEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentConfig {
  const name =
    env.APP_ENV ||
    (env.NODE_ENV === "production" ? "production" : "development");
  if (!["production", "staging", "development"].includes(name))
    throw new Error("Invalid APP_ENV");
  if (name === "staging" && (!env.ADMIN_PASSWORD || env.PUSH_ENABLED !== "0"))
    throw new Error("Staging requires ADMIN_PASSWORD and PUSH_ENABLED=0");
  if (
    name === "staging" &&
    (!env.DATA_DIR || resolve(env.DATA_DIR) === "/var/lib/mouse-nook")
  )
    throw new Error("Staging requires an explicit isolated DATA_DIR");
  if (name === "staging" && env.STAGING_SIGNING_KEY)
    throw new Error("Staging must not hold the production signing key");
  if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD === env.APP_PASSWORD)
    throw new Error("Administrator and member passwords must differ");
  const stagingStatusUrl = env.STAGING_STATUS_URL || "";
  if (stagingStatusUrl) {
    const url = new URL(stagingStatusUrl);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/internal/status" ||
      url.search ||
      url.hash
    )
      throw new Error("Staging status must use a fixed loopback endpoint");
  }
  return {
    name: name as EnvironmentConfig["name"],
    origin: origin(env.APP_ORIGIN || `http://127.0.0.1:${env.PORT || 3001}`),
    productionOrigin: env.PRODUCTION_ORIGIN
      ? origin(env.PRODUCTION_ORIGIN)
      : "",
    stagingOrigin: env.STAGING_ORIGIN ? origin(env.STAGING_ORIGIN) : "",
    adminPassword: env.ADMIN_PASSWORD || "",
    signingKey: env.STAGING_SIGNING_KEY || "",
    verificationKey: env.STAGING_VERIFY_KEY || "",
    statusToken: env.ENV_STATUS_TOKEN || "",
    stagingStatusUrl,
  };
}
export function releaseInfo(config: EnvironmentConfig) {
  let release: { commit?: string; deployedAt?: string } = {};
  try {
    release = JSON.parse(readFileSync(resolve("release.json"), "utf8"));
  } catch {}
  return {
    environment: config.name,
    origin: config.origin,
    version: /^[a-f0-9]{40}$/.test(release.commit || "")
      ? release.commit!
      : "local",
    deployedAt: release.deployedAt || null,
    pushEnabled: process.env.PUSH_ENABLED !== "0",
  };
}
