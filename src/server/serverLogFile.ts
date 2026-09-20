import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_LOG_MAX_BYTES,
  DEFAULT_LOG_MAX_FILES,
  LOG_LEVEL_ENV,
  SERVER_LOG_LEVELS,
  type ServerLogLevel,
} from "./serverConfig";

/**
 * Leveled, size-rotated JSONL log file for the standalone server (plan item
 * 4.9, finding H7). The process's existing `console.*` output is preserved on
 * stdout/stderr unchanged (service managers journal it); this sink ADDITIVELY
 * mirrors everything at or above the configured level into a structured file
 * under the host root, rotating by size.
 *
 * The sink starts only after the owner lease is held (the CLI installs it once
 * the owned data root exists) — nothing writes to the root before ownership,
 * per the published startup contract. Startup output before that point stays
 * on stderr, which is exactly where a failing unit belongs.
 *
 * Writes are synchronous appends: server console volume is low, ordering is
 * preserved across rotation, and a crash can never lose the entry that
 * explains it. If the file becomes unwritable the sink degrades to stderr
 * once and disables itself rather than throwing into arbitrary call sites.
 */

const LEVEL_RANK: Record<ServerLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogLevel = ServerLogLevel;

export function parseLogLevel(raw: string | undefined): LogLevel | undefined {
  const value = raw?.trim().toLowerCase();
  return SERVER_LOG_LEVELS.find((level) => level === value);
}

export interface ServerLogFileOptions {
  /** Live log file path; rotations are `path.1` … `path.<maxFiles>`. */
  readonly path: string;
  /** Minimum level mirrored into the file. Defaults to the
   * `PORACODE_LOG_LEVEL` environment value, then `info`. */
  readonly level?: LogLevel;
  readonly env?: NodeJS.ProcessEnv;
  /** Rotation threshold in bytes for the live file. */
  readonly maxBytes?: number;
  /** Number of rotated files kept (`path.1` is the newest). */
  readonly maxFiles?: number;
}

export interface ServerLogFileHandle {
  /** The level the sink resolved to (for the startup disclosure). */
  readonly level: LogLevel;
  stop(): void;
}

interface ConsoleHooks {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function serializeArg(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/** One rotation generation: byte counting plus `renameSync` shifting. */
class RotatingFile {
  private fd: number | null = null;
  private bytes = 0;

  constructor(
    private readonly path: string,
    private readonly maxBytes: number,
    private readonly maxFiles: number,
  ) {}

  append(line: string): void {
    if (this.fd === null) this.open();
    if (this.fd === null) throw new Error("log file open failed");
    const buffer = Buffer.from(line, "utf8");
    writeSync(this.fd, buffer);
    this.bytes += buffer.byteLength;
    if (this.bytes >= this.maxBytes) this.rotate();
  }

  close(): void {
    if (this.fd !== null) {
      try {
        closeSync(this.fd);
      } catch {
        // already closed
      }
      this.fd = null;
    }
  }

  private open(): void {
    this.fd = openSync(this.path, "a");
    try {
      this.bytes = statSync(this.path).size;
    } catch {
      this.bytes = 0;
    }
  }

  private rotate(): void {
    this.close();
    rotateServerLogFiles(this.path, this.maxFiles);
    this.open();
  }
}

/** Shifts `path.N-1` → `path.N` (dropping the oldest into the overwritten
 * slot), newest first, then renames the live `path` to `path.1`. The caller
 * must have closed any open handle on `path`. Exported so other owned-root
 * JSONL logs (notably the main-process audit log, `src/main/remote/server/
 * auditLog.ts`, which sits outside this CLI lane's file ownership) can adopt
 * the same rotation shape without duplicating it. */
export function rotateServerLogFiles(path: string, maxFiles: number): void {
  for (let generation = maxFiles - 1; generation >= 1; generation -= 1) {
    const from = `${path}.${generation}`;
    if (existsSync(from)) renameSync(from, `${path}.${generation + 1}`);
  }
  if (existsSync(path)) renameSync(path, `${path}.1`);
}

/** Installs the console-mirroring sink. Returns a handle whose `stop()`
 * restores the previous console hooks (used on clean shutdown). */
export function startServerLogFile(options: ServerLogFileOptions): ServerLogFileHandle {
  const level = options.level ?? parseLogLevel(options.env?.[LOG_LEVEL_ENV]) ?? "info";
  const maxBytes = options.maxBytes ?? DEFAULT_LOG_MAX_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_LOG_MAX_FILES;
  mkdirSync(dirname(options.path), { recursive: true });
  const file = new RotatingFile(options.path, maxBytes, maxFiles);

  let disabled = false;
  const writeEntry = (entryLevel: LogLevel, args: unknown[]): void => {
    if (disabled || LEVEL_RANK[entryLevel] < LEVEL_RANK[level]) return;
    const [message, ...rest] = args;
    const entry = {
      ts: new Date().toISOString(),
      level: entryLevel,
      msg: typeof message === "string" ? message : serializeArg(message),
      ...(rest.length > 0 ? { args: rest.map(serializeArg) } : {}),
    };
    let line: string;
    try {
      line = `${JSON.stringify(entry)}\n`;
    } catch {
      // Circular or otherwise unserializable payload: flatten defensively.
      line = `${JSON.stringify({
        ts: entry.ts,
        level: entry.level,
        msg: String(message),
        args: rest.map((argument) => String(argument)),
      })}\n`;
    }
    try {
      file.append(line);
    } catch {
      disabled = true;
      try {
        writeSync(2, `[poracode-server] log file ${options.path} disabled after write failure\n`);
      } catch {
        // stderr is best-effort too.
      }
    }
  };

  const hooks: ConsoleHooks = {
    log: (...args: unknown[]) => writeEntry("info", args),
    info: (...args: unknown[]) => writeEntry("info", args),
    warn: (...args: unknown[]) => writeEntry("warn", args),
    error: (...args: unknown[]) => writeEntry("error", args),
  };
  const previous: ConsoleHooks = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  // ADDITIVE mirror, never a replacement (deep-review fix): every hook
  // delegates to the previous console binding first so stdout/stderr keep
  // flowing for service managers and `docker logs`, then appends to the file.
  console.log = (...args: unknown[]) => {
    previous.log(...args);
    hooks.log(...args);
  };
  console.info = (...args: unknown[]) => {
    previous.info(...args);
    hooks.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    previous.warn(...args);
    hooks.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    previous.error(...args);
    hooks.error(...args);
  };

  return {
    level,
    stop(): void {
      console.log = previous.log;
      console.info = previous.info;
      console.warn = previous.warn;
      console.error = previous.error;
      file.close();
    },
  };
}

/** Default live-log location under an owned data root. */
export function serverLogFilePath(dataRoot: string): string {
  return join(dataRoot, "logs", "server.log");
}
