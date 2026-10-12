import type { HttpClient, HttpResponse } from "./host";
import type { UsageWindow } from "./types";

/**
 * OpenCode Go's public authenticated usage endpoint: a plain
 * `GET https://opencode.ai/zen/go/v1/usage` with the Go API key as a Bearer
 * token — no workspace id, no auth cookie, no web login. This is the same
 * endpoint community tools (CodexBar, dsh plugins, cc-switch) consume; the
 * opencode.ai web session remains only for the Zen balance and as a
 * compatibility fallback for the Go windows.
 */

export const OPENCODE_GO_USAGE_ENDPOINT = "https://opencode.ai/zen/go/v1/usage";

const OPENCODE_GO_API_WINDOW_SPECS = [
  { key: "rolling", id: "session-5h", label: "Rolling" },
  { key: "weekly", id: "weekly", label: "Weekly" },
  { key: "monthly", id: "monthly", label: "Monthly" },
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/**
 * Parse the Go usage endpoint JSON body:
 * `{ usage: { rolling: { status, percent, resetsAt }, weekly: …, monthly: … } }`.
 * Returns [] when the core windows (rolling + weekly) are absent or
 * unparseable, so a stray match can't fabricate a partial set. `resetsAt` is
 * an ISO timestamp (unlike the web session's relative `resetInSec`).
 */
export function parseOpenCodeGoApiWindows(text: string): UsageWindow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const usage = asRecord(asRecord(parsed)?.usage);
  if (!usage) return [];

  const windows: UsageWindow[] = [];
  for (const spec of OPENCODE_GO_API_WINDOW_SPECS) {
    const raw = asRecord(usage[spec.key]);
    if (!raw || typeof raw.percent !== "number" || !Number.isFinite(raw.percent)) continue;
    const resetsAtMs = typeof raw.resetsAt === "string" ? Date.parse(raw.resetsAt) : Number.NaN;
    windows.push({
      id: spec.id,
      label: spec.label,
      usedPercent: Math.min(100, Math.max(0, raw.percent)),
      unit: "percent",
      ...(Number.isFinite(resetsAtMs) ? { resetsAt: resetsAtMs } : {}),
    });
  }
  const hasCore =
    windows.some((w) => w.id === "session-5h") && windows.some((w) => w.id === "weekly");
  return hasCore ? windows : [];
}

/**
 * Fetch the Go plan windows from the direct usage endpoint with the Go API
 * key. Fail-soft: undefined on network error, non-200 (including 401/403 for
 * a stale key), or an unparseable body — callers fall back to the web session.
 */
export async function fetchOpenCodeGoApiUsage(
  http: HttpClient,
  apiKey: string,
): Promise<UsageWindow[] | undefined> {
  const token = apiKey.trim();
  if (!token) return undefined;
  let res: HttpResponse;
  try {
    res = await http.request({
      method: "GET",
      url: OPENCODE_GO_USAGE_ENDPOINT,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      timeoutMs: 5000,
    });
  } catch {
    return undefined;
  }
  if (res.status !== 200) return undefined;
  const windows = parseOpenCodeGoApiWindows(res.body);
  return windows.length > 0 ? windows : undefined;
}
