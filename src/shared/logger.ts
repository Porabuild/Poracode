export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type LogSink = Pick<Console, LogLevel>;

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && Object.hasOwn(LEVEL_ORDER, value);
}

/** `PORACODE_LOG_LEVEL` (debug|info|warn|error) wherever `process` exists; info otherwise. */
function configuredLevel(): LogLevel {
  const raw = typeof process === "undefined" ? undefined : process.env.PORACODE_LOG_LEVEL;
  return isLogLevel(raw) ? raw : "info";
}

/**
 * Scoped console logger: every line starts with `[scope]`, matching the
 * existing log convention that host and server log files are searched by, and
 * levels below the configured threshold are dropped. Use it instead of an
 * empty `catch` when a failure is not fatal but still worth diagnosing.
 */
export function createLogger(
  scope: string,
  options: { readonly sink?: LogSink; readonly level?: LogLevel } = {},
): Logger {
  const sink = options.sink ?? console;
  const threshold = LEVEL_ORDER[options.level ?? configuredLevel()];
  const write =
    (level: LogLevel) =>
    (message: string, detail?: unknown): void => {
      if (LEVEL_ORDER[level] < threshold) return;
      if (detail === undefined) sink[level](`[${scope}] ${message}`);
      else sink[level](`[${scope}] ${message}`, detail);
    };
  return { debug: write("debug"), info: write("info"), warn: write("warn"), error: write("error") };
}
