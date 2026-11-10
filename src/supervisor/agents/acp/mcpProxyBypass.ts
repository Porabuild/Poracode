import type { ResolvedMcpServer } from "@/shared/contracts";

const ACP_PROXY_ENV_NAMES = ["http_proxy", "https_proxy", "all_proxy"];
const ACP_NO_PROXY_CANONICAL = new Set(["NO_PROXY", "no_proxy"]);

/**
 * Hostnames of MCP endpoints the agent will dial directly over HTTP: every
 * `directTransport` target. Relayed stdio and plain remote transports
 * contribute nothing — the relay process owns that connection, and a remote
 * user server may legitimately need the corporate proxy, so only Poracode's
 * own direct endpoints are bypassed.
 */
function directMcpHostnames(servers: readonly ResolvedMcpServer[] | undefined): Set<string> {
  const hostnames = new Set<string>();
  for (const server of servers ?? []) {
    const transport = server.directTransport;
    if (!transport) continue;
    try {
      // URL.hostname keeps brackets on IPv6 literals; NO_PROXY lists want
      // the bare address (`::1`), matching what agents' HTTP clients parse.
      const hostname = new URL(transport.url).hostname.replace(/^\[|\]$/g, "");
      if (hostname) hostnames.add(hostname);
    } catch {
      // An unparseable endpoint URL fails on its own; it adds no bypass.
    }
  }
  return hostnames;
}

/**
 * The `NO_PROXY`/`no_proxy` values needed to keep direct MCP endpoints off an
 * HTTP proxy, or `undefined` when the env needs no change. Agents honour
 * whichever casing their HTTP client reads, so the union of every
 * case-insensitive `no_proxy` entry plus the endpoint hostnames is written to
 * both canonical casings; existing entries are preserved, duplicates dropped,
 * other-cased variants blanked so stale content cannot shadow the merged
 * value, and a `*` entry left alone (it already bypasses everything). With no
 * proxy variable the result is `undefined`.
 * Verified need: devin 3000.12.28 routed a loopback MCP endpoint through an
 * unreachable HTTP_PROXY and failed to connect until NO_PROXY listed the
 * host (tmp/devin-http-probe/, 2026-11-08).
 */
export function directMcpProxyBypassEnv(
  env: Record<string, string | undefined>,
  servers: readonly ResolvedMcpServer[] | undefined,
): Record<string, string> | undefined {
  const hostnames = directMcpHostnames(servers);
  if (hostnames.size === 0) return undefined;
  const hasProxy = Object.keys(env).some((key) => ACP_PROXY_ENV_NAMES.includes(key.toLowerCase()));
  if (!hasProxy) return undefined;
  const entries = new Map<string, string>();
  const strayKeys: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() !== "no_proxy") continue;
    if (!ACP_NO_PROXY_CANONICAL.has(key)) strayKeys.push(key);
    for (const entry of (value ?? "").split(",")) {
      const trimmed = entry.trim();
      if (trimmed) entries.set(trimmed.toLowerCase(), trimmed);
    }
  }
  if (entries.has("*")) return undefined;
  for (const hostname of hostnames) {
    if (!entries.has(hostname.toLowerCase())) entries.set(hostname.toLowerCase(), hostname);
  }
  const merged = [...entries.values()].join(",");
  return {
    // Other-cased variants are blanked first so the canonical pair wins on
    // platforms whose environment is case-insensitive.
    ...Object.fromEntries(strayKeys.map((key) => [key, ""])),
    NO_PROXY: merged,
    no_proxy: merged,
  };
}
