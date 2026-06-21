import { isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";

export const DEFAULT_REMOTE_ACCESS_PORT = 38987;
export const DEFAULT_REMOTE_ACCESS_HOST = "0.0.0.0";

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>;

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isRemoteAccessEnabled(): boolean {
  return process.env.LIGHTCODE_REMOTE_ACCESS?.trim() !== "0";
}

export function remoteAccessHost(): string {
  return readTrimmedEnv("LIGHTCODE_REMOTE_ACCESS_HOST") ?? DEFAULT_REMOTE_ACCESS_HOST;
}

export function remoteAccessPort(): number {
  const raw = readTrimmedEnv("LIGHTCODE_REMOTE_ACCESS_PORT");
  if (!raw) return DEFAULT_REMOTE_ACCESS_PORT;
  const explicit = Number(raw);
  return Number.isSafeInteger(explicit) && explicit >= 0 && explicit <= 65535
    ? explicit
    : DEFAULT_REMOTE_ACCESS_PORT;
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
  const explicit = readTrimmedEnv("LIGHTCODE_REMOTE_ACCESS_ADVERTISED_HOST");
  if (explicit) return explicit;

  const bindHost = input?.bindHost ?? remoteAccessHost();
  if (bindHost === "0.0.0.0" || bindHost === "::" || bindHost === "::0") {
    return detectLanIpv4Address(input?.interfaces) ?? "127.0.0.1";
  }
  return bindHost;
}

export function remoteAccessPairingAppUrl(): string | undefined {
  return readTrimmedEnv("LIGHTCODE_REMOTE_ACCESS_PAIRING_APP_URL");
}
