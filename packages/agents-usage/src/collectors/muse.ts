import type { CollectOptions, HostPort } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

/**
 * Reads subscription quotas and billed spend through the dashboard's Relay query.
 * Bootstrap the app shell for fresh Comet tokens; `/usage` requires browser routing.
 * The browser login captures the session cookie and selected team.
 */
export const MUSE_PROVIDER_ID = "muse" as const;

export const MUSE_DASHBOARD_URL = "https://dev.meta.ai/usage";
const MUSE_ORIGIN = "https://dev.meta.ai";
const MUSE_BOOTSTRAP_URL = `${MUSE_ORIGIN}/`;
const MUSE_GRAPHQL_URL = `${MUSE_ORIGIN}/api/graphql/`;

/** The dashboard's own usage operation. */
const MUSE_USAGE_DOC_ID = "28117303444603430";
const MUSE_USAGE_OPERATION = "LLMDCUsageQuery";

/**
 * Chromium UA. Meta gates the Comet endpoints on a browser-shaped client, and
 * the captured cookie was minted in the app's Chromium browser view, so the
 * request must not advertise a bespoke agent string.
 */
const MUSE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/152.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 15_000;

/** Pay-as-you-go spend window, in days. */
const SPEND_WINDOW_DAYS = 30;

function browserHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    "User-Agent": MUSE_USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
  };
}

/** `for(;;);`-style anti-JSON-hijacking prefixes Meta puts on Comet responses. */
function stripJsonPrefix(body: string): string {
  const start = body.indexOf("{");
  if (start <= 0) return body;
  const prefix = body.slice(0, start);
  return /^\s*(?:for\s*\(\s*;\s*;\s*\)\s*;|\)\]\}',?)\s*$/.test(prefix) ? body.slice(start) : body;
}

function firstMatch(html: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return value;
  }
  return undefined;
}

/**
 * Comet page tokens. In the shell's HTML every one of these blocks is serialized
 * inside a JavaScript string literal, so the quotes arrive backslash-escaped —
 * `[\"LSD\",[],{\"token\":\"…\"},323]`, as served by a real `dev.meta.ai` load —
 * and matching against the raw bytes finds nothing. Unescape once, then match
 * the plain forms. Missing tokens are omitted. USER_ID can be "0" even when
 * signed in: it is distinct from Relay's actorID and must be replayed as-is.
 */
export function parseMuseCometTokens(html: string): {
  teamId?: string;
  lsd?: string;
  fbDtsg?: string;
  actorId?: string;
  userId?: string;
  cometReq?: string;
  rev?: string;
  hsi?: string;
} {
  const flat = html.replaceAll('\\"', '"');
  const teamId = firstMatch(flat, [
    /[?&]team_id=([0-9a-zA-Z_-]+)/,
    /"team_id"\s*:\s*"([0-9a-zA-Z_-]+)"/,
  ]);
  const lsd = firstMatch(flat, [
    /"LSD"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/,
    /name="lsd"\s+value="([^"]+)"/,
  ]);
  // The token is required to be non-empty: a logged-out shell defines
  // DTSGInitialData with an empty object, which must read as "absent".
  const fbDtsg = firstMatch(flat, [
    /"DTSGInitialData"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/,
    /name="fb_dtsg"\s+value="([^"]+)"/,
  ]);
  const actorId = firstMatch(flat, [/"actorID"\s*:\s*"([0-9]+)"/]);
  const userId = firstMatch(flat, [/"USER_ID"\s*:\s*"([0-9]+)"/]);
  const cometReq = firstMatch(flat, [/"comet_env"\s*:\s*([0-9]+)/]);
  // A zero actor is anonymous; USER_ID is independent and may legitimately be zero.
  const actor = actorId !== undefined && actorId !== "0" ? actorId : undefined;
  const rev = firstMatch(flat, [/"__spin_r"\s*:\s*([0-9]+)/, /"client_revision"\s*:\s*([0-9]+)/]);
  const hsi = firstMatch(flat, [/"hsi"\s*:\s*"([^"]+)"/]);
  return {
    ...(teamId ? { teamId } : {}),
    ...(lsd ? { lsd } : {}),
    ...(fbDtsg ? { fbDtsg } : {}),
    ...(actor ? { actorId: actor } : {}),
    ...(userId ? { userId } : {}),
    ...(cometReq ? { cometReq } : {}),
    ...(rev ? { rev } : {}),
    ...(hsi ? { hsi } : {}),
  };
}

/** Meta's `jazoest` checksum: the digits of `fb_dtsg`'s char codes summed. */
export function museJazoest(fbDtsg: string): string {
  let sum = 0;
  for (const char of fbDtsg) sum += char.charCodeAt(0);
  return `2${sum}`;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` bounds covering the trailing spend window, inclusive. */
export function museSpendWindow(nowMs: number): { start: string; end: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    start: isoDate(nowMs - (SPEND_WINDOW_DAYS - 1) * dayMs),
    end: isoDate(nowMs),
  };
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Walk every plain object in a Relay payload, depth-bounded. */
function* objectsIn(value: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 12 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) yield* objectsIn(entry, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  yield record;
  for (const nested of Object.values(record)) yield* objectsIn(nested, depth + 1);
}

/**
 * A money amount in Meta's Comet shape: `{ amount_with_offset: "141" }` is
 * minor units (cents), while a bare `amount` / number is already major units.
 */
function moneyFrom(value: unknown): number | undefined {
  const direct = numberFrom(value);
  if (direct !== undefined) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const withOffset = numberFrom(record.amount_with_offset);
  if (withOffset !== undefined) {
    const offset = numberFrom(record.offset) ?? 2;
    return withOffset / 10 ** offset;
  }
  return numberFrom(record.amount) ?? numberFrom(record.total);
}

/**
 * Pay-as-you-go spend: sum the `usage_billable_cost` series in
 * `spend_cost_metrics`. The dashboard renders the same series as its
 * "Spend (USD)" total, so summing the buckets matches the headline figure.
 */
export function parseMuseSpend(payload: unknown): number | undefined {
  for (const node of objectsIn(payload)) {
    const metrics = node.spend_cost_metrics;
    if (!Array.isArray(metrics)) continue;
    for (const entry of metrics) {
      if (!entry || typeof entry !== "object") continue;
      const series = entry as Record<string, unknown>;
      if (series.identifier !== undefined && series.identifier !== "usage_billable_cost") continue;
      const points = series.categorical_data;
      if (!Array.isArray(points)) continue;
      let sum = 0;
      let seen = false;
      for (const point of points) {
        if (!point || typeof point !== "object") continue;
        const amount = moneyFrom((point as Record<string, unknown>).value);
        if (amount === undefined) continue;
        sum += amount;
        seen = true;
      }
      if (seen) return Math.round(sum * 100) / 100;
    }
  }
  return undefined;
}

/** Subscription fields returned by LLMDCUsageQuery, verified against the dashboard. */
export function parseMuseQuotaWindows(payload: unknown): UsageWindow[] {
  for (const node of objectsIn(payload)) {
    const quota = node.subscription_quota_usage;
    if (!quota || typeof quota !== "object" || Array.isArray(quota)) continue;
    const record = quota as Record<string, unknown>;
    const windows: UsageWindow[] = [];
    for (const [prefix, id, label] of [
      ["window", "session-5h", "Current usage"],
      ["weekly", "weekly", "Weekly limit"],
    ] as const) {
      const used = numberFrom(record[`${prefix}_weighted_used`]);
      const limit = numberFrom(record[`${prefix}_weighted_limit`]);
      if (used === undefined || limit === undefined || limit <= 0) continue;
      const resetsAt = numberFrom(record[`${prefix}_resets_at`]);
      windows.push({
        id,
        label,
        usedPercent: Math.min(100, Math.max(0, (used / limit) * 100)),
        unit: "percent",
        ...(resetsAt !== undefined && resetsAt > 0 ? { resetsAt: resetsAt * 1000 } : {}),
      });
    }
    return windows;
  }
  return [];
}

function graphQLErrorFrom(payload: unknown): string | undefined {
  for (const node of objectsIn(payload)) {
    const errors = node.errors;
    if (!Array.isArray(errors) || errors.length === 0) continue;
    const first = errors[0];
    if (first && typeof first === "object") {
      const message = (first as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  return undefined;
}

/** Load the app shell and scrape its request-scoped Comet tokens. */
async function fetchCometTokens(
  host: HostPort,
  cookie: string,
): Promise<ReturnType<typeof parseMuseCometTokens> | undefined> {
  const res = await host.http
    .request({
      url: MUSE_BOOTSTRAP_URL,
      headers: {
        ...browserHeaders(cookie),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Sec-Fetch-Dest": "document",
      },
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
    .catch(() => undefined);
  if (!res || res.status < 200 || res.status >= 300) return undefined;
  return parseMuseCometTokens(res.body);
}

/**
 * Collect Muse usage. Needs a captured `dev.meta.ai` cookie session; without
 * one (or once it expires) there is no other source, so this reports
 * `auth-missing` rather than a partial snapshot.
 */
export async function collectMuse(host: HostPort, _opts?: CollectOptions): Promise<UsageSnapshot> {
  const nowMs = host.now();
  const cookie = (await host.credentials.getSecret(MUSE_PROVIDER_ID, "cookie"))?.trim();
  if (!cookie) {
    return {
      providerId: MUSE_PROVIDER_ID,
      status: "auth-missing",
      windows: [],
      fetchedAt: nowMs,
    };
  }

  const tokens = await fetchCometTokens(host, cookie);
  if (!tokens) {
    // The shell would not load with this cookie: expired session, or Meta
    // refusing a non-browser navigation.
    host.log?.warn("muse: dev.meta.ai app shell did not load");
    return { providerId: MUSE_PROVIDER_ID, status: "auth-missing", windows: [], fetchedAt: nowMs };
  }

  // Prefer the team selected at login; fall back to the shell's resolved team.
  const teamId =
    (await host.credentials.getSecret(MUSE_PROVIDER_ID, "teamId"))?.trim() || tokens.teamId;
  if (!teamId) {
    host.log?.warn("muse: no team id for the captured dev.meta.ai session; sign in again");
    return { providerId: MUSE_PROVIDER_ID, status: "auth-missing", windows: [], fetchedAt: nowMs };
  }

  const span = museSpendWindow(nowMs);
  const variables = {
    api_key_id: null,
    end_date: span.end,
    model_id: null,
    month: null,
    start_date: span.start,
    team_id: teamId,
    __relay_internal__pv__Usage_ShouldIncludeBatchMetricsrelayprovider: false,
    __relay_internal__pv__Usage_ShouldIncludeCostMetricsrelayprovider: true,
    __relay_internal__pv__Usage_ShouldIncludeImageMetricsrelayprovider: false,
    __relay_internal__pv__Usage_ShouldIncludeSubscriptionQuotarelayprovider: true,
  };

  const body: Record<string, string> = {
    __a: "1",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: MUSE_USAGE_OPERATION,
    server_timestamps: "true",
    variables: JSON.stringify(variables),
    doc_id: MUSE_USAGE_DOC_ID,
    ...(tokens.lsd ? { lsd: tokens.lsd } : {}),
    ...(tokens.fbDtsg ? { fb_dtsg: tokens.fbDtsg, jazoest: museJazoest(tokens.fbDtsg) } : {}),
    ...(tokens.actorId ? { av: tokens.actorId } : {}),
    ...(tokens.userId ? { __user: tokens.userId } : {}),
    ...(tokens.cometReq ? { __comet_req: tokens.cometReq } : {}),
    ...(tokens.rev ? { __rev: tokens.rev } : {}),
    ...(tokens.hsi ? { __hsi: tokens.hsi } : {}),
  };

  const res = await host.http
    .request({
      method: "POST",
      url: MUSE_GRAPHQL_URL,
      headers: {
        ...browserHeaders(cookie),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        Origin: MUSE_ORIGIN,
        Referer: MUSE_DASHBOARD_URL,
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "X-FB-Friendly-Name": MUSE_USAGE_OPERATION,
        ...(tokens.lsd ? { "X-FB-LSD": tokens.lsd } : {}),
      },
      body: new URLSearchParams(body).toString(),
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
    .catch(() => undefined);

  if (!res) {
    return { providerId: MUSE_PROVIDER_ID, status: "error", windows: [], fetchedAt: nowMs };
  }
  if (res.status === 401 || res.status === 403) {
    return { providerId: MUSE_PROVIDER_ID, status: "auth-missing", windows: [], fetchedAt: nowMs };
  }
  if (res.status === 429) {
    return { providerId: MUSE_PROVIDER_ID, status: "rate-limited", windows: [], fetchedAt: nowMs };
  }
  if (res.status < 200 || res.status >= 300) {
    return { providerId: MUSE_PROVIDER_ID, status: "error", windows: [], fetchedAt: nowMs };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stripJsonPrefix(res.body));
  } catch {
    return { providerId: MUSE_PROVIDER_ID, status: "error", windows: [], fetchedAt: nowMs };
  }

  // Comet can reject authentication with HTTP 200 outside GraphQL's errors array.
  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    return {
      providerId: MUSE_PROVIDER_ID,
      status: payload.error === 1357001 ? "auth-missing" : "error",
      windows: [],
      fetchedAt: nowMs,
    };
  }

  const error = graphQLErrorFrom(payload);
  if (error) {
    host.log?.warn("muse: dev.meta.ai rejected the usage query", { error });
    return { providerId: MUSE_PROVIDER_ID, status: "error", windows: [], fetchedAt: nowMs };
  }

  const windows = parseMuseQuotaWindows(payload);
  const spend = parseMuseSpend(payload);

  return {
    providerId: MUSE_PROVIDER_ID,
    status: windows.length > 0 || spend !== undefined ? "ok" : "error",
    windows,
    // Pay-as-you-go spend is billed by Meta, not reconstructed from local logs.
    ...(spend !== undefined
      ? {
          cost: {
            currency: "USD",
            amount: spend,
            period: `${SPEND_WINDOW_DAYS}d` as const,
            estimated: false,
          },
        }
      : {}),
    fetchedAt: nowMs,
  };
}
