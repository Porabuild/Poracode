import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Standalone-server configuration file (plan item 4.9, finding H7).
 *
 * `poracode-server serve` reads an optional JSON config file — by default
 * `poracode-server.json` in the profile namespace, overridable with
 * `--config <path>` — and maps every recognized field onto the documented
 * environment contract the composed host already reads:
 *
 * | config field             | environment variable                     |
 * | ------------------------ | ---------------------------------------- |
 * | `host`                   | `PORACODE_REMOTE_ACCESS_HOST`            |
 * | `port`                   | `PORACODE_REMOTE_ACCESS_PORT`            |
 * | `bindMode`               | `PORACODE_REMOTE_BIND_MODE`              |
 * | `relayUrl`               | `PORACODE_REMOTE_RELAY_URL`              |
 * | `tlsCert`                | `PORACODE_REMOTE_TLS_CERT`               |
 * | `tlsKey`                 | `PORACODE_REMOTE_TLS_KEY`                |
 * | `trustedProxies`         | `PORACODE_REMOTE_TRUSTED_PROXIES`        |
 *
 * Precedence per field: `--host`/`--port` CLI flags (the invocation's explicit
 * intent) win over an already-set environment variable, which wins over the
 * config file, which wins over the built-in default. The plaintext-LAN
 * acknowledgement (`PORACODE_ALLOW_PLAINTEXT_LAN`) is deliberately NOT
 * configurable here: a written file is too easily left behind; a security
 * acknowledgement belongs to the invocation environment only.
 *
 * Operability fields (`logLevel`, `logMaxBytes`, `logMaxFiles`,
 * `shutdownDrainDeadlineMs`) configure this CLI process itself and do not map
 * to the host's environment. `PORACODE_LOG_LEVEL` (documented log-level
 * contract) and `PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS` act as the environment
 * layer for them, with the same precedence.
 *
 * This module is CLI-owned (the `src/server` composition lane). The remote
 * access env contract itself lives in `src/main/remote/config.ts`; its values
 * are read — never redefined — through that module's exports.
 */

export const SERVER_CONFIG_FILE_NAME = "poracode-server.json";

/** Documented environment variables this CLI maps configuration onto. The
 * names are the published deployment contract (docs/STANDALONE_SERVER.md and
 * `src/main/remote/config.ts`); they are restated here as mapping TARGETS so
 * the config file can drive them without this module importing the main
 * process composition. */
export const REMOTE_ACCESS_HOST_ENV = "PORACODE_REMOTE_ACCESS_HOST";
export const REMOTE_ACCESS_PORT_ENV = "PORACODE_REMOTE_ACCESS_PORT";
export const REMOTE_RELAY_URL_ENV = "PORACODE_REMOTE_RELAY_URL";

export const LOG_LEVEL_ENV = "PORACODE_LOG_LEVEL";
export const SHUTDOWN_DRAIN_DEADLINE_ENV = "PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS";

export type ServerLogLevel = "debug" | "info" | "warn" | "error";
export const SERVER_LOG_LEVELS: readonly ServerLogLevel[] = ["debug", "info", "warn", "error"];

export const DEFAULT_LOG_LEVEL: ServerLogLevel = "info";
export const DEFAULT_LOG_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_LOG_MAX_FILES = 5;
/** Bounded drain (plan 4.9): SIGTERM disposal gets this long before the
 * process force-exits; the owner lease's kernel lock is released by the exit
 * itself, so the lease is always free within the deadline plus process teardown. */
export const DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS = 10_000;
const MIN_SHUTDOWN_DRAIN_DEADLINE_MS = 500;
const MAX_SHUTDOWN_DRAIN_DEADLINE_MS = 120_000;

const serverLogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const serverConfigFileSchema = z
  .object({
    /** Bind host for the remote listener (PORACODE_REMOTE_ACCESS_HOST). */
    host: z.string().trim().min(1).optional(),
    /** Bind port for the remote listener (PORACODE_REMOTE_ACCESS_PORT). */
    port: z.number().int().min(0).max(65535).optional(),
    /** Named bind mode (PORACODE_REMOTE_BIND_MODE): loopback | tailnet | lan. */
    bindMode: z.enum(["loopback", "tailnet", "lan"]).optional(),
    /** Relay control URL to register with (PORACODE_REMOTE_RELAY_URL). */
    relayUrl: z.string().trim().min(1).optional(),
    /** TLS material paths (PORACODE_REMOTE_TLS_CERT / PORACODE_REMOTE_TLS_KEY).
     * Both must be provided together; the main-process config module fails
     * startup loudly on a partial or unloadable pair. */
    tlsCert: z.string().trim().min(1).optional(),
    tlsKey: z.string().trim().min(1).optional(),
    /** Exact addresses or CIDRs whose X-Forwarded-For the rate limiter may honor. */
    trustedProxies: z.array(z.string().trim().min(1)).min(1).optional(),
    /** File log level (PORACODE_LOG_LEVEL). */
    logLevel: serverLogLevelSchema.optional(),
    /** Per-file rotation threshold in bytes. */
    logMaxBytes: z
      .number()
      .int()
      .min(64 * 1024)
      .max(1024 * 1024 * 1024)
      .optional(),
    /** Rotated files kept alongside the live log. */
    logMaxFiles: z.number().int().min(1).max(100).optional(),
    /** SIGTERM drain deadline in milliseconds. */
    shutdownDrainDeadlineMs: z
      .number()
      .int()
      .min(MIN_SHUTDOWN_DRAIN_DEADLINE_MS)
      .max(MAX_SHUTDOWN_DRAIN_DEADLINE_MS)
      .optional(),
  })
  .strict();

export type ServerConfigFile = z.infer<typeof serverConfigFileSchema>;

/** Parsed-but-not-applied CLI options for `poracode-server [serve]`. */
export interface ServeCliOptions {
  /** `--config <path>`: an explicit config file location. */
  readonly config?: string;
  /** `--host <host>`: bind host override. */
  readonly host?: string;
  /** `--port <port>`: bind port override. */
  readonly port?: number;
  /** `--trusted-proxies <list>`: comma-separated addresses or CIDRs. */
  readonly trustedProxies?: string;
}

export const SERVE_USAGE =
  "Usage: poracode-server [serve [--config <path>] [--host <host>] [--port <port>] [--trusted-proxies <list>]]";

/** Parses `[serve] --config/--host/--port` options; anything else is a usage
 * error. `serve` itself is optional (bare `poracode-server` still serves). */
export function parseServeCliOptions(args: readonly string[]): ServeCliOptions {
  let config: string | undefined;
  let host: string | undefined;
  let port: number | undefined;
  let trustedProxies: string | undefined;
  const positional = args[0] === "serve";
  for (let index = positional ? 1 : 0; index < args.length; index += 1) {
    const argument = args[index]!;
    const value = (): string => {
      const next = args[index + 1];
      if (next === undefined) throw new Error(SERVE_USAGE);
      index += 1;
      return next;
    };
    if (argument === "--config") config = value();
    else if (argument === "--host") host = value();
    else if (argument === "--port") {
      const parsed = Number(value());
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error(SERVE_USAGE);
      }
      port = parsed;
    } else if (argument === "--trusted-proxies") trustedProxies = value();
    else throw new Error(SERVE_USAGE);
  }
  return {
    ...(config !== undefined ? { config } : {}),
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(trustedProxies !== undefined ? { trustedProxies } : {}),
  };
}

/** Reads and parses the config file. Missing file → undefined (config is
 * optional); malformed content or an unknown field throws with the offending
 * path so a typo fails startup loudly instead of silently using defaults. */
export function loadServerConfigFile(input: {
  readonly path: string;
  readonly readText?: (path: string) => string | undefined;
}): ServerConfigFile | undefined {
  const readText =
    input.readText ??
    ((path: string): string | undefined => {
      try {
        return readFileSync(path, "utf8");
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    });
  const text = readText(input.path);
  if (text === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Server config file ${input.path} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  const result = serverConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Server config file ${input.path} is invalid: ${issues}`);
  }
  return result.data;
}

export interface ResolvedServeSettings {
  /** The config file in effect, when one exists (absolute or as given). */
  readonly configPath?: string;
  /** Values to apply to the documented environment variables before the host
   * composition reads them. A field is present only when this resolution
   * actually decides it (a value the environment already provides is NOT
   * repeated here — the environment keeps it). */
  readonly remoteAccessHost?: string;
  readonly remoteAccessPort?: number;
  readonly remoteBindMode?: "loopback" | "tailnet" | "lan";
  readonly relayUrl?: string;
  readonly tlsCert?: string;
  readonly tlsKey?: string;
  readonly trustedProxies?: string;
  readonly logLevel: ServerLogLevel;
  readonly logMaxBytes: number;
  readonly logMaxFiles: number;
  readonly shutdownDrainDeadlineMs: number;
  /** Non-fatal resolution notes (config field shadowed by CLI/env, etc.),
   * printed once at startup. */
  readonly warnings: readonly string[];
}

export interface ResolveServeSettingsInput {
  readonly flags: ServeCliOptions;
  readonly env: NodeJS.ProcessEnv;
  /** Default config location when `flags.config` is absent. */
  readonly defaultConfigPath: string;
  readonly readText?: (path: string) => string | undefined;
}

function envLevel(raw: string | undefined): ServerLogLevel | undefined {
  const value = raw?.trim().toLowerCase();
  return SERVER_LOG_LEVELS.find((level) => level === value);
}

/**
 * Pure precedence resolution (CLI flag > environment > config file > default).
 * Returns the values the CLI should apply plus everything it decided; tests
 * inject `readText`, production reads the filesystem.
 */
export function resolveServeSettings(input: ResolveServeSettingsInput): ResolvedServeSettings {
  const warnings: string[] = [];
  const configPath = input.flags.config ?? input.defaultConfigPath;
  const file = loadServerConfigFile({
    path: configPath,
    ...(input.readText ? { readText: input.readText } : {}),
  });

  const pick = <T>(
    name: string,
    flag: T | undefined,
    envName: string | undefined,
    envValue: string | undefined,
    fileValue: T | undefined,
    parseEnv?: (raw: string) => T | undefined,
  ): { value?: T; warning?: string } => {
    if (flag !== undefined) return { value: flag };
    if (envName !== undefined && envValue !== undefined && envValue.trim() !== "") {
      const parsed = parseEnv ? parseEnv(envValue) : (envValue as unknown as T);
      if (parsed === undefined) {
        warnings.push(`Ignoring invalid ${envName} value "${envValue}".`);
        return {};
      }
      return { value: parsed };
    }
    if (fileValue !== undefined) {
      const warning =
        envName === undefined ? undefined : `${name} from ${configPath} (env ${envName} unset)`;
      return warning === undefined ? { value: fileValue } : { value: fileValue, warning };
    }
    return {};
  };

  const host = pick(
    "host",
    input.flags.host,
    REMOTE_ACCESS_HOST_ENV,
    input.env[REMOTE_ACCESS_HOST_ENV],
    file?.host,
  );
  if (host.warning) warnings.push(host.warning);
  const port = pick(
    "port",
    input.flags.port,
    REMOTE_ACCESS_PORT_ENV,
    input.env[REMOTE_ACCESS_PORT_ENV],
    file?.port,
    (raw) => {
      const parsed = Number(raw);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : undefined;
    },
  );
  if (port.warning) warnings.push(port.warning);
  const bindMode = pick(
    "bindMode",
    undefined,
    "PORACODE_REMOTE_BIND_MODE",
    input.env.PORACODE_REMOTE_BIND_MODE,
    file?.bindMode,
  );
  if (bindMode.warning) warnings.push(bindMode.warning);
  const relayUrl = pick(
    "relayUrl",
    undefined,
    REMOTE_RELAY_URL_ENV,
    input.env[REMOTE_RELAY_URL_ENV],
    file?.relayUrl,
  );
  if (relayUrl.warning) warnings.push(relayUrl.warning);
  const tlsCert = pick(
    "tlsCert",
    undefined,
    "PORACODE_REMOTE_TLS_CERT",
    input.env.PORACODE_REMOTE_TLS_CERT,
    file?.tlsCert,
  );
  if (tlsCert.warning) warnings.push(tlsCert.warning);
  const tlsKey = pick(
    "tlsKey",
    undefined,
    "PORACODE_REMOTE_TLS_KEY",
    input.env.PORACODE_REMOTE_TLS_KEY,
    file?.tlsKey,
  );
  if (tlsKey.warning) warnings.push(tlsKey.warning);
  const trustedProxies = pick(
    "trustedProxies",
    input.flags.trustedProxies,
    "PORACODE_REMOTE_TRUSTED_PROXIES",
    input.env.PORACODE_REMOTE_TRUSTED_PROXIES,
    file?.trustedProxies?.join(","),
  );
  if (trustedProxies.warning) warnings.push(trustedProxies.warning);
  if ((tlsCert.value !== undefined) !== (tlsKey.value !== undefined)) {
    warnings.push(
      "Configured TLS material is incomplete (only one of tlsCert/tlsKey set); the main-process config module will fail startup loudly.",
    );
  }

  const envLogLevel = envLevel(input.env[LOG_LEVEL_ENV]);
  if (input.env[LOG_LEVEL_ENV]?.trim() && !envLogLevel) {
    warnings.push(`Ignoring invalid ${LOG_LEVEL_ENV} value "${input.env[LOG_LEVEL_ENV]}".`);
  }
  const logLevel = envLogLevel ?? file?.logLevel ?? DEFAULT_LOG_LEVEL;

  const rawDeadline =
    input.env[SHUTDOWN_DRAIN_DEADLINE_ENV]?.trim() !== undefined &&
    input.env[SHUTDOWN_DRAIN_DEADLINE_ENV]?.trim() !== ""
      ? Number(input.env[SHUTDOWN_DRAIN_DEADLINE_ENV])
      : undefined;
  let shutdownDrainDeadlineMs = file?.shutdownDrainDeadlineMs ?? DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS;
  if (rawDeadline !== undefined) {
    if (Number.isSafeInteger(rawDeadline)) {
      shutdownDrainDeadlineMs = Math.min(
        MAX_SHUTDOWN_DRAIN_DEADLINE_MS,
        Math.max(MIN_SHUTDOWN_DRAIN_DEADLINE_MS, rawDeadline),
      );
    } else {
      warnings.push(`Ignoring invalid ${SHUTDOWN_DRAIN_DEADLINE_ENV} value "${rawDeadline}".`);
    }
  }

  return {
    ...(file !== undefined ? { configPath } : {}),
    ...(host.value !== undefined ? { remoteAccessHost: host.value } : {}),
    ...(port.value !== undefined ? { remoteAccessPort: port.value } : {}),
    ...(bindMode.value !== undefined
      ? { remoteBindMode: bindMode.value as "loopback" | "tailnet" | "lan" }
      : {}),
    ...(relayUrl.value !== undefined ? { relayUrl: relayUrl.value } : {}),
    ...(tlsCert.value !== undefined ? { tlsCert: tlsCert.value } : {}),
    ...(tlsKey.value !== undefined ? { tlsKey: tlsKey.value } : {}),
    ...(trustedProxies.value !== undefined ? { trustedProxies: trustedProxies.value } : {}),
    logLevel,
    logMaxBytes: file?.logMaxBytes ?? DEFAULT_LOG_MAX_BYTES,
    logMaxFiles: file?.logMaxFiles ?? DEFAULT_LOG_MAX_FILES,
    shutdownDrainDeadlineMs,
    warnings,
  };
}

/** Applies the resolved settings onto `process.env` for the host composition:
 * CLI flags set the variable unconditionally; config-file values fill only
 * the variables the invocation environment left unset. Returns the variables
 * it set (names only) for the startup disclosure. */
export function applyServeSettingsToEnv(
  settings: ResolvedServeSettings,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const applied: string[] = [];
  const setFromFlags: Array<[string, string]> = [];
  if (settings.remoteAccessHost !== undefined) {
    setFromFlags.push([REMOTE_ACCESS_HOST_ENV, settings.remoteAccessHost]);
  }
  if (settings.remoteAccessPort !== undefined) {
    setFromFlags.push([REMOTE_ACCESS_PORT_ENV, String(settings.remoteAccessPort)]);
  }
  if (settings.trustedProxies !== undefined) {
    setFromFlags.push(["PORACODE_REMOTE_TRUSTED_PROXIES", settings.trustedProxies]);
  }
  for (const [name, value] of setFromFlags) {
    env[name] = value;
    applied.push(name);
  }
  const fillIfUnset: Array<[string, string | undefined]> = [
    ["PORACODE_REMOTE_BIND_MODE", settings.remoteBindMode],
    [REMOTE_RELAY_URL_ENV, settings.relayUrl],
    ["PORACODE_REMOTE_TLS_CERT", settings.tlsCert],
    ["PORACODE_REMOTE_TLS_KEY", settings.tlsKey],
  ];
  for (const [name, value] of fillIfUnset) {
    if (value === undefined) continue;
    const existing = env[name]?.trim();
    if (existing) continue;
    env[name] = value;
    applied.push(name);
  }
  return applied;
}
