import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getWslCommand } from "@/supervisor/agents/base/shellBasics";

/**
 * Resolve the Windows-host IP as seen from inside the given WSL distro.
 *
 * WSL2 puts the host's loopback behind the distro's default gateway. Prefer
 * the route table because DNS tunneling can put a non-routable resolver in
 * `/etc/resolv.conf`; fall back to the first nameserver for older setups.
 *
 * Returns null when the distro is unreachable, resolv.conf is missing, or
 * neither source exposes a usable address. Callers should fall back to
 * `127.0.0.1` (which still works for native projects).
 */
const cache = new Map<
  string,
  { ip: string; capturedAt: number } | { ip: null; capturedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function isUsableHostAddress(value: string | undefined): value is string {
  return Boolean(value && value !== "127.0.0.1" && value !== "::1");
}

function resolveWslDefaultGateway(distro: string): string | null {
  const result = spawnSync(
    getWslCommand(),
    ["-d", distro, "--", "ip", "route", "show", "default"],
    {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 3000,
    },
  );
  if (result.status !== 0) return null;
  for (const line of `${result.stdout ?? ""}`.split(/\r?\n/)) {
    const m = line.match(/^\s*default\s+via\s+(\S+)\s/u);
    if (isUsableHostAddress(m?.[1])) return m[1];
  }
  return null;
}

function resolveWslNameserver(distro: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(`\\\\wsl.localhost\\${distro}\\etc\\resolv.conf`, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*nameserver\s+(\S+)\s*$/u);
    if (isUsableHostAddress(m?.[1])) return m[1];
  }
  return null;
}

export function resolveWslHostIp(distro: string): string | null {
  if (!distro) return null;
  const cached = cache.get(distro);
  if (cached && Date.now() - cached.capturedAt < CACHE_TTL_MS) {
    return cached.ip;
  }
  const ip = resolveWslDefaultGateway(distro) ?? resolveWslNameserver(distro);
  cache.set(distro, { ip, capturedAt: Date.now() });
  return ip;
}

export function rewriteUrlForWsl(url: string, distro: string): string {
  if (!distro) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    return url;
  }
  const ip = resolveWslHostIp(distro);
  if (!ip) return url;
  parsed.hostname = ip;
  return parsed.toString().replace(/\/$/, "");
}

/** Test helper. */
export function __clearWslHostIpCache(): void {
  cache.clear();
}
