import { parseServeCliOptions } from "./serverConfig";
import { parseUpgradeCliOptions } from "./serverUpgrade";

export type ServerCliCommand =
  | "serve"
  | "pair-json"
  | "status-json"
  | "activate"
  | "doctor"
  | "backup"
  | "init-tls"
  | "upgrade"
  | "version"
  | "help";

export interface ActivateCliOptions {
  readonly json: boolean;
  readonly signInAgain: boolean;
}

export interface DoctorCliOptions {
  readonly json: boolean;
  /** Optional log file for the redacted recent-errors tail. */
  readonly logFile?: string;
}

export interface BackupCliOptions {
  readonly json: boolean;
  /** Backup destination directory; must not exist and must not overlap the root. */
  readonly to: string;
}

export interface InitTlsCliOptions {
  readonly json: boolean;
  /** Certificate output path; defaults to `<profile>/tls/server.crt`. */
  readonly certPath?: string;
  /** Key output path; defaults to `<profile>/tls/server.key` (mode 0600). */
  readonly keyPath?: string;
}

const INIT_TLS_USAGE = "Usage: poracode-server init-tls [--json] [--cert <path>] [--key <path>]";

export function parseInitTlsCliOptions(args: readonly string[]): InitTlsCliOptions {
  let json = false;
  let certPath: string | undefined;
  let keyPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--cert" || argument === "--key") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(INIT_TLS_USAGE);
      if (argument === "--cert") certPath = value;
      else keyPath = value;
      index += 1;
    } else {
      throw new Error(INIT_TLS_USAGE);
    }
  }
  return { json, ...(certPath ? { certPath } : {}), ...(keyPath ? { keyPath } : {}) };
}

const PAIR_USAGE = "Usage: poracode-server pair --json [--scope viewer|operator]";

export interface PairCliOptions {
  readonly json: true;
  readonly scope?: "operator" | "viewer";
}

export function parsePairCliOptions(args: readonly string[]): PairCliOptions {
  let json = false;
  let scope: "operator" | "viewer" | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--scope") {
      const value = args[index + 1];
      if (value !== "viewer" && value !== "operator") throw new Error(PAIR_USAGE);
      scope = value;
      index += 1;
    } else {
      throw new Error(PAIR_USAGE);
    }
  }
  if (!json) throw new Error(PAIR_USAGE);
  return { json: true, ...(scope ? { scope } : {}) };
}

export function parseServerCliCommand(args: readonly string[]): ServerCliCommand {
  if (args.length === 0) return "serve";
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0]!)) return "help";
  // Truthful artifact version (plan D1/D3); must be checked before the serve
  // branch, which claims every leading `--` flag.
  if (args.length === 1 && ["--version", "-v", "version"].includes(args[0]!)) return "version";
  // `serve` is the default command; its flags (and the bare `serve` keyword)
  // are validated here and re-parsed at dispatch (the established pattern).
  if (args[0] === "serve" || args[0]!.startsWith("--")) {
    parseServeCliOptions(args);
    return "serve";
  }
  if (args[0] === "pair") {
    parsePairCliOptions(args.slice(1));
    return "pair-json";
  }
  if (args.length === 2 && args[0] === "status" && args[1] === "--json") return "status-json";
  if (args[0] === "activate") {
    parseActivateCliOptions(args.slice(1));
    return "activate";
  }
  if (args[0] === "doctor") {
    parseDoctorCliOptions(args.slice(1));
    return "doctor";
  }
  if (args[0] === "backup") {
    parseBackupCliOptions(args.slice(1));
    return "backup";
  }
  if (args[0] === "init-tls") {
    parseInitTlsCliOptions(args.slice(1));
    return "init-tls";
  }
  if (args[0] === "upgrade") {
    parseUpgradeCliOptions(args.slice(1));
    return "upgrade";
  }
  throw new Error(
    `Usage: poracode-server [serve [--config <path>] [--host <host>] [--port <port>] [--trusted-proxies <list>] | ` +
      "activate [--json] [--sign-in-again] | doctor [--json] [--log-file <path>] | " +
      "backup --to <directory> [--json] | init-tls [--json] [--cert <path>] [--key <path>] | " +
      "upgrade (--from <tarball> | --resume [--from <tarball>] | --abandon-journal --confirm) [--prefix <path>] [--json] | " +
      "pair --json [--scope viewer|operator] | status --json | --version | --help]",
  );
}

/** Deliberate activation flags; anything unknown is a usage error. */
export function parseActivateCliOptions(args: readonly string[]): ActivateCliOptions {
  let json = false;
  let signInAgain = false;
  for (const argument of args) {
    if (argument === "--json") json = true;
    else if (argument === "--sign-in-again") signInAgain = true;
    else throw new Error("Usage: poracode-server activate [--json] [--sign-in-again]");
  }
  return { json, signInAgain };
}

/** Read-only diagnostics flags; anything unknown is a usage error. */
export function parseDoctorCliOptions(args: readonly string[]): DoctorCliOptions {
  let json = false;
  let logFile: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--log-file") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("Usage: poracode-server doctor [--json] [--log-file <path>]");
      }
      logFile = value;
      index += 1;
    } else {
      throw new Error("Usage: poracode-server doctor [--json] [--log-file <path>]");
    }
  }
  return { json, ...(logFile !== undefined ? { logFile } : {}) };
}

/** Verified-backup flags; the destination is required, anything else is a usage error. */
export function parseBackupCliOptions(args: readonly string[]): BackupCliOptions {
  let json = false;
  let to: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--to") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("Usage: poracode-server backup --to <directory> [--json]");
      }
      to = value;
      index += 1;
    } else {
      throw new Error("Usage: poracode-server backup --to <directory> [--json]");
    }
  }
  if (to === undefined) {
    throw new Error("Usage: poracode-server backup --to <directory> [--json]");
  }
  return { json, to };
}
