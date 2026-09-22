/**
 * Type surface of scripts/ci-windows-wsl-lab.mjs for TypeScript consumers
 * (tests/real-wsl reads the lab manifest and decodes wsl.exe output through
 * the script so parsing rules have a single source of truth).
 */

export declare const PRIMARY_DISTRO: string;
export declare const SECONDARY_DISTRO: string;
export declare const UBUNTU_24_04_ROOTFS_URL: string;
export declare const ROOTFS_CACHE_NAME: string;
export declare const MAX_ROOTFS_BYTES: number;
export declare const DEFAULT_SSHD_PORT: number;
export declare const DEFAULT_REACHABILITY_PORT: number;
export declare const FIREWALL_RULE_NAME: string;
export declare const WSLCONFIG_BACKUP_NAME: string;
export declare const LAB_SCHEMA: string;

export declare const TYPED_EXIT_CODES: Readonly<{
  OK: 0;
  NOT_WINDOWS: 2;
  WSL_MISSING: 3;
  PROVISION_FAILED: 4;
  CLEANUP_FAILED: 5;
  USAGE: 6;
}>;

export declare class LabError extends Error {
  constructor(code: number, message: string);
  code: number;
}

export declare class UsageError extends LabError {
  constructor(message: string);
}

export declare class SubprocessError extends Error {
  constructor(label: string, code: number | "timeout", stderrTail: string);
  label: string;
  code: number | "timeout";
  stderrTail: string;
}

/** One check row from the lab manifest's `checks` array. */
export interface LabJsonCheck {
  name: string;
  ok: boolean;
  ms: number;
  detail?: unknown;
  error?: string;
}

export interface LabJsonDistro {
  name: string;
  role: "primary" | "secondary";
  importedByThisRun: boolean;
  installDir: string;
  osRelease?: string | undefined;
  arch?: "x64" | "arm64" | undefined;
}

export interface LabJsonSshd {
  configured: boolean;
  ports: Record<string, number>;
  port?: number | undefined;
  fingerprint?: string | undefined;
  keyFileName?: string | undefined;
}

/** The redacted lab manifest (`poracode-windows-wsl-lab/1`). */
export interface LabJson {
  schema: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  host: { platform: string; wslVersion: string };
  mode: "nat" | "mirrored";
  modeChanged: boolean;
  evidenceDir: string;
  stateDir: string;
  distros: LabJsonDistro[];
  sshd: LabJsonSshd;
  firewall: { ruleName: string | null; ruleAdded: boolean };
  reachabilityPort: number;
  checks: LabJsonCheck[];
  failure?: string | undefined;
}

/** Decode wsl.exe management output (UTF-16LE) or in-distro output (UTF-8). */
export declare function decodeWslOutput(buffer: Buffer): string;

/** Parse `wsl --list --quiet` output into distro names. */
export declare function parseDistroList(stdout: string): string[];

export declare function hasDistro(names: readonly string[], name: string): boolean;

export declare function assertDistroNameSafe(name: string): void;

export declare function normalizeNetworkingMode(raw: string): "nat" | "mirrored" | "unknown";

export declare function buildWslconfig(
  mode: "nat" | "mirrored",
  existing: string | null,
): { content: string | null; changed: boolean };

export declare function parseOsReleaseField(contents: string, field: string): string | null;

export declare function redactPrivateMaterial(text: string, secrets?: string[]): string;

export declare function computeTaskkillArgs(pid: number): string[];

export interface LabCliOptions {
  command: "provision" | "cleanup" | "help";
  mode: "nat" | "mirrored";
  withSshd: boolean;
  guestIngress: boolean;
  out: string;
  state: string | undefined;
  rootfs: string | undefined;
  rootfsSha256: string | undefined;
  sshdPort: number;
  reachabilityPort: number;
}

export declare function parseArgv(argv: readonly string[]): LabCliOptions;

export declare function validateLabJson(value: unknown): LabJson;

export declare const SSHD_INSTALL_SCRIPT: string;
export declare const SSHD_CONFIGURE_SCRIPT: string;

export declare function buildSshProbeArgs(options: {
  keyPath: string;
  port: number;
  knownHostsPath: string;
}): string[];

export declare function isPublicKeyLine(line: string): boolean;

export interface RunBoundedOptions {
  timeoutMs: number;
  stdin?: string | undefined;
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  label?: string | undefined;
  allowExitCodes?: number[] | undefined;
  maxOutputBytes?: number | undefined;
}

export interface RunBoundedResult {
  code: number;
  stdout: Buffer;
  stderr: Buffer;
}

export declare function runBounded(
  file: string,
  args: readonly string[],
  options: RunBoundedOptions,
): Promise<RunBoundedResult>;

export declare function main(argv?: readonly string[]): Promise<number>;
