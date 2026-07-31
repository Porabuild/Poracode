/**
 * Resolve how a process running *inside* a WSL distro can reach a service bound
 * on the Windows host (the Crossagents MCP ingress binds `0.0.0.0` on Windows for
 * exactly this reason). The answer depends on the distro's networking mode:
 *
 * - NAT (classic WSL2 default): the host is reachable at the distro's default
 *   route gateway IP (e.g. `172.x.x.1`). Loopback (`127.0.0.1`) inside the
 *   distro does NOT reach the host, so the launch URL's loopback host must be
 *   rewritten to that gateway IP.
 * - Mirrored (`networkingMode=mirrored` in `.wslconfig`): Linux processes reach
 *   host-bound services over `localhost` directly. The correct behavior is to
 *   leave the native `127.0.0.1` URL untouched — no rewrite.
 *
 * The previous approach read the `nameserver` from the distro's
 * `/etc/resolv.conf` and treated it as the gateway. That only holds on OLD WSL
 * defaults; it breaks under DNS tunneling (modern WSL ≥ 2.2 ⇒ virtual
 * `10.255.255.254`), mirrored mode (nameserver is the host's real DNS server,
 * i.e. the wrong machine), and custom DNS (`generateResolvConf=false`). We now
 * probe the live distro for its networking mode + default route and only fall
 * back to the resolv.conf read (skipping the DNS-tunnel virtual IP) if the probe
 * fails entirely.
 *
 * Windows-only: returns `undefined` on macOS/Linux (no WSL) and on any failure,
 * which callers treat as "not reachable" — they then decline to hand the agent
 * an unreachable loopback URL rather than guess.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * How an in-distro process reaches the host-bound service.
 * - `gateway`: rewrite the loopback URL host to `ip` (NAT mode).
 * - `loopback`: the native `127.0.0.1` URL works as-is (mirrored mode).
 */
export type WslHostAccess = { kind: "gateway"; ip: string } | { kind: "loopback" };

export interface WslHostAccessResolver {
  resolveHostAccess(distro: string): Promise<WslHostAccess | undefined>;
}

/** DNS-tunneling virtual address (modern WSL default). Not connectable, and
 *  never the host gateway — must be skipped when scanning resolv.conf. */
const DNS_TUNNEL_VIRTUAL_IP = "10.255.255.254";

/** A stopped distro boots on its first command; the launch is about to boot it
 *  anyway, so give the probe generous headroom rather than racing the boot. */
const WSL_PROBE_TIMEOUT_MS = 15_000;

/** Short TTL so repeated launches don't re-spawn `wsl.exe`, but a mode/route
 *  change (e.g. editing `.wslconfig` + `wsl --shutdown`) is picked up quickly. */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: WslHostAccess | undefined;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test hook: drop the per-distro cache. */
export function clearWslHostAccessCache(): void {
  cache.clear();
}

/**
 * Resolve host access for a distro (Windows-only). Cached per distro for a
 * short TTL. Returns `undefined` on non-Windows hosts and when nothing worked.
 */
export async function resolveWslHostAccess(distro: string): Promise<WslHostAccess | undefined> {
  if (process.platform !== "win32") return undefined;
  const now = Date.now();
  const cached = cache.get(distro);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await computeWslHostAccess(distro);
  cache.set(distro, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

async function computeWslHostAccess(distro: string): Promise<WslHostAccess | undefined> {
  const viaProbe = await probeWslHostAccess(distro);
  if (viaProbe) return viaProbe;
  // Fallback: the distro may be unreachable via `wsl.exe` (rare) but its
  // resolv.conf readable over UNC. Treat a plausible nameserver as the gateway.
  const ip = readResolvConfNameserver(distro);
  if (ip) return { kind: "gateway", ip };
  return undefined;
}

/**
 * One `wsl.exe` invocation that yields both the networking mode (via `wslinfo`
 * when present) and the default route. Parses stdout only; tolerates stderr
 * noise and CRLF line endings.
 */
async function probeWslHostAccess(distro: string): Promise<WslHostAccess | undefined> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      "wsl.exe",
      [
        "-d",
        distro,
        "--",
        "sh",
        "-c",
        "if command -v wslinfo >/dev/null 2>&1; then wslinfo --networking-mode; else echo unknown; fi; ip route show default",
      ],
      { timeout: WSL_PROBE_TIMEOUT_MS, windowsHide: true },
    );
    stdout = result.stdout;
  } catch {
    return undefined;
  }
  if (parseNetworkingMode(stdout) === "mirrored") return { kind: "loopback" };
  const ip = parseDefaultRouteGateway(stdout);
  if (ip) return { kind: "gateway", ip };
  return undefined;
}

function readResolvConfNameserver(distro: string): string | undefined {
  try {
    const uncPath = `\\\\wsl.localhost\\${distro}\\etc\\resolv.conf`;
    return parseResolvConfNameserver(readFileSync(uncPath, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * The networking mode is the first non-empty line of the probe output (the
 * `wslinfo --networking-mode` result, or `unknown` when `wslinfo` is absent).
 * Returns a lowercased token, or `""` when there is no output.
 */
export function parseNetworkingMode(stdout: string): string {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.toLowerCase();
  }
  return "";
}

/**
 * Extract the IPv4 gateway from `ip route show default` output — e.g.
 * `default via 172.20.144.1 dev eth0`. Returns the first valid match, or
 * `undefined` when no default route is present.
 */
export function parseDefaultRouteGateway(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const match = /\bdefault\s+via\s+(\d{1,3}(?:\.\d{1,3}){3})\b/u.exec(line);
    const ip = match?.[1];
    if (ip && isIpv4(ip)) return ip;
  }
  return undefined;
}

/**
 * Extract a usable `nameserver` IP from resolv.conf contents, skipping loopback
 * (`127.0.0.1` / `::1`) and the DNS-tunneling virtual IP (`10.255.255.254`),
 * neither of which is a reachable host gateway.
 */
export function parseResolvConfNameserver(contents: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*nameserver\s+(\S+)\s*$/u.exec(line);
    const ip = match?.[1];
    if (ip && ip !== "127.0.0.1" && ip !== "::1" && ip !== DNS_TUNNEL_VIRTUAL_IP) return ip;
  }
  return undefined;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/u.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}
