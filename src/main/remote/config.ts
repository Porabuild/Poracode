import { createServer, isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";

export const DEFAULT_REMOTE_ACCESS_PORT = 49152;
const MAX_AUTO_REMOTE_ACCESS_PORT = 65535;
export const DEFAULT_REMOTE_ACCESS_HOST = "0.0.0.0";

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>;

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function remoteAccessHost(): string {
  return readTrimmedEnv("PORACODE_REMOTE_ACCESS_HOST") ?? DEFAULT_REMOTE_ACCESS_HOST;
}

export function remoteAccessPort(): number | undefined {
  const raw = readTrimmedEnv("PORACODE_REMOTE_ACCESS_PORT");
  if (!raw) return undefined;
  const explicit = Number(raw);
  return Number.isSafeInteger(explicit) && explicit >= 0 && explicit <= 65535
    ? explicit
    : undefined;
}

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const server = createServer();
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
      } else {
        reject(error);
      }
    };
    const onListening = () => {
      server.off("error", onError);
      server.close((error) => (error ? reject(error) : resolve(true)));
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export async function resolveRemoteAccessPort(input?: {
  readonly host?: string;
  readonly port?: number;
  readonly rangeStart?: number;
  readonly rangeEnd?: number;
  readonly isAvailable?: (port: number, host: string) => Promise<boolean>;
}): Promise<number> {
  const explicitPort = input?.port ?? remoteAccessPort();
  if (explicitPort !== undefined) return explicitPort;

  const host = input?.host ?? remoteAccessHost();
  const rangeStart = input?.rangeStart ?? DEFAULT_REMOTE_ACCESS_PORT;
  const rangeEnd = input?.rangeEnd ?? MAX_AUTO_REMOTE_ACCESS_PORT;
  const isAvailable = input?.isAvailable ?? canListen;
  for (let port = rangeStart; port <= rangeEnd; port += 1) {
    if (await isAvailable(port, host)) return port;
  }

  throw Object.assign(new Error(`listen EADDRINUSE: address already in use ${host}:${rangeEnd}`), {
    code: "EADDRINUSE",
    address: host,
    port: rangeEnd,
  });
}

function parseIpv4(address: string): readonly [number, number, number, number] | null {
  // isIPv4 guarantees exactly four in-range numeric octets.
  if (!isIPv4(address)) return null;
  const [first = 0, second = 0, third = 0, fourth = 0] = address.split(".").map(Number);
  return [first, second, third, fourth];
}

function isUsableAdvertisedIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [first, second] = octets;
  return first !== 0 && first !== 127 && !(first === 169 && second === 254);
}

function privateLanScore(address: string): number {
  const octets = parseIpv4(address);
  if (!octets) return 0;
  const [first, second] = octets;
  if (first === 10) return 100;
  if (first === 172 && second >= 16 && second <= 31) return 100;
  if (first === 192 && second === 168) return 100;
  if (first === 100 && second >= 64 && second <= 127) return 60;
  return 20;
}

function interfaceNameScore(name: string): number {
  const normalized = name.toLowerCase();
  if (
    normalized.includes("docker") ||
    normalized.includes("vbox") ||
    normalized.includes("vmware") ||
    normalized.includes("virtual") ||
    normalized.includes("bridge") ||
    normalized.includes("loopback") ||
    normalized.includes("wsl") ||
    normalized.startsWith("veth")
  ) {
    return -50;
  }
  if (
    normalized.includes("vpn") ||
    normalized.includes("tailscale") ||
    normalized.includes("wireguard") ||
    normalized.includes("zerotier") ||
    normalized.includes("utun") ||
    normalized.includes("tun") ||
    normalized.includes("tap")
  ) {
    return -20;
  }
  if (
    normalized.includes("wi-fi") ||
    normalized.includes("wifi") ||
    normalized.includes("wlan") ||
    normalized.includes("ethernet") ||
    normalized.startsWith("en") ||
    normalized.startsWith("eth")
  ) {
    return 10;
  }
  return 0;
}

export function detectLanIpv4Address(interfaces: NetworkInterfaceMap = networkInterfaces()) {
  const candidates: Array<{
    readonly address: string;
    readonly interfaceName: string;
    readonly score: number;
  }> = [];

  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (!isUsableAdvertisedIpv4(info.address)) continue;
      candidates.push({
        address: info.address,
        interfaceName,
        score: privateLanScore(info.address) + interfaceNameScore(interfaceName),
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.interfaceName.localeCompare(right.interfaceName);
  });

  return candidates[0]?.address;
}

export function remoteAccessAdvertisedHost(input?: {
  readonly bindHost?: string;
  readonly interfaces?: NetworkInterfaceMap;
}): string {
  const explicit = readTrimmedEnv("PORACODE_REMOTE_ACCESS_ADVERTISED_HOST");
  if (explicit) return explicit;

  const bindHost = input?.bindHost ?? remoteAccessHost();
  if (bindHost === "0.0.0.0" || bindHost === "::" || bindHost === "::0") {
    return detectLanIpv4Address(input?.interfaces) ?? "127.0.0.1";
  }
  return bindHost;
}

export function remoteAccessPairingAppUrl(): string | undefined {
  return readTrimmedEnv("PORACODE_REMOTE_ACCESS_PAIRING_APP_URL");
}
