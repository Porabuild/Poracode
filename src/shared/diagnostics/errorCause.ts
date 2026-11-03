import { DiagnosticError, type DiagnosticFailureMetadata } from "./sentryPolicy";

const CAUSE_REASONS = [
  "unknown",
  "subprocess-exit",
  "signal",
  "cancelled",
  "timeout",
  "network",
  "filesystem",
  "integrity",
  "http",
] as const;
const CODE_REASONS: Record<string, (typeof CAUSE_REASONS)[number]> = {
  ABORT_ERR: "cancelled",
  ERR_CANCELED: "cancelled",
  ERR_CANCELLED: "cancelled",
  ETIMEDOUT: "timeout",
  ESOCKETTIMEDOUT: "timeout",
  ECONNRESET: "network",
  ECONNREFUSED: "network",
  ENOTFOUND: "network",
  EAI_AGAIN: "network",
  EPIPE: "network",
  ENETUNREACH: "network",
  EHOSTUNREACH: "network",
  ENOENT: "filesystem",
  EACCES: "filesystem",
  EPERM: "filesystem",
  ENOSPC: "filesystem",
  EROFS: "filesystem",
  EIO: "filesystem",
  ERR_CHILD_PROCESS_STDIO_MAXBUFFER: "unknown",
  ERR_UPDATER_INVALID_SIGNATURE: "integrity",
  ERR_CHECKSUM_MISMATCH: "integrity",
  internal_error: "http",
  invalid_request: "http",
  invalid_json: "http",
  file_save_conflict: "http",
};
const ERROR_CODES = Object.keys(CODE_REASONS);
const ERROR_TYPES = [
  "error",
  "type-error",
  "range-error",
  "reference-error",
  "syntax-error",
  "uri-error",
  "eval-error",
  "aggregate-error",
  "abort-error",
  "timeout-error",
  "non-error",
] as const;
const SIGNALS = [
  "SIGTERM",
  "SIGKILL",
  "SIGINT",
  "SIGABRT",
  "SIGSEGV",
  "SIGPIPE",
  "SIGHUP",
] as const;

export const ERROR_CAUSE_TAG_KEYS = [
  "poracode.cause_reason",
  "poracode.cause_code",
  "poracode.cause_type",
  "poracode.exit_code",
  "poracode.http_status",
  "poracode.signal",
] as const;
export type ErrorCauseTags = Partial<Record<(typeof ERROR_CAUSE_TAG_KEYS)[number], string>>;

function member(values: readonly string[], value: unknown): value is string {
  return typeof value === "string" && values.includes(value);
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function isErrorCauseTag(key: string, value: unknown): value is string {
  switch (key) {
    case "poracode.cause_reason":
      return member(CAUSE_REASONS, value);
    case "poracode.cause_code":
      return member(ERROR_CODES, value);
    case "poracode.cause_type":
      return member(ERROR_TYPES, value);
    case "poracode.signal":
      return member(SIGNALS, value);
    case "poracode.exit_code":
      return (
        typeof value === "string" &&
        String(Number(value)) === value &&
        boundedInteger(Number(value), -2147483648, 4294967295)
      );
    case "poracode.http_status":
      return typeof value === "string" && /^[1-5]\d{2}$/u.test(value);
    default:
      return false;
  }
}

export function sanitizeErrorCauseTags(value: unknown): ErrorCauseTags {
  const tags: ErrorCauseTags = {};
  if (!value || typeof value !== "object") return tags;
  for (const key of ERROR_CAUSE_TAG_KEYS) {
    const candidate = (value as Record<string, unknown>)[key];
    if (isErrorCauseTag(key, candidate)) tags[key] = candidate;
  }
  return tags;
}

function errorType(error: unknown): string {
  if (error instanceof TypeError) return "type-error";
  if (error instanceof RangeError) return "range-error";
  if (error instanceof ReferenceError) return "reference-error";
  if (error instanceof SyntaxError) return "syntax-error";
  if (error instanceof URIError) return "uri-error";
  if (error instanceof EvalError) return "eval-error";
  if (error instanceof AggregateError) return "aggregate-error";
  if (error instanceof Error) {
    if (error.name === "AbortError") return "abort-error";
    if (error.name === "TimeoutError") return "timeout-error";
    return "error";
  }
  return "non-error";
}

/** Extract structure before replacing errors with payload-free diagnostics. Never parse output. */
export function buildErrorCauseTags(error: unknown): ErrorCauseTags {
  const tags: ErrorCauseTags = { "poracode.cause_type": errorType(error) };
  const visited = new Set<unknown>();
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object" && !visited.has(current);
    depth += 1
  ) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const preserved = sanitizeErrorCauseTags(record.diagnosticCause);
    if (preserved["poracode.cause_reason"]) return preserved;
    const type = errorType(current);
    if (type !== "error" && type !== "non-error") tags["poracode.cause_type"] = type;
    if (member(ERROR_CODES, record.code)) tags["poracode.cause_code"] ??= record.code;
    const exitCode =
      record.exitCode ??
      (typeof record.cmd === "string" || typeof record.stderr === "string"
        ? record.code
        : undefined);
    if (boundedInteger(exitCode, -2147483648, 4294967295))
      tags["poracode.exit_code"] ??= String(exitCode);
    const status = record.statusCode ?? record.status;
    if (boundedInteger(status, 100, 599)) tags["poracode.http_status"] ??= String(status);
    if (member(SIGNALS, record.signal)) tags["poracode.signal"] ??= record.signal;
    current = record.cause;
  }
  const code = tags["poracode.cause_code"];
  const type = tags["poracode.cause_type"];
  let reason = code ? CODE_REASONS[code] : undefined;
  if (type === "abort-error") reason = "cancelled";
  else if (type === "timeout-error") reason = "timeout";
  if (!reason || reason === "unknown") {
    if (tags["poracode.http_status"]) reason = "http";
    else if (tags["poracode.signal"]) reason = "signal";
    else if (tags["poracode.exit_code"]) reason = "subprocess-exit";
  }
  tags["poracode.cause_reason"] = reason ?? "unknown";
  return tags;
}

export function findDiagnosticFailureMetadata(
  error: unknown,
): DiagnosticFailureMetadata | undefined {
  const visited = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error && !visited.has(current); depth += 1) {
    visited.add(current);
    if (current instanceof DiagnosticError) return current.diagnostic;
    current = current.cause;
  }
  return undefined;
}

export function classifyErrorCause(
  error: unknown,
  domain: string,
): DiagnosticFailureMetadata | undefined {
  if (findDiagnosticFailureMetadata(error)) return undefined;
  const reason = buildErrorCauseTags(error)["poracode.cause_reason"];
  if (reason === "cancelled")
    return { failureClass: "expected-operational", domain, errorClass: "cancelled" };
  if (reason === "network" || reason === "timeout")
    return { failureClass: "transient-service", domain, errorClass: reason };
  return undefined;
}
