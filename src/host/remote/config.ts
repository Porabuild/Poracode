import { createServer, isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";

export const DEFAULT_REMOTE_ACCESS_PORT = 49152;
const MAX_AUTO_REMOTE_ACCESS_PORT = 65535;
/**
 * Loopback-only default (Gate 6 S1, plan item 4.1). The remote listener never
 * exposes a plaintext surface wider than loopback unless a named bind mode or
 * an explicit host opts in — see {@link resolveRemoteAccessBind}.
 */
export const DEFAULT_REMOTE_ACCESS_HOST = "127.0.0.1";
/** The all-interfaces bind host used by `lan` mode (refused without an
 * explicit acknowledgement — see {@link PLAINTEXT_LAN_ACK_ENV}). */
export const LAN_BIND_HOST = "0.0.0.0";

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>;

function readTrimmedEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** Named remote-access bind modes (plan item 4.1). Declared, not inferred:
 * `loopback` (default), `tailnet` (the Tailscale interface IPv4), `lan` (all
 * interfaces, acknowledgement-gated while the surface is plaintext). */
export type RemoteAccessBindMode = "loopback" | "tailnet" | "lan";

export const REMOTE_ACCESS_BIND_MODES: readonly RemoteAccessBindMode[] = [
  "loopback",
  "tailnet",
  "lan",
];

/** Selects the bind mode when `PORACODE_REMOTE_ACCESS_HOST` is not set. */
export const REMOTE_BIND_MODE_ENV = "PORACODE_REMOTE_BIND_MODE";
/**
 * The explicit acknowledgement that gates `lan` mode (and an explicit
 * all-interfaces host) while the remote surface is plaintext: set to exactly
 * `1` to allow the bind. Configured TLS material (Gate 6 item 4.2) is the
 * other way past this gate — an encrypted `lan` exposure does not need the
 * plaintext acknowledgement.
 */
export const PLAINTEXT_LAN_ACK_ENV = "PORACODE_ALLOW_PLAINTEXT_LAN";
/**
 * Gate 6 item 4.2 (TLS): PEM paths for the remote listener's certificate and
 * private key. When both are set (and loadable), the server listens HTTPS,
 * the pairing QR carries the certificate fingerprint, and the plaintext-LAN
 * acknowledgement is not required for wide binds. Both variables must be set
 * together; a partial or unloadable configuration fails remote-access startup
 * loudly rather than silently downgrading to plaintext.
 */
export const REMOTE_TLS_CERT_ENV = "PORACODE_REMOTE_TLS_CERT";
export const REMOTE_TLS_KEY_ENV = "PORACODE_REMOTE_TLS_KEY";

export function parseRemoteAccessBindMode(
  raw: string | undefined,
): RemoteAccessBindMode | undefined {
  const value = raw?.trim().toLowerCase();
  return REMOTE_ACCESS_BIND_MODES.find((mode) => mode === value);
}

export function isLoopbackBindHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.")
  );
}

export function isWildcardBindHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "0.0.0.0" || normalized === "::" || normalized === "::0" || normalized === "[::]"
  );
}

/** Whether `address` is an IPv4 in the shared address space reserved for
 * CGNAT overlays (100.64.0.0/10) — the range Tailscale assigns to tailnet
 * interfaces. */
export function isTailnetIpv4(address: string): boolean {
  const octets = parseIpv4(address.trim());
  if (!octets) return false;
  const [first, second] = octets;
  return first === 100 && second >= 64 && second <= 127;
}

/** Classifies one concrete bind host into a bind mode. A wildcard host
 * classifies as `lan` (it binds every interface, so the `lan` acknowledgement
 * gate applies); loopback addresses as `loopback`; tailnet-range addresses as
 * `tailnet`; everything else (a specific LAN interface address, a hostname) as
 * `lan` — a plaintext exposure beyond loopback. */
export function classifyBindHostExposure(host: string): RemoteAccessBindMode {
  if (isLoopbackBindHost(host)) return "loopback";
  if (isTailnetIpv4(host)) return "tailnet";
  return "lan";
}

/**
 * Comma-separated socket addresses or CIDRs whose `X-Forwarded-For` the
 * rate limiter may honor (V6 A.6). The other way past this gate is the
 * in-process relay hop secret, not a client-set header. A loopback peer
 * without either is keyed on its socket address.
 */
export const REMOTE_TRUSTED_PROXIES_ENV = "PORACODE_REMOTE_TRUSTED_PROXIES";

export function remoteTrustedProxyAddresses(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = readTrimmedEnv(REMOTE_TRUSTED_PROXIES_ENV, env);
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * The refusal message for a plaintext LAN bind, or `null` when the bind may
 * start (host is not a LAN exposure, the acknowledgement is set, or TLS
 * material is configured). Wildcard hosts and explicit LAN IPs share this
 * rule (V6 A.4). Shared by config resolution, `RemoteAccessServer` startup,
 * and `doctor` so all three enforce exactly one rule.
 */
export function remoteAccessBindRefusal(
  host: string,
  input?: { readonly env?: NodeJS.ProcessEnv; readonly tlsConfigured?: boolean },
): string | null {
  if (classifyBindHostExposure(host) !== "lan") return null;
  if (plaintextLanAcknowledged(input?.env)) return null;
  if (input?.tlsConfigured) return null;
  const trimmed = host.trim();
  const surface = isWildcardBindHost(host) ? `${trimmed} (all interfaces)` : trimmed;
  return (
    `Refusing to bind the remote access listener to ${surface} over plaintext. ` +
    `This bind classifies as a LAN exposure. Configure TLS (${REMOTE_TLS_CERT_ENV} + ${REMOTE_TLS_KEY_ENV}), set ` +
    `${PLAINTEXT_LAN_ACK_ENV}=1 to acknowledge plaintext LAN exposure, use ` +
    `${REMOTE_BIND_MODE_ENV}=tailnet, or keep the loopback default.`
  );
}

/** Whether the plaintext-LAN acknowledgement env is set to its exact `1` value. */
export function plaintextLanAcknowledged(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PLAINTEXT_LAN_ACK_ENV]?.trim() === "1";
}

/** The IPv4 address of the Tailscale interface, if one is present: an
 * interface whose name mentions "tailscale" wins; otherwise any non-internal
 * IPv4 in the tailnet CGNAT range (100.64.0.0/10). `undefined` when absent. */
export function detectTailnetIpv4Address(
  interfaces: NetworkInterfaceMap = networkInterfaces(),
): string | undefined {
  let byAddressRange: string | undefined;
  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (!isTailnetIpv4(info.address)) continue;
      if (interfaceName.toLowerCase().includes("tailscale")) return info.address;
      byAddressRange ??= info.address;
    }
  }
  return byAddressRange;
}

export interface RemoteAccessBindInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly interfaces?: NetworkInterfaceMap;
  /** Gate 6 item 4.2: whether TLS material is configured (cert + key set).
   * A TLS-backed wildcard bind does not need the plaintext acknowledgement. */
  readonly tlsConfigured?: boolean;
}

export interface RemoteAccessBindResolution {
  readonly mode: RemoteAccessBindMode;
  /** The host to `listen()` on. */
  readonly host: string;
  /** How `host` was chosen: the built-in default, a named bind mode, or an
   * explicit `PORACODE_REMOTE_ACCESS_HOST` override. */
  readonly source: "default" | "bind-mode" | "explicit-host";
  readonly plaintextLanAcknowledged: boolean;
  /** Whether TLS material is configured for the listener (Gate 6 item 4.2). */
  readonly tlsConfigured: boolean;
  /** Non-null: the resolved bind is refused and remote access must not start
   * (plaintext all-interfaces bind without the acknowledgement or TLS).
   * Never thrown from here — `doctor` reports it; `remoteAccessHost` throws
   * it. */
  readonly refusalReason: string | null;
  readonly warnings: readonly string[];
}

/**
 * The configured TLS PEM paths (`null` when neither variable is set). Partial
 * configuration returns the set path only; the material loader
 * (`loadRemoteAccessTlsMaterial`) turns that into a loud startup failure so a
 * typo can never silently downgrade the listener to plaintext.
 */
export function remoteTlsCertPaths(
  env: NodeJS.ProcessEnv = process.env,
): { readonly certPath: string; readonly keyPath: string } | null {
  const certPath = readTrimmedEnv(REMOTE_TLS_CERT_ENV, env);
  const keyPath = readTrimmedEnv(REMOTE_TLS_KEY_ENV, env);
  if (!certPath && !keyPath) return null;
  return {
    ...(certPath ? { certPath } : { certPath: "" }),
    ...(keyPath ? { keyPath } : { keyPath: "" }),
  };
}

/** Whether both TLS paths are set — the shape the bind gate asks about. */
export function remoteTlsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const paths = remoteTlsCertPaths(env);
  return paths !== null && paths.certPath.length > 0 && paths.keyPath.length > 0;
}

/**
 * Resolves the remote-access bind from the environment — the single decision
 * point behind `remoteAccessHost()` (both composition roots), the
 * `RemoteAccessServer` startup gate, and `poracode-server doctor`. Pure with
 * respect to process state: warnings and refusals are returned, not logged or
 * thrown.
 *
 * Precedence: an explicit `PORACODE_REMOTE_ACCESS_HOST` wins verbatim (the
 * documented escape hatch — existing desktop, relay, `tailscale serve`, and
 * SSH-tunnel flows keep working unchanged), though a wildcard explicit host
 * still requires the plaintext-LAN acknowledgement or configured TLS. Without
 * an explicit host, the named bind mode applies: `loopback` (default),
 * `tailnet` (Tailscale interface IPv4, falling back to loopback with a loud
 * warning when absent), or `lan` (all interfaces, refused without TLS material
 * or `PORACODE_ALLOW_PLAINTEXT_LAN=1`).
 */
export function resolveRemoteAccessBind(
  input: RemoteAccessBindInput = {},
): RemoteAccessBindResolution {
  const env = input.env ?? process.env;
  const warnings: string[] = [];
  const acknowledged = plaintextLanAcknowledged(env);
  const tlsConfigured = input.tlsConfigured ?? remoteTlsConfigured(env);

  const explicitHost = readTrimmedEnv("PORACODE_REMOTE_ACCESS_HOST", env);
  if (explicitHost) {
    const rawMode = readTrimmedEnv(REMOTE_BIND_MODE_ENV, env);
    if (rawMode) {
      warnings.push(
        `${REMOTE_BIND_MODE_ENV}=${rawMode} is ignored because PORACODE_REMOTE_ACCESS_HOST is set.`,
      );
    }
    const mode = classifyBindHostExposure(explicitHost);
    return {
      mode,
      host: explicitHost,
      source: "explicit-host",
      plaintextLanAcknowledged: acknowledged,
      tlsConfigured,
      refusalReason: remoteAccessBindRefusal(explicitHost, { env, tlsConfigured }),
      warnings,
    };
  }

  const rawMode = readTrimmedEnv(REMOTE_BIND_MODE_ENV, env);
  const mode = parseRemoteAccessBindMode(rawMode);
  if (rawMode && !mode) {
    warnings.push(
      `Unknown ${REMOTE_BIND_MODE_ENV} value "${rawMode}" (expected ${REMOTE_ACCESS_BIND_MODES.join(" | ")}); using the loopback default.`,
    );
  }
  const effectiveMode: RemoteAccessBindMode = mode ?? "loopback";
  const source = mode === undefined ? "default" : "bind-mode";

  if (effectiveMode === "tailnet") {
    const tailnetHost = detectTailnetIpv4Address(input.interfaces);
    if (tailnetHost) {
      return {
        mode: "tailnet",
        host: tailnetHost,
        source,
        plaintextLanAcknowledged: acknowledged,
        tlsConfigured,
        refusalReason: null,
        warnings,
      };
    }
    warnings.push(
      `${REMOTE_BIND_MODE_ENV}=tailnet: no Tailscale IPv4 interface detected; falling back to the loopback bind ${DEFAULT_REMOTE_ACCESS_HOST}.`,
    );
    return {
      mode: "tailnet",
      host: DEFAULT_REMOTE_ACCESS_HOST,
      source,
      plaintextLanAcknowledged: acknowledged,
      tlsConfigured,
      refusalReason: null,
      warnings,
    };
  }

  if (effectiveMode === "lan") {
    warnings.push(
      tlsConfigured
        ? `Binding the remote access listener to all interfaces (${LAN_BIND_HOST}); TLS material is configured, so the surface is encrypted.`
        : `Binding the remote access listener to all interfaces (${LAN_BIND_HOST}) in plaintext; configure ${REMOTE_TLS_CERT_ENV} + ${REMOTE_TLS_KEY_ENV} or set ${PLAINTEXT_LAN_ACK_ENV}=1 to acknowledge the exposure.`,
    );
    return {
      mode: "lan",
      host: LAN_BIND_HOST,
      source,
      plaintextLanAcknowledged: acknowledged,
      tlsConfigured,
      refusalReason: remoteAccessBindRefusal(LAN_BIND_HOST, { env, tlsConfigured }),
      warnings,
    };
  }

  return {
    mode: "loopback",
    host: DEFAULT_REMOTE_ACCESS_HOST,
    source,
    plaintextLanAcknowledged: acknowledged,
    tlsConfigured,
    refusalReason: null,
    warnings,
  };
}

/** Warns once per process for repeated resolution of the same condition. */
const warnedBindMessages = new Set<string>();

function warnBindOnce(message: string): void {
  if (warnedBindMessages.has(message)) return;
  warnedBindMessages.add(message);
  console.warn(`[poracode] ${message}`);
}

/** The bind host the remote-access listener should `listen()` on (the
 * config-level resolution behind both composition roots). Logs the
 * resolution's warnings loudly (once each per process) and throws the
 * refusal when the resolved bind is refused. */
export function remoteAccessHost(): string {
  const resolution = resolveRemoteAccessBind();
  for (const warning of resolution.warnings) warnBindOnce(warning);
  if (resolution.refusalReason) throw new Error(`[poracode] ${resolution.refusalReason}`);
  return resolution.host;
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
  if (isWildcardBindHost(bindHost)) {
    return detectLanIpv4Address(input?.interfaces) ?? "127.0.0.1";
  }
  return bindHost;
}

export function remoteAccessPairingAppUrl(): string | undefined {
  return readTrimmedEnv("PORACODE_REMOTE_ACCESS_PAIRING_APP_URL");
}

/**
 * Configured HTTPS root for isolated browser-forward child origins (direct
 * ingress). DNS/TLS must cover its generated one-label children; the value is
 * validated by `ForwardOriginPolicy` and never inferred from visitor headers.
 * Absent = browser-origin forwarding unavailable (raw TCP forwarding keeps
 * working); malformed explicit values fail remote-access startup loudly rather
 * than silently downgrading.
 */
export function remoteForwardBaseUrl(): string | undefined {
  return readTrimmedEnv("PORACODE_REMOTE_FORWARD_BASE_URL");
}
