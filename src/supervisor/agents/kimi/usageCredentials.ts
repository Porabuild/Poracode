import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { parse as parseToml } from "smol-toml";
import type { OAuthToken } from "@poracode/agents-usage";
import { writeFileAtomic } from "@/shared/atomicFile";
import { coalesceByKey } from "@/shared/coalesce";
import { createNodeHttpClient } from "../../runtime/usageHttpClient";
import { nativeKimiHomePath } from "./paths";

/**
 * Native Kimi For Coding credential resolution: an explicit API
 * key from `KIMI_CODE_API_KEY` wins (with an optional `KIMI_CODE_BASE_URL`
 * endpoint override carried on the token's `raw` bag), else the Kimi Code
 * CLI's active OAuth identity is resolved from config.toml (honoring
 * KIMI_CODE_HOME), with compatibility for the original kimi-code.json layout. A
 * CLI credential is never combined with an endpoint override — a custom base
 * URL means a test proxy, and forwarding the CLI token there would leak it.
 * Expired tokens are renewed using the CLI's grant and storage protocol.
 * Concurrent CLI writes and logout win over a late refresh. Secrets never log.
 */

export const KIMI_API_KEY_ENV = "KIMI_CODE_API_KEY";
export const KIMI_BASE_URL_ENV = "KIMI_CODE_BASE_URL";

/** Sent alongside a CLI-sourced token, matching the official client. */
const KIMI_CLI_PLATFORM = "kimi_code_cli";

/** Trim surrounding whitespace and a single layer of wrapping quotes. */
function cleaned(raw: string | undefined): string | undefined {
  let value = raw?.trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

/** Pure: build the Kimi usage token from an explicit API key in the env. */
export function parseKimiEnv(env: Record<string, string | undefined>): OAuthToken | undefined {
  const accessToken = cleaned(env[KIMI_API_KEY_ENV]);
  if (!accessToken) return undefined;
  const baseUrl = cleaned(env[KIMI_BASE_URL_ENV]);
  return baseUrl ? { accessToken, raw: { baseUrl } } : { accessToken };
}

/** `expires_at` arrives as epoch seconds (or ms); normalize to epoch ms. */
function expiryEpochMs(value: unknown): number | undefined {
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

/**
 * Pure: parse the CLI credential file. Returns a token only while the access
 * token is fresh (at least 60s of validity left). The resolver below renews an
 * expired credential before passing it through this parser.
 */
export function parseKimiCliCredential(content: string, nowMs: number): OAuthToken | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const rawToken = record["access_token"] ?? record["accessToken"];
  const accessToken = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!accessToken) return undefined;
  const expiresAt = expiryEpochMs(record["expires_at"] ?? record["expiresAt"]);
  if (expiresAt === undefined || expiresAt <= nowMs + 60_000) return undefined;
  return { accessToken, expiresAt };
}

/** The CLI's stable device id, when it exists. Read-only: never created here. */
async function readDeviceId(): Promise<string | undefined> {
  try {
    const content = await readFile(join(nativeKimiHomePath(), "device_id"), "utf8");
    return cleaned(content);
  } catch {
    return undefined;
  }
}

interface CliIdentity {
  home: string;
  name: string;
  path: string;
  baseUrl: string;
  oauthHost: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function optionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
      return undefined;
    throw new Error("Kimi usage credential could not be read", { cause: error });
  }
}

function officialRegion(value: unknown, service: "api" | "auth"): "ai" | "com" | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      (service === "auth"
        ? !["", "/"].includes(url.pathname)
        : !["/coding", "/coding/", "/coding/v1", "/coding/v1/"].includes(url.pathname))
    )
      return undefined;
    return url.hostname === service + ".kimi.ai"
      ? "ai"
      : url.hostname === service + ".kimi.com"
        ? "com"
        : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the reference, not the newest file: other files may belong to other accounts. */
async function cliIdentity(): Promise<CliIdentity | undefined> {
  const home = nativeKimiHomePath();
  const content = await optionalFile(join(home, "config.toml"));
  let provider: Record<string, unknown> | undefined;
  if (content !== undefined) {
    let config: unknown;
    try {
      config = parseToml(content);
    } catch {
      return undefined;
    }
    if (!isRecord(config)) return undefined;
    const candidate = isRecord(config.providers)
      ? config.providers["managed:kimi-code"]
      : undefined;
    if (candidate !== undefined) {
      if (!isRecord(candidate)) return undefined;
      provider = candidate;
    }
  }
  let name = "kimi-code";
  let region: "ai" | "com";
  if (provider) {
    const oauth = provider.oauth;
    if (!isRecord(oauth) || oauth.storage !== "file" || typeof oauth.key !== "string")
      return undefined;
    name = oauth.key.replace(/^oauth\//, "");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return undefined;
    const apiRegion = officialRegion(provider.base_url, "api");
    const authRegion = officialRegion(oauth.oauth_host, "auth");
    if (
      (provider.base_url !== undefined && !apiRegion) ||
      (oauth.oauth_host !== undefined && !authRegion) ||
      (apiRegion && authRegion && apiRegion !== authRegion)
    )
      return undefined;
    region =
      apiRegion ??
      authRegion ??
      ((await optionalFile(join(home, "region")))?.trim() === "global" ? "ai" : "com");
  } else {
    region = (await optionalFile(join(home, "region")))?.trim() === "global" ? "ai" : "com";
  }
  const oauthHost = "https://auth.kimi." + region;
  const hostOverride = cleaned(process.env.KIMI_CODE_OAUTH_HOST ?? process.env.KIMI_OAUTH_HOST);
  if (hostOverride && hostOverride.replace(/\/+$/, "") !== oauthHost) return undefined;
  return {
    home,
    name,
    path: join(home, "credentials", name + ".json"),
    baseUrl: "https://api.kimi." + region + "/coding/v1",
    oauthHost,
  };
}

function storedCredential(content: string | undefined): Record<string, unknown> | undefined {
  if (content === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function withIdentity(token: OAuthToken, identity: CliIdentity): Promise<OAuthToken> {
  const identityHeaders: Record<string, string> = { "X-Msh-Platform": KIMI_CLI_PLATFORM };
  const deviceId = await readDeviceId();
  if (deviceId) identityHeaders["X-Msh-Device-Id"] = deviceId;
  return { ...token, raw: { baseUrl: identity.baseUrl, identityHeaders } };
}

const http = createNodeHttpClient();
const renewals = new Map<string, Promise<OAuthToken | undefined>>();
// Official CLI client id: MoonshotAI/kimi-code, packages/oauth/src/constants.ts.
const OAUTH_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";

async function stillActive(identity: CliIdentity): Promise<boolean> {
  const active = await cliIdentity();
  return (
    active?.path === identity.path &&
    active.oauthHost === identity.oauthHost &&
    active.baseUrl === identity.baseUrl
  );
}

async function renew(identity: CliIdentity, rejected?: string): Promise<OAuthToken | undefined> {
  // Match the official OAuthManager lock target on POSIX; on Windows the CLI
  // skips that advisory lock, so the before/after storage checks remain essential.
  const target = join(identity.home, "oauth", identity.name);
  await mkdir(join(identity.home, "oauth"), { recursive: true, mode: 0o700 });
  await writeFile(target, "", { flag: "a", mode: 0o600 });
  const release = await lockfile.lock(target, {
    realpath: false,
    stale: 5_000,
    retries: { retries: 10, minTimeout: 100, maxTimeout: 500 },
  });
  try {
    if (!(await stillActive(identity))) return undefined;
    const original = await optionalFile(identity.path);
    const fresh = original === undefined ? undefined : parseKimiCliCredential(original, Date.now());
    if (fresh && fresh.accessToken !== rejected) return withIdentity(fresh, identity);
    const saved = storedCredential(original);
    if (!saved) return undefined;
    const access = saved.access_token ?? saved.accessToken;
    const refresh = saved.refresh_token ?? saved.refreshToken;
    if (
      typeof access !== "string" ||
      !access.trim() ||
      typeof refresh !== "string" ||
      !refresh.trim() ||
      expiryEpochMs(saved.expires_at ?? saved.expiresAt) === undefined
    )
      return undefined;
    const headers = (await withIdentity({ accessToken: access }, identity)).raw
      ?.identityHeaders as Record<string, string>;
    const response = await http.request({
      method: "POST",
      url: identity.oauthHost + "/api/oauth/token",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: OAUTH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }).toString(),
      redirect: "manual",
      timeoutMs: 15_000,
    });
    if (!(await stillActive(identity))) return undefined;
    const current = await optionalFile(identity.path);
    // Logout, another login, or another refresh wins. Never restore or overwrite it.
    if (current !== original) {
      const winner =
        current === undefined ? undefined : parseKimiCliCredential(current, Date.now());
      return winner ? withIdentity(winner, identity) : undefined;
    }
    if (response.status === 401 || response.status === 403) return undefined;
    let result: unknown;
    try {
      result = JSON.parse(response.body);
    } catch {
      throw new Error("Kimi token refresh returned an invalid response");
    }
    if (isRecord(result) && result.error === "invalid_grant") return undefined;
    if (response.status !== 200) {
      throw new Error("Kimi token refresh failed (HTTP " + response.status + ")");
    }
    const expiresIn =
      isRecord(result) &&
      (typeof result.expires_in === "number" || typeof result.expires_in === "string")
        ? Number(result.expires_in)
        : NaN;
    if (
      !isRecord(result) ||
      typeof result.access_token !== "string" ||
      !result.access_token.trim() ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 60 ||
      !Number.isFinite(Date.now() + expiresIn * 1000) ||
      (result.refresh_token !== undefined &&
        (typeof result.refresh_token !== "string" || !result.refresh_token.trim()))
    ) {
      throw new Error("Kimi token refresh returned an invalid response");
    }
    const expiresAt = Date.now() + expiresIn * 1000;
    const accessKey = "access_token" in saved ? "access_token" : "accessToken";
    const refreshKey =
      "refreshToken" in saved && !("refresh_token" in saved) ? "refreshToken" : "refresh_token";
    const expiryKey = "expires_at" in saved ? "expires_at" : "expiresAt";
    const next = {
      ...saved,
      [accessKey]: result.access_token,
      [refreshKey]: result.refresh_token ?? refresh,
      [expiryKey]: Number(saved[expiryKey]) >= 1e12 ? expiresAt : expiresAt / 1000,
      expires_in: expiresIn,
      ...(typeof result.scope === "string" ? { scope: result.scope } : {}),
      ...(typeof result.token_type === "string" ? { token_type: result.token_type } : {}),
    };
    writeFileAtomic(identity.path, JSON.stringify(next, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
      exactMode: true,
    });
    return withIdentity({ accessToken: result.access_token, expiresAt }, identity);
  } finally {
    await release();
  }
}

async function resolveCliToken(rejected?: string): Promise<OAuthToken | undefined> {
  // Custom endpoint overrides are opt-in API-key connections, not OAuth recipients.
  if (cleaned(process.env[KIMI_BASE_URL_ENV])) return undefined;
  const identity = await cliIdentity();
  if (!identity) return undefined;
  const content = await optionalFile(identity.path);
  if (content === undefined) return undefined;
  const fresh = parseKimiCliCredential(content, Date.now());
  if (fresh && fresh.accessToken !== rejected) return withIdentity(fresh, identity);
  return coalesceByKey(renewals, identity.path, () => renew(identity, rejected));
}

export async function resolveKimiToken(): Promise<OAuthToken | undefined> {
  return parseKimiEnv(process.env) ?? resolveCliToken();
}

/** Used only for a rejected CLI token, never a pasted or environment API key. */
export async function refreshRejectedKimiToken(token: OAuthToken): Promise<OAuthToken | undefined> {
  if (parseKimiEnv(process.env)) return undefined;
  return resolveCliToken(token.accessToken);
}
