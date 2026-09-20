import { BlockList, isIP } from "node:net";

function normalizeSocketAddress(address: string): string {
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

/**
 * Whether `address` is an exact trusted-proxy socket or falls inside a
 * configured CIDR (V6 A.6). IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is compared
 * as IPv4.
 */
export function socketMatchesTrustedProxy(
  address: string | undefined,
  trustedProxies: readonly string[],
): boolean {
  if (!address || trustedProxies.length === 0) return false;
  const normalized = normalizeSocketAddress(address);
  for (const raw of trustedProxies) {
    const entry = raw.trim();
    if (!entry) continue;
    if (!entry.includes("/")) {
      if (entry === normalized || entry === address) return true;
      continue;
    }
    const slash = entry.lastIndexOf("/");
    const network = entry.slice(0, slash);
    const prefix = Number(entry.slice(slash + 1));
    const networkVersion = isIP(network);
    if (networkVersion === 0 || !Number.isInteger(prefix)) continue;
    const checkVersion = isIP(normalized);
    if (checkVersion === 0) continue;
    try {
      const list = new BlockList();
      list.addSubnet(network, prefix, networkVersion === 6 ? "ipv6" : "ipv4");
      if (list.check(normalized, checkVersion === 6 ? "ipv6" : "ipv4")) return true;
    } catch {
      continue;
    }
  }
  return false;
}
