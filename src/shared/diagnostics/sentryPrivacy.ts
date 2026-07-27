import { DIAGNOSTIC_BREADCRUMB_CATEGORY, isStableDiagnosticToken } from "./sentryPolicy";

export const PORACODE_DIAGNOSTIC_TAG_KEYS = [
  "poracode.app_version",
  "poracode.arch",
  "poracode.channel",
  "poracode.chrome",
  "poracode.error_class",
  "poracode.electron",
  "poracode.failure_domain",
  "poracode.feature_area",
  "poracode.node",
  "poracode.operation",
  "poracode.operational",
  "poracode.platform",
  "poracode.presentation",
  "poracode.process",
  "poracode.provider",
  "poracode.runtime_kind",
  "event.environment",
  "event.origin",
  "event.process",
] as const;

export type PoracodeDiagnosticTagKey = (typeof PORACODE_DIAGNOSTIC_TAG_KEYS)[number];

export type PoracodeDiagnosticTags = Partial<Record<PoracodeDiagnosticTagKey, string>>;

export type PoracodeRuntimeDiagnosticContext = {
  provider?: string;
  presentation?: "gui" | "terminal";
  runtimeKind?: "pty" | "structured";
  featureArea?: string;
};

export type SentryEventLike = Record<string, unknown> & {
  breadcrumbs?: Array<{
    category?: string;
    data?: Record<string, unknown>;
    level?: string;
    message?: string;
    type?: string;
  }>;
  contexts?: Record<string, unknown>;
  exception?: {
    values?: Array<{
      mechanism?: Record<string, unknown>;
      stacktrace?: { frames?: Array<Record<string, unknown>> };
      type?: string;
      value?: string;
    }>;
  };
  extra?: Record<string, unknown>;
  fingerprint?: unknown[];
  level?: string;
  message?: string;
  modules?: Record<string, unknown>;
  request?: Record<string, unknown>;
  server_name?: string;
  tags?: Record<string, unknown>;
  transaction?: string;
  user?: Record<string, unknown>;
};

const ALLOWED_TAG_KEYS = new Set<string>(PORACODE_DIAGNOSTIC_TAG_KEYS);
const STABLE_TOKEN_TAG_KEYS = new Set([
  "poracode.error_class",
  "poracode.failure_domain",
  "poracode.operation",
  "poracode.operational",
]);
const ALLOWED_CONTEXT_KEYS = new Set([
  "app",
  "browser",
  "chrome",
  "device",
  "gpu",
  "poracode",
  "node",
  "os",
  "runtime",
]);
const SENSITIVE_KEY_PATTERN =
  /(?:account|api[-_]?key|authorization|branch|cmd|code|command|cookie|cwd|diff|email|env|file|filename|home|ip|key|output|password|path|project|prompt|query|remote|repo|repository|secret|terminal|token|url|user|username|worktree)/i;

function sanitizeString(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>)]*/giu, "[url]")
    .replace(/Command failed:[^\r\n]*/gu, "Command failed: [redacted]")
    .replace(/(?:file:\/\/)?\/(?:Users|home|private|tmp|var)\/[^\s"'<>)]*/g, "[path]")
    .replace(/[A-Za-z]:\\[^\s"'<>)]*/g, "[path]")
    .replace(/(token|secret|password|api[-_]?key|authorization)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function sanitizeFramePath(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^(?:file:\/\/)?\//u.test(value) || /^[A-Za-z]:\\/u.test(value)) {
    const filename = value.split(/[\\/]/u).at(-1);
    return filename ? `[app-file]/${sanitizeString(filename)}` : "[app-file]";
  }
  return sanitizeString(value);
}

function sanitizeRecord(
  input: Record<string, unknown>,
  options: { allowSensitiveKeys?: boolean } = {},
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!options.allowSensitiveKeys && SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    const sanitized = sanitizeUnknown(value);
    if (typeof sanitized !== "undefined") {
      output[key] = sanitized;
    }
  }
  return output;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item)).filter((item) => typeof item !== "undefined");
  }
  if (value && typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>);
  }
  return undefined;
}

function sanitizeTags(
  tags: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!tags) return undefined;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!ALLOWED_TAG_KEYS.has(key)) continue;
    if (typeof value === "string" && value.trim().length > 0) {
      if (STABLE_TOKEN_TAG_KEYS.has(key) && !isStableDiagnosticToken(value)) continue;
      output[key] = sanitizeString(value);
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function sanitizeBreadcrumbs(
  breadcrumbs: SentryEventLike["breadcrumbs"],
): SentryEventLike["breadcrumbs"] | undefined {
  if (!breadcrumbs) return undefined;
  const output = breadcrumbs.flatMap((breadcrumb) => {
    if (
      breadcrumb.category !== DIAGNOSTIC_BREADCRUMB_CATEGORY ||
      breadcrumb.type !== "info" ||
      !breadcrumb.data
    ) {
      return [];
    }
    const { domain, operation, state, transition } = breadcrumb.data;
    if (
      !isStableDiagnosticToken(domain) ||
      !isStableDiagnosticToken(operation) ||
      !isStableDiagnosticToken(state) ||
      !isStableDiagnosticToken(transition)
    ) {
      return [];
    }
    return [
      {
        category: DIAGNOSTIC_BREADCRUMB_CATEGORY,
        type: "info",
        level:
          breadcrumb.level === "warning" || breadcrumb.level === "error"
            ? breadcrumb.level
            : "info",
        data: { domain, operation, state, transition },
      },
    ];
  });
  return output.length > 0 ? output : undefined;
}

function sanitizeFingerprint(fingerprint: unknown[] | undefined): string[] | undefined {
  if (!fingerprint || fingerprint.length === 0 || fingerprint.length > 6) return undefined;
  if (!fingerprint.every(isStableDiagnosticToken)) return undefined;
  return fingerprint;
}

function sanitizeContexts(
  contexts: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!contexts) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(contexts)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key) || !value || typeof value !== "object") {
      continue;
    }
    const sanitized = sanitizeRecord(value as Record<string, unknown>);
    if (Object.keys(sanitized).length > 0) {
      output[key] = sanitized;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function sanitizeException(exception: SentryEventLike["exception"]): SentryEventLike["exception"] {
  if (!exception?.values) return exception;
  return {
    values: exception.values.map((entry) => {
      const next: Record<string, unknown> = {};
      if (typeof entry.type === "string" && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/u.test(entry.type)) {
        next.type = entry.type;
      }
      if (entry.value) {
        next.value = sanitizeString(entry.value);
      }
      if (entry.mechanism) {
        const mechanism: Record<string, unknown> = {};
        if (isStableDiagnosticToken(entry.mechanism.type)) {
          mechanism.type = entry.mechanism.type;
        }
        if (typeof entry.mechanism.handled === "boolean") {
          mechanism.handled = entry.mechanism.handled;
        }
        if (typeof entry.mechanism.synthetic === "boolean") {
          mechanism.synthetic = entry.mechanism.synthetic;
        }
        if (Object.keys(mechanism).length > 0) {
          next.mechanism = mechanism;
        }
      }
      const frames = entry.stacktrace?.frames;
      if (frames) {
        next.stacktrace = {
          frames: frames.map((frame) => {
            const sanitizedFrame: Record<string, unknown> = {};
            if (
              typeof frame.function === "string" &&
              /^[A-Za-z_$<][A-Za-z0-9_$<>.[\] ]{0,159}$/u.test(frame.function)
            ) {
              sanitizedFrame.function = frame.function;
            }
            if (typeof frame.filename === "string") {
              sanitizedFrame.filename = sanitizeFramePath(frame.filename);
            }
            if (typeof frame.abs_path === "string") {
              sanitizedFrame.abs_path = sanitizeFramePath(frame.abs_path);
            }
            if (typeof frame.lineno === "number") sanitizedFrame.lineno = frame.lineno;
            if (typeof frame.colno === "number") sanitizedFrame.colno = frame.colno;
            if (typeof frame.in_app === "boolean") sanitizedFrame.in_app = frame.in_app;
            return sanitizedFrame;
          }),
        };
      }
      return next;
    }),
  };
}

export function buildRuntimeDiagnosticTags(
  context: PoracodeRuntimeDiagnosticContext,
): PoracodeDiagnosticTags {
  return {
    ...(context.provider ? { "poracode.provider": context.provider } : {}),
    ...(context.presentation ? { "poracode.presentation": context.presentation } : {}),
    ...(context.runtimeKind ? { "poracode.runtime_kind": context.runtimeKind } : {}),
    ...(context.featureArea ? { "poracode.feature_area": context.featureArea } : {}),
  };
}

export function sanitizeSentryEvent<T extends SentryEventLike>(event: T): T {
  const sanitized: SentryEventLike = { ...event };
  delete sanitized.extra;
  delete sanitized.modules;
  delete sanitized.request;
  delete sanitized.server_name;
  delete sanitized.user;

  if (event.message) sanitized.message = sanitizeString(event.message);
  if (event.transaction) sanitized.transaction = sanitizeString(event.transaction);

  const breadcrumbs = sanitizeBreadcrumbs(event.breadcrumbs);
  if (breadcrumbs) {
    sanitized.breadcrumbs = breadcrumbs;
  } else {
    delete sanitized.breadcrumbs;
  }

  const fingerprint = sanitizeFingerprint(event.fingerprint);
  if (fingerprint) {
    sanitized.fingerprint = fingerprint;
  } else {
    delete sanitized.fingerprint;
  }

  const tags = sanitizeTags(event.tags);
  if (tags) {
    sanitized.tags = tags;
  } else {
    delete sanitized.tags;
  }

  const contexts = sanitizeContexts(event.contexts);
  if (contexts) {
    sanitized.contexts = contexts;
  } else {
    delete sanitized.contexts;
  }

  const exception = sanitizeException(event.exception);
  if (exception) {
    sanitized.exception = exception;
  } else {
    delete sanitized.exception;
  }

  return sanitized as T;
}

const TERMINAL_EXPECTED_SIGNATURES = new Set([
  "Cannot resize a pty that has already exited",
  "ioctl(2) failed, ENOTTY",
]);

function isKnownExpectedEvent(event: SentryEventLike): boolean {
  const domain = event.tags?.["poracode.failure_domain"];
  const featureArea = event.tags?.["poracode.feature_area"];
  if (domain !== "supervisor.ipc" && featureArea !== "supervisor-ipc") return false;
  const operation = event.tags?.["poracode.operation"];

  const values = [
    event.message,
    ...(event.exception?.values?.map((entry) => entry.value) ?? []),
  ].filter((value): value is string => typeof value === "string");
  return values.some(
    (value) => operation === "resizeterminal" && TERMINAL_EXPECTED_SIGNATURES.has(value),
  );
}

export function prepareSentryEvent<T extends SentryEventLike>(event: T): T | null {
  if (isKnownExpectedEvent(event)) return null;
  return sanitizeSentryEvent(event);
}
