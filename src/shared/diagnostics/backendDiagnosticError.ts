import { buildErrorCauseTags, sanitizeErrorCauseTags, type ErrorCauseTags } from "./errorCause";

const BUNDLES = ["backendHost.cjs", "main.cjs", "supervisor.cjs", "server.cjs"] as const;
// These exact payload-free messages are inputs to main's existing operational filters.
const FILTERED_MESSAGES = [
  "Supervisor exited with code 3221226091",
  "Supervisor exited with code 1073807364",
  "net::ERR_NETWORK_CHANGED",
] as const;
type SourceFrame = { bundle: (typeof BUNDLES)[number]; line: number; column: number };

/** Optional v1 diagnostic detail. Legacy message-only events remain readable. */
export type BackendDiagnosticError = {
  formatVersion: 1;
  cause: ErrorCauseTags;
  frames: SourceFrame[];
  message?: (typeof FILTERED_MESSAGES)[number];
};

export function serializeBackendDiagnosticError(error: unknown): BackendDiagnosticError {
  const frames: SourceFrame[] = [];
  if (error instanceof Error && error.stack) {
    for (const line of error.stack.split("\n").slice(1, 41)) {
      // Only shipped app bundles are source identities; never forward arbitrary
      // filenames, function names, error messages, or a raw stack across IPC.
      const match =
        /^\s+at (?:[^\r\n]* \()?[^\r\n]*[/\\](backendHost\.cjs|main\.cjs|supervisor\.cjs|server\.cjs):(\d{1,7}):(\d{1,7})\)?$/u.exec(
          line,
        );
      if (!match) continue;
      const bundle = BUNDLES.find((candidate) => candidate === match[1]);
      const lineNumber = Number(match[2]);
      const column = Number(match[3]);
      if (bundle && lineNumber > 0 && column > 0) frames.push({ bundle, line: lineNumber, column });
      if (frames.length === 20) break;
    }
  }
  const message = FILTERED_MESSAGES.find(
    (candidate) => error instanceof Error && candidate === error.message,
  );
  return {
    formatVersion: 1,
    cause: buildErrorCauseTags(error),
    frames,
    ...(message ? { message } : {}),
  };
}

export function isBackendDiagnosticError(value: unknown): value is BackendDiagnosticError {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.formatVersion !== 1 || !record.cause || typeof record.cause !== "object") return false;
  const cause = sanitizeErrorCauseTags(record.cause);
  if (
    !cause["poracode.cause_reason"] ||
    Object.keys(cause).length !== Object.keys(record.cause).length
  )
    return false;
  return (
    Object.keys(record).every((key) =>
      ["formatVersion", "cause", "frames", "message"].includes(key),
    ) &&
    (record.message === undefined ||
      FILTERED_MESSAGES.some((message) => message === record.message)) &&
    Array.isArray(record.frames) &&
    record.frames.length <= 20 &&
    record.frames.every((frame: unknown) => {
      if (!frame || typeof frame !== "object") return false;
      const source = frame as Record<string, unknown>;
      return (
        Object.keys(source).every((key) => ["bundle", "line", "column"].includes(key)) &&
        BUNDLES.some((bundle) => bundle === source.bundle) &&
        typeof source.line === "number" &&
        Number.isInteger(source.line) &&
        source.line > 0 &&
        source.line <= 9999999 &&
        typeof source.column === "number" &&
        Number.isInteger(source.column) &&
        source.column > 0 &&
        source.column <= 9999999
      );
    })
  );
}

export function restoreBackendDiagnosticError(
  message: string,
  diagnostic?: BackendDiagnosticError,
): Error {
  if (!diagnostic) return new Error(message);
  const error = Object.assign(new Error(diagnostic.message ?? "Backend operation failed."), {
    diagnosticCause: diagnostic.cause,
  });
  // Do not blame the receiver's handleMessage call when the source is unknown.
  error.stack = [
    `Error: ${error.message}`,
    ...diagnostic.frames.map((frame) => `    at ${frame.bundle}:${frame.line}:${frame.column}`),
  ].join("\n");
  return error;
}
