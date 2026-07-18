/**
 * Shared helper for injecting the Poracode Crossagents MCP server
 * into agent runtimes. The supervisor hosts a single in-process Streamable-HTTP
 * MCP endpoint (`CrossagentMcpIngress`); each thread that opts in receives a URL +
 * bearer credential at launch so the agent can discover and spawn the other
 * connected agents as subagents. Most providers receive a per-thread token;
 * pooled runtimes can share one credential and route calls by a trusted native
 * session id.
 *
 * Mirrors the `browserMcp` module shape. The runtime resolves this endpoint
 * into the same provider-neutral MCP descriptor used for every server.
 *
 * WSL reachability: unlike the browser MCP — which tunnels through the in-WSL
 * `bridge.mjs` reverse proxy (its `/mcp` route is hard-wired to the browser
 * upstream with a fixed env token) — the Crossagents ingress uses PER-THREAD
 * bearer tokens that can't be baked into a shared per-distro proxy. Instead we
 * mirror `BrowserMcpIngress`'s network posture: the supervisor ingress binds
 * `0.0.0.0` on Windows so an agent inside a WSL distro can reach the host. HOW
 * it reaches the host depends on the distro's networking mode (resolved by the
 * host-side `WslHostAccessResolver`): in NAT mode we rewrite the
 * loopback URL host to the distro's default-route gateway IP; in mirrored mode
 * the native `127.0.0.1` URL works as-is and is passed through unchanged. The
 * per-thread bearer token stays the security boundary — see
 * `resolveCrossagentMcpHttpConfigForLaunch` and `CrossagentMcpIngress.start`.
 */

import type { ProjectLocation } from "@/shared/contracts";
import type { WslHostAccessResolver } from "@/supervisor/wsl/hostAccess";

export interface CrossagentMcpHttpConfig {
  /** MCP endpoint URL (already suffixed with `/mcp`). */
  url: string;
  /** In-memory authorization bearer token. */
  token: string;
  /** Headers map (always includes `Authorization`). */
  headers: Record<string, string>;
  /** Per-thread discovery/permission filter retained outside provider config. */
  disabledTools?: string[];
}

/** Minimal shape needed to pick native-vs-WSL — accepts a `ProjectLocation` or
 *  a stripped-down `{ kind, distro? }` so internal callers don't fabricate UNC
 *  paths. Mirrors `BrowserMcpLocation`. */
export type CrossagentMcpLocation =
  | ProjectLocation
  | { kind: "windows" }
  | { kind: "posix" }
  | { kind: "wsl"; distro: string };

/**
 * Resolve the Crossagents MCP http config for a given project location.
 *
 * - Native (windows/posix): the native loopback config is returned unchanged.
 * - WSL, NAT mode (`gateway`): the loopback host in `native.url` is rewritten
 *   to the distro's default-route gateway IP so the in-distro agent can reach
 *   the `0.0.0.0`-bound ingress. Token + headers are preserved verbatim.
 * - WSL, mirrored mode (`loopback`): the native config is returned unchanged —
 *   `localhost` inside the distro reaches the host directly.
 *
 * Resolves to `undefined` when the thread hasn't registered (`native` absent),
 * or — for WSL — when no host-access resolver is wired or host access can't be
 * resolved. This mirrors the browser helper's "no bridge → undefined" fallback:
 * we never hand a WSL agent an unreachable `127.0.0.1` URL.
 */
export async function resolveCrossagentMcpHttpConfigForLaunch(
  native: CrossagentMcpHttpConfig | undefined,
  location: CrossagentMcpLocation,
  hostAccess?: WslHostAccessResolver,
): Promise<CrossagentMcpHttpConfig | undefined> {
  if (!native) return undefined;
  if (location.kind !== "wsl") return native;
  if (!hostAccess) return undefined;
  const access = await hostAccess.resolveHostAccess(location.distro);
  if (!access) return undefined;
  if (access.kind === "loopback") return native;
  const url = rewriteLoopbackHost(native.url, access.ip);
  if (!url) return undefined;
  return { url, token: native.token, headers: native.headers };
}

/** Rewrite a loopback URL's host to `ip`, preserving port + path. Non-loopback
 *  hosts pass through untouched. Returns `undefined` on an unparseable URL. */
function rewriteLoopbackHost(rawUrl: string, ip: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1"
  ) {
    parsed.hostname = ip;
  }
  return parsed.toString();
}
