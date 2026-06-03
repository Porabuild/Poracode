import type { HttpClient } from "./host";

/**
 * OpenCode.ai web-session primitives shared by the usage scanner (reads the Zen
 * balance) and the browser-login flow (verifies a captured cookie is a *real*
 * signed-in session before prompting). Kept here, behind the injected
 * {@link HttpClient}, so both the supervisor scanner and the main-process login
 * validator run the same proven request shape instead of drifting copies.
 *
 * Note: a cookie merely *named* `auth`/`__Host-auth` is not proof of a session —
 * the OpenAuth `/authorize` flow can set one before login completes, and stale
 * values linger in the cookie jar. Only {@link isOpenCodeSessionLive} (an actual
 * authenticated round-trip) reliably distinguishes a live session.
 */

const OPENCODE_WORKSPACES_SERVER_ID =
  "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
export const OPENCODE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

export const OPENCODE_AUTH_COOKIE_NAMES = new Set(["auth", "__Host-auth"]);

/**
 * Reduce a full `Cookie` header to just the OpenCode auth cookies, or undefined
 * when none are present. Used to forward the minimal credential to opencode.ai.
 */
export function openCodeRequestCookie(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const eq = part.indexOf("=");
      if (eq <= 0) return false;
      return OPENCODE_AUTH_COOKIE_NAMES.has(part.slice(0, eq));
    });
  return parts.length > 0 ? parts.join("; ") : undefined;
}

export function looksSignedOut(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("login") ||
    lower.includes("sign in") ||
    lower.includes("auth/authorize") ||
    lower.includes("not associated with an account") ||
    lower.includes('actor of type "public"')
  );
}

function collectWorkspaceIds(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectWorkspaceIds(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectWorkspaceIds(item, out);
    return;
  }
  if (typeof value === "string" && value.startsWith("wrk_") && !out.includes(value)) {
    out.push(value);
  }
}

export function workspaceIdsFromText(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/id\s*:\s*"([^"]+)"/g)) {
    const id = match[1];
    if (id?.startsWith("wrk_") && !ids.includes(id)) ids.push(id);
  }
  if (ids.length > 0) return ids;
  try {
    collectWorkspaceIds(JSON.parse(text), ids);
  } catch {
    // non-JSON server payload
  }
  return ids;
}

function serverHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    "X-Server-Id": OPENCODE_WORKSPACES_SERVER_ID,
    "X-Server-Instance": `server-fn:${globalThis.crypto.randomUUID()}`,
    "User-Agent": OPENCODE_USER_AGENT,
    Origin: "https://opencode.ai",
    Referer: "https://opencode.ai",
    Accept: "text/javascript, application/json;q=0.9, */*;q=0.8",
  };
}

/**
 * Resolve the user's workspace id from opencode.ai using the auth cookie, or
 * undefined when the cookie is missing/stale/signed-out. Doubles as the
 * authoritative "is this cookie a live session?" probe.
 */
export async function fetchOpenCodeWorkspaceId(
  http: HttpClient,
  cookie: string,
): Promise<string | undefined> {
  const getUrl = `https://opencode.ai/_server?id=${encodeURIComponent(OPENCODE_WORKSPACES_SERVER_ID)}`;
  for (const req of [
    { method: "GET" as const, url: getUrl },
    {
      method: "POST" as const,
      url: "https://opencode.ai/_server",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    },
  ]) {
    const res = await http.request({
      method: req.method,
      url: req.url,
      headers: { ...serverHeaders(cookie), ...(req.headers ?? {}) },
      ...(req.body !== undefined ? { body: req.body } : {}),
      timeoutMs: 5000,
    });
    if (res.status !== 200 || looksSignedOut(res.body)) continue;
    const id = workspaceIdsFromText(res.body)[0];
    if (id) return id;
  }
  return undefined;
}

/**
 * True iff the captured `Cookie` header authenticates as a live opencode.ai
 * session. Use this to gate the "Found a signed-in session" prompt so a stale
 * or in-progress-auth cookie never masquerades as a completed login.
 */
export async function isOpenCodeSessionLive(
  http: HttpClient,
  cookieHeader: string,
): Promise<boolean> {
  const cookie = openCodeRequestCookie(cookieHeader);
  if (!cookie) return false;
  return (await fetchOpenCodeWorkspaceId(http, cookie)) !== undefined;
}
