import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AntigravityModelQuota } from "@lightcode/agents-usage";

/**
 * Antigravity language-server RPC: the Connect-RPC calls against the loopback LS
 * (`GetUserStatus` / `GetCommandModelConfigs`) and the pure parsers that pull
 * plan name and per-model quota out of the responses. Best-effort and fail-safe;
 * nothing is logged.
 */

const SERVICE = "exa.language_server_pb.LanguageServerService";
export const GET_USER_STATUS = `/${SERVICE}/GetUserStatus`;
export const GET_COMMAND_MODEL_CONFIGS = `/${SERVICE}/GetCommandModelConfigs`;
// The current quota surface: two model groups (Gemini, Claude+GPT) each with a
// shared 5-hour and weekly limit. Preferred over the per-model quotaInfo, which
// only carries the 5-hour fraction.
export const RETRIEVE_USER_QUOTA_SUMMARY = `/${SERVICE}/RetrieveUserQuotaSummary`;
// The metadata the LS expects; the values are cosmetic but must be present.
const REQUEST_BODY = JSON.stringify({
  metadata: {
    ideName: "antigravity",
    extensionName: "antigravity",
    ideVersion: "unknown",
    locale: "en",
  },
});

/** POST to the LS on one port, trying https (self-signed) then http, with each CSRF candidate. */
export async function queryLs(
  port: number,
  path: string,
  csrfTokens: string[],
): Promise<unknown | undefined> {
  // `agy` needs no token, so try none first; the IDE needs its per-session one.
  const csrfCandidates = [undefined, ...csrfTokens];
  for (const scheme of ["https", "http"] as const) {
    for (const csrf of csrfCandidates) {
      const body = await postJson(scheme, port, path, csrf);
      if (body !== undefined) return body;
    }
  }
  return undefined;
}

/** A single localhost JSON POST; resolves `undefined` on any non-2xx/error. */
function postJson(
  scheme: "http" | "https",
  port: number,
  path: string,
  csrf: string | undefined,
): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const requester = scheme === "https" ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
      "Content-Length": String(Buffer.byteLength(REQUEST_BODY)),
      ...(csrf ? { "x-codeium-csrf-token": csrf } : {}),
    };
    const req = requester(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers,
        timeout: 5_000,
        // Self-signed cert; this only ever talks to loopback.
        ...(scheme === "https" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          resolve(undefined);
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as unknown);
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    req.on("error", () => resolve(undefined));
    req.on("timeout", () => {
      req.destroy();
      resolve(undefined);
    });
    req.write(REQUEST_BODY);
    req.end();
  });
}

/** Pull the plan name out of a GetUserStatus body (userTier wins over the legacy planInfo). */
export function planFromUserStatus(body: unknown): string | undefined {
  const status = (body as { userStatus?: Record<string, unknown> } | null | undefined)?.userStatus;
  if (!status || typeof status !== "object") return undefined;
  const userTier = (status as { userTier?: { name?: unknown } }).userTier;
  if (userTier && typeof userTier.name === "string" && userTier.name.trim())
    return userTier.name.trim();
  const planName = (status as { planStatus?: { planInfo?: { planName?: unknown } } }).planStatus
    ?.planInfo?.planName;
  return typeof planName === "string" && planName.trim() ? planName.trim() : undefined;
}

/** Pull the signed-in account email out of a GetUserStatus body. */
export function emailFromUserStatus(body: unknown): string | undefined {
  const status = (body as { userStatus?: Record<string, unknown> } | null | undefined)?.userStatus;
  if (!status || typeof status !== "object") return undefined;
  const email = (status as { email?: unknown }).email;
  return typeof email === "string" && email.trim() ? email.trim() : undefined;
}

/**
 * Walk the LS response for `clientModelConfigs` entries — objects carrying a
 * string `label` next to `quotaInfo.remainingFraction`. Pooled downstream into
 * Gemini Pro / Gemini Flash / Claude windows.
 */
export function modelsFromBody(body: unknown): AntigravityModelQuota[] {
  const models: AntigravityModelQuota[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const quota =
      obj.quotaInfo && typeof obj.quotaInfo === "object"
        ? (obj.quotaInfo as Record<string, unknown>)
        : undefined;
    if (
      typeof obj.label === "string" &&
      obj.label.trim() &&
      quota &&
      typeof quota.remainingFraction === "number" &&
      Number.isFinite(quota.remainingFraction)
    ) {
      const reset = typeof quota.resetTime === "string" ? Date.parse(quota.resetTime) : NaN;
      models.push({
        label: obj.label,
        remainingFraction: quota.remainingFraction,
        resetsAt: Number.isFinite(reset) ? reset : undefined,
      });
    }
    for (const value of Object.values(obj)) visit(value);
  };
  visit(body);
  return models;
}
