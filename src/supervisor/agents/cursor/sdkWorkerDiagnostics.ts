import { classifyCursorSdkRuntimeError } from "./sdkLoaderSupport";
import type { CursorSdkRunResult } from "./sdkProtocol";
import type { CursorSdkWorkerError, CursorSdkWorkerMcpServer } from "./sdkWorkerProtocol";

export class WorkerDiagnosticError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CursorSdkWorkerError";
    this.code = code;
  }
}

/**
 * Process-local registry for credentials passed to the external SDK.
 *
 * Provider errors can echo transport configuration, so both thrown failures
 * and normal `RunResult.error` payloads pass through this boundary. The same
 * registered secrets are removed from provider payloads before they cross the
 * worker protocol: MCP failures and persisted assistant/tool messages can
 * otherwise echo a credential even when the SDK call itself succeeds.
 */
export class CursorSdkWorkerDiagnostics {
  private readonly secrets = new Set<string>();
  /**
   * Longest-first snapshot of `secrets`, rebuilt only when a secret is added.
   * Every streamed event string passes through `redact()`, so the ordering
   * must not be recomputed per call.
   */
  private orderedSecrets: readonly string[] = [];

  constructor() {
    // The worker's environment is fixed at spawn time.
    this.rememberSecret(process.env.CURSOR_API_KEY);
  }

  rememberSecret(value: string | undefined): void {
    if (!value?.trim() || this.secrets.has(value)) return;
    this.secrets.add(value);
    this.orderedSecrets = [...this.secrets].sort((left, right) => right.length - left.length);
  }

  rememberMcpSecrets(servers: Record<string, CursorSdkWorkerMcpServer> | undefined): void {
    if (!servers) return;
    for (const server of Object.values(servers)) {
      if ("env" in server && server.env) {
        for (const [name, value] of Object.entries(server.env)) {
          if (isCredentialName(name)) {
            this.rememberSecret(value);
          } else if (isCredentialContainerName(name)) {
            for (const credential of embeddedCredentials(value)) {
              this.rememberSecret(credential);
            }
          }
        }
      }
      if ("args" in server && server.args) {
        for (const credential of argumentCredentials(server.args)) {
          this.rememberSecret(credential);
        }
      }
      if ("url" in server) {
        for (const credential of embeddedCredentials(server.url)) {
          this.rememberSecret(credential);
        }
      }
      if ("headers" in server && server.headers) {
        for (const [name, value] of Object.entries(server.headers)) {
          if (!isCredentialName(name)) continue;
          this.rememberSecret(value);
          this.rememberSecret(authorizationCredential(value));
        }
      }
      if ("auth" in server) this.rememberSecret(server.auth?.CLIENT_SECRET);
    }
  }

  serializeError(error: unknown): CursorSdkWorkerError {
    const record = asWorkerRecord(error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    const classified = classifyCursorSdkRuntimeError(error);
    if (classified) {
      return {
        name: error instanceof Error ? error.name : "CursorSdkWorkerError",
        message: classified.message,
        code: classified.code,
      };
    }
    const message = this.redact(rawMessage);
    const name =
      error instanceof Error
        ? error.name
        : typeof record?.name === "string"
          ? record.name
          : "Error";
    const code =
      typeof record?.code === "string"
        ? this.redact(record.code)
        : typeof record?.status === "number"
          ? String(record.status)
          : undefined;
    return {
      name,
      message,
      ...(code ? { code } : {}),
    };
  }

  sanitizeRunResult(result: CursorSdkRunResult): CursorSdkRunResult {
    const sanitized = this.sanitizePayload(result);
    const error = result.error;
    if (!error) return sanitized;

    const classifiable = new Error(error.message);
    if (error.code !== undefined) {
      Object.assign(classifiable, { code: error.code });
    }
    const classified = classifyCursorSdkRuntimeError(classifiable);
    const message = classified?.message ?? this.redact(error.message);
    const code =
      classified?.code ?? (error.code === undefined ? undefined : this.redact(error.code));

    return {
      ...sanitized,
      error: {
        message,
        ...(code !== undefined ? { code } : {}),
      },
    };
  }

  sanitizePayload<T>(value: T): T {
    // The overwhelmingly common case on the streaming path: nothing to redact,
    // so the payload does not need a deep clone at all.
    if (this.orderedSecrets.length === 0) return value;
    const seen = new WeakMap<object, unknown>();
    const visit = (candidate: unknown): unknown => {
      if (typeof candidate === "string") return this.redact(candidate);
      if (!candidate || typeof candidate !== "object") return candidate;
      const existing = seen.get(candidate);
      if (existing !== undefined) return existing;

      if (Array.isArray(candidate)) {
        const output: unknown[] = [];
        seen.set(candidate, output);
        for (const item of candidate) output.push(visit(item));
        return output;
      }

      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) return candidate;
      const output: Record<string, unknown> = {};
      seen.set(candidate, output);
      for (const [key, item] of Object.entries(candidate)) output[key] = visit(item);
      return output;
    };
    return visit(value) as T;
  }

  private redact(message: string): string {
    let redacted = message;
    for (const secret of this.orderedSecrets) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
    return redacted;
  }
}

function isCredentialName(name: string): boolean {
  return /(?:^|_)(?:access_?key|api_?key|auth(?:entication|orization)?|bearer|cookie|credential|password|passwd|pat|private(?:_?key)?|pwd|secret|session|token)(?:$|_)/u.test(
    normalizeCredentialName(name),
  );
}

function isCredentialContainerName(name: string): boolean {
  return /(?:^|_)(?:connection_string|dsn|uri|url)(?:$|_)/u.test(normalizeCredentialName(name));
}

function normalizeCredentialName(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/gu, "$1_$2")
    .replace(/[^A-Za-z\d]+/gu, "_")
    .toLowerCase();
}

function authorizationCredential(value: string): string | undefined {
  return /^(?:basic|bearer)\s+(.+)$/iu.exec(value.trim())?.[1];
}

function argumentCredentials(args: readonly string[]): string[] {
  const credentials = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    const assignment = /^(--?[^=\s]+)=(.*)$/u.exec(argument);
    if (assignment) {
      rememberArgumentCredential(credentials, assignment[1]!, assignment[2]!);
      continue;
    }
    if (!/^--?[A-Za-z]/u.test(argument)) continue;
    const value = args[index + 1];
    if (value === undefined || /^--?[A-Za-z]/u.test(value)) continue;
    rememberArgumentCredential(credentials, argument, value);
  }
  return [...credentials];
}

function rememberArgumentCredential(
  credentials: Set<string>,
  rawName: string,
  value: string,
): void {
  const name = rawName.replace(/^-+/u, "");
  if (name === "H" || normalizeCredentialName(name) === "header") {
    rememberHeaderCredential(credentials, value);
  } else if (isCredentialName(name)) {
    rememberCredentialVariants(credentials, value);
    const authorization = authorizationCredential(value);
    if (authorization) rememberCredentialVariants(credentials, authorization);
  } else if (isCredentialContainerName(name)) {
    for (const credential of embeddedCredentials(value)) credentials.add(credential);
  }
}

function rememberHeaderCredential(credentials: Set<string>, value: string): void {
  const separator = value.indexOf(":");
  if (separator < 0 || !isCredentialName(value.slice(0, separator))) return;
  const headerValue = value.slice(separator + 1).trim();
  rememberCredentialVariants(credentials, headerValue);
  const authorization = authorizationCredential(headerValue);
  if (authorization) rememberCredentialVariants(credentials, authorization);
}

function embeddedCredentials(value: string): string[] {
  const credentials = new Set<string>();
  try {
    const parsed = new URL(value.startsWith("jdbc:") ? value.slice("jdbc:".length) : value);
    rememberCredentialVariants(credentials, parsed.username);
    rememberCredentialVariants(credentials, parsed.password);
    for (const [name, item] of parsed.searchParams) {
      if (isCredentialName(name)) rememberCredentialVariants(credentials, item);
    }
  } catch {
    for (const match of value.matchAll(/(?:^|[?;&\s])([A-Za-z][A-Za-z\d_.-]*)=([^?;&\s]+)/gu)) {
      if (isCredentialName(match[1]!)) rememberCredentialVariants(credentials, match[2]!);
    }
  }
  return [...credentials];
}

function rememberCredentialVariants(credentials: Set<string>, value: string): void {
  if (!value) return;
  credentials.add(value);
  try {
    const decoded = decodeURIComponent(value);
    credentials.add(decoded);
    credentials.add(encodeURIComponent(decoded));
  } catch {
    // The original value remains protected when percent-decoding is invalid.
  }
}

export function asWorkerRecord(value: unknown): Record<string, unknown> | undefined {
  return value && (typeof value === "object" || typeof value === "function")
    ? (value as Record<string, unknown>)
    : undefined;
}
