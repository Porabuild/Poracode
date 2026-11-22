/**
 * Per-thread identity carried on the browser/chrome MCP endpoint URL as a query
 * (`?thread=<id>&title=<task>`). The supervisor encodes it per launch (all
 * providers connect by URL, so this is provider-agnostic — no header forwarding
 * needed); the main-process ingress decodes it per request to give each thread
 * its own tab group named by its task.
 */

export interface McpThreadIdentity {
  threadId?: string | undefined;
  title?: string | undefined;
  pooled?: boolean | undefined;
  disabledTools?: readonly string[] | undefined;
  deviceProof?: string | undefined;
}

const MAX_TITLE = 80;

/** Append thread identity and tool restrictions, including for shared provider endpoints. */
export function encodeThreadQuery(
  baseUrl: string,
  identity: McpThreadIdentity | undefined,
): string {
  if (!identity) return baseUrl;
  const params = new URLSearchParams();
  if (identity.pooled) {
    params.set("pooled", "1");
  } else {
    if (identity.threadId) params.set("thread", identity.threadId);
    const title = identity.title?.trim();
    if (identity.threadId && title) params.set("title", title.slice(0, MAX_TITLE));
    if (identity.deviceProof) params.set("deviceProof", identity.deviceProof);
  }
  for (const tool of identity.disabledTools ?? []) {
    params.append("disable", tool);
  }
  const query = params.toString();
  return query ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}` : baseUrl;
}

/** Read the thread identity back out of a request URL (path + query). */
export function decodeThreadIdentity(url: string | undefined): McpThreadIdentity {
  if (!url) return {};
  try {
    const params = new URL(url, "http://x").searchParams;
    const pooled = params.get("pooled") === "1";
    const threadId = params.get("thread") ?? undefined;
    const title = params.get("title") ?? undefined;
    const disabledTools = params.getAll("disable").filter(Boolean);
    const deviceProof = params.get("deviceProof") ?? undefined;
    return {
      ...(pooled ? { pooled: true } : {}),
      ...(threadId ? { threadId } : {}),
      ...(title ? { title } : {}),
      ...(disabledTools.length > 0 ? { disabledTools } : {}),
      ...(deviceProof ? { deviceProof } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Tab-group colors valid in BOTH the internal browser's group palette and
 * Chrome's `tabGroups` API (Chrome also offers grey/pink; we stay on the shared
 * subset so a thread keeps the same color across internal + external tabs).
 */
export const THREAD_GROUP_COLORS = [
  "blue",
  "green",
  "orange",
  "cyan",
  "red",
  "yellow",
  "purple",
] as const;
export type ThreadGroupColor = (typeof THREAD_GROUP_COLORS)[number];

/** Stable color for a thread's tab group, hashed from its id. */
export function threadGroupColor(threadId: string): ThreadGroupColor {
  let hash = 2166136261;
  for (let i = 0; i < threadId.length; i += 1) {
    hash ^= threadId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return THREAD_GROUP_COLORS[(hash >>> 0) % THREAD_GROUP_COLORS.length]!;
}
