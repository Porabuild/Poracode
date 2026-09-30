import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";
import type { SshCommandResult } from "./sshTrackedCommands";

/**
 * Host-key trust for host-owned environments (ADR §4).
 *
 * Trust is established before any authenticated provision/connect:
 * 1. a trusted OpenSSH known-hosts entry for the resolved target may establish
 *    it automatically (recorded as an observation), or
 * 2. an unauthenticated probe returns the offered fingerprints and the operator
 *    explicitly accepts one (manage-authorized), or
 * 3. the environment already records an observation/pin; the accepted key
 *    material is then enforced by a per-environment known-hosts file with
 *    `StrictHostKeyChecking=yes`.
 *
 * Nothing here authenticates: `ssh -G` resolves the effective host/port (and a
 * `HostKeyAlias`) without connecting, and `ssh-keyscan` fetches offered public
 * keys. A probe never authorizes install or exec, and no code path uses
 * `StrictHostKeyChecking=no` or writes to the user's system known-hosts file.
 */

export interface SshKnownHostsPolicy {
  /**
   * The per-environment known-hosts file. Strict checking means the accepted
   * key material is the only trust anchor for this connection, so a changed
   * host key fails closed.
   */
  readonly userKnownHostsFile: string;
  readonly strict: true;
}

/** The narrow executor the trust helper needs (satisfied by SshTrackedCommandRunner). */
export interface SshCommandExecutor {
  run(
    command: string,
    args: readonly string[],
    options?: {
      readonly stdin?: string;
      readonly timeoutMs?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<SshCommandResult>;
}

export interface SshResolvedTarget {
  readonly host: string;
  readonly port: number;
  /** Effective `HostKeyAlias` from the OpenSSH configuration, when set. */
  readonly hostKeyAlias?: string;
  /** The name OpenSSH looks up in known-hosts for this target. */
  readonly lookupName: string;
}

export interface SshHostKeyObservation {
  readonly keyType: string;
  readonly keyBlob: string;
  readonly fingerprint: string;
  /** The host field as read from the scanned/known-hosts line. */
  readonly hostField: string;
}

export interface SshHostKeyProbe {
  readonly target: SshResolvedTarget;
  /** Every offered key, most-preferred first. */
  readonly observations: readonly SshHostKeyObservation[];
  readonly preferred: SshHostKeyObservation;
}

export interface SshSystemTrust {
  readonly lookupName: string;
  readonly observations: readonly SshHostKeyObservation[];
}

export type SshHostKeyTrustErrorCode = "target-unresolved" | "probe-failed" | "mismatch";

/** Fixed, bounded trust failures; the caller maps these to public error codes. */
export class SshHostKeyTrustError extends Error {
  constructor(
    readonly code: SshHostKeyTrustErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SshHostKeyTrustError";
  }
}

const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const KNOWN_KEY_TYPES = new Set([
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "rsa-sha2-512",
  "rsa-sha2-256",
  "ssh-rsa",
  "ssh-dss",
]);
const KEY_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._-]*$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** SHA-256 fingerprint of an SSH public-key blob, in OpenSSH `SHA256:` form. */
export function sshKeyFingerprint(keyBlob: string): string | null {
  if (!BASE64_PATTERN.test(keyBlob)) return null;
  try {
    const digest = createHash("sha256").update(Buffer.from(keyBlob, "base64")).digest("base64");
    return `SHA256:${digest.replace(/=+$/u, "")}`;
  } catch {
    return null;
  }
}

function keyTypePreference(keyType: string): number {
  switch (keyType) {
    case "ssh-ed25519":
      return 0;
    case "ecdsa-sha2-nistp256":
      return 1;
    case "rsa-sha2-512":
      return 2;
    case "rsa-sha2-256":
      return 3;
    case "ssh-rsa":
      return 4;
    default:
      return 5;
  }
}

function parseKnownHostsLine(line: string): SshHostKeyObservation | null {
  const tokens = line.trim().split(/\s+/u);
  if (tokens.length < 3) return null;
  let index = 0;
  // Markers: @cert-authority is a CA key (not a host key) and @revoked means
  // the key is explicitly untrusted. Neither may establish trust here.
  if (tokens[index]?.startsWith("@")) return null;
  const hostField = tokens[index++]!;
  const keyType = tokens[index++]!;
  const keyBlob = tokens[index]!;
  if (!KEY_TYPE_PATTERN.test(keyType)) return null;
  if (!KNOWN_KEY_TYPES.has(keyType)) return null;
  const fingerprint = sshKeyFingerprint(keyBlob);
  if (fingerprint === null) return null;
  return { keyType, keyBlob, fingerprint, hostField };
}

/** Parse ssh-keyscan output and `ssh-keygen -F` matches into observations. */
export function parseHostKeyObservations(text: string): readonly SshHostKeyObservation[] {
  const observations: SshHostKeyObservation[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const observation = parseKnownHostsLine(line);
    if (
      observation &&
      !observations.some(
        (existing) =>
          existing.keyType === observation.keyType &&
          existing.fingerprint === observation.fingerprint,
      )
    ) {
      observations.push(observation);
    }
  }
  return observations.sort(
    (left, right) =>
      keyTypePreference(left.keyType) - keyTypePreference(right.keyType) ||
      left.keyType.localeCompare(right.keyType),
  );
}

export interface ParsedSshTargetConfig {
  readonly host: string;
  readonly port: number;
  readonly hostKeyAlias?: string;
}

/** Parse `ssh -G` output for the effective hostname, port, and HostKeyAlias. */
export function parseSshResolvedConfig(stdout: string): ParsedSshTargetConfig | null {
  let host: string | undefined;
  let port: number | undefined;
  let hostKeyAlias: string | undefined;
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.search(/\s/u);
    if (separator <= 0) continue;
    const key = line.slice(0, separator).toLowerCase();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (key === "hostname" && value.length > 0) host = value;
    else if (key === "port") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535) port = parsed;
    } else if (key === "hostkeyalias" && value.length > 0) hostKeyAlias = value;
  }
  if (host === undefined || port === undefined) return null;
  return { host, port, ...(hostKeyAlias === undefined ? {} : { hostKeyAlias }) };
}

/** The known-hosts lookup name OpenSSH uses: alias, else `[host]:port` off 22. */
export function sshKnownHostsLookupName(config: ParsedSshTargetConfig): string {
  if (config.hostKeyAlias !== undefined) return config.hostKeyAlias;
  return config.port === 22 ? config.host : `[${config.host}]:${config.port}`;
}

export interface SshHostKeyTrustOptions {
  readonly executor: SshCommandExecutor;
  readonly sshCommand?: string;
  readonly keyscanCommand?: string;
  readonly keygenCommand?: string;
  readonly sshConfigFile?: string;
  readonly commandTimeoutMs?: number;
  /** System known-hosts files consulted for an existing trusted entry. */
  readonly systemKnownHostsFiles?: readonly string[];
}

export class SshHostKeyTrust {
  private readonly executor: SshCommandExecutor;
  private readonly sshCommand: string;
  private readonly keyscanCommand: string;
  private readonly keygenCommand: string;
  private readonly sshConfigFile: string | undefined;
  private readonly commandTimeoutMs: number;
  private readonly systemKnownHostsFiles: readonly string[];

  constructor(options: SshHostKeyTrustOptions) {
    this.executor = options.executor;
    this.sshCommand = options.sshCommand ?? (process.platform === "win32" ? "ssh.exe" : "ssh");
    this.keyscanCommand =
      options.keyscanCommand ?? (process.platform === "win32" ? "ssh-keyscan.exe" : "ssh-keyscan");
    this.keygenCommand =
      options.keygenCommand ?? (process.platform === "win32" ? "ssh-keygen.exe" : "ssh-keygen");
    this.sshConfigFile = options.sshConfigFile;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    this.systemKnownHostsFiles = options.systemKnownHostsFiles ?? [
      join(homedir(), ".ssh", "known_hosts"),
    ];
  }

  /**
   * Resolve `[user@]host` (and an optional explicit port) through the user's
   * OpenSSH configuration without connecting: config aliases expand to their
   * effective hostname/port and `HostKeyAlias`.
   */
  async resolveTarget(
    connection: { readonly target: string; readonly port?: number },
    signal?: AbortSignal,
  ): Promise<SshResolvedTarget> {
    const args = [
      "-G",
      ...(this.sshConfigFile === undefined ? [] : ["-F", this.sshConfigFile]),
      ...(connection.port === undefined ? [] : ["-p", String(connection.port)]),
      connection.target,
    ];
    const result = await this.runCommand(this.sshCommand, args, signal);
    const parsed = parseSshResolvedConfig(result.stdout);
    if (parsed === null) {
      throw new SshHostKeyTrustError(
        "target-unresolved",
        "The SSH target could not be resolved to a host and port.",
      );
    }
    return {
      host: parsed.host,
      port: parsed.port,
      ...(parsed.hostKeyAlias === undefined ? {} : { hostKeyAlias: parsed.hostKeyAlias }),
      lookupName: sshKnownHostsLookupName(parsed),
    };
  }

  /**
   * Fetch the host keys offered by the target. This is an unauthenticated
   * public-key fetch; it performs no login, install, or exec.
   */
  async probe(target: SshResolvedTarget, signal?: AbortSignal): Promise<SshHostKeyProbe> {
    const timeoutSeconds = Math.max(1, Math.ceil(this.commandTimeoutMs / 1_000));
    const result = await this.runCommand(
      this.keyscanCommand,
      ["-T", String(timeoutSeconds), "-p", String(target.port), target.host],
      signal,
    );
    const observations = parseHostKeyObservations(result.stdout);
    if (observations.length === 0) {
      throw new SshHostKeyTrustError(
        "probe-failed",
        "The SSH host did not offer a usable host key.",
      );
    }
    return { target, observations, preferred: observations[0]! };
  }

  /**
   * Look for an existing trusted system known-hosts entry for the resolved
   * target. An entry found here may establish trust without operator
   * confirmation (ADR §4); the returned key material is what gets enforced.
   */
  async readSystemTrust(target: SshResolvedTarget, signal?: AbortSignal): Promise<SshSystemTrust> {
    const observations: SshHostKeyObservation[] = [];
    for (const file of this.systemKnownHostsFiles) {
      let result: SshCommandResult;
      try {
        result = await this.runCommand(
          this.keygenCommand,
          ["-F", target.lookupName, "-f", file],
          signal,
        );
      } catch (error) {
        if (signal?.aborted) throw error;
        // A missing or unreadable system file is not a trust decision.
        continue;
      }
      for (const observation of parseHostKeyObservations(result.stdout)) {
        if (
          !observations.some(
            (existing) =>
              existing.keyType === observation.keyType &&
              existing.fingerprint === observation.fingerprint,
          )
        ) {
          observations.push(observation);
        }
      }
    }
    observations.sort(
      (left, right) =>
        keyTypePreference(left.keyType) - keyTypePreference(right.keyType) ||
        left.keyType.localeCompare(right.keyType),
    );
    return { lookupName: target.lookupName, observations };
  }

  /** One known-hosts line for an accepted key, under the target's lookup name. */
  knownHostsLine(observation: SshHostKeyObservation, target: SshResolvedTarget): string {
    return `${target.lookupName} ${observation.keyType} ${observation.keyBlob}`;
  }

  /**
   * Write (replace) the per-environment known-hosts file with exactly the
   * accepted lines. The file is owner-only and is the only trust material the
   * strict policy consults; it never touches the user's system known-hosts.
   */
  async writeKnownHostsFile(path: string, lines: readonly string[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const body = [
      "# Poracode environment host keys (accepted).",
      "# Regenerated by an explicit manage re-trust; edits are not preserved.",
      ...lines,
      "",
    ].join("\n");
    await writeFileAtomicAsync(path, body, { encoding: "utf8", mode: 0o600 });
  }

  private runCommand(
    command: string,
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<SshCommandResult> {
    return this.executor.run(command, args, {
      timeoutMs: this.commandTimeoutMs,
      ...(signal === undefined ? {} : { signal }),
    });
  }
}
