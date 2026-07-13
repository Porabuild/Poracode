export const PORACODE_DIAGNOSTIC_TAG_KEYS = [
  "poracode.app_version",
  "poracode.arch",
  "poracode.channel",
  "poracode.chrome",
  "poracode.electron",
  "poracode.feature_area",
  "poracode.node",
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
  breadcrumbs?: unknown[];
  contexts?: Record<string, unknown>;
  exception?: {
    values?: Array<{
      mechanism?: Record<string, unknown>;
      stacktrace?: { frames?: Array<Record<string, unknown>> };
      value?: string;
    }>;
  };
  extra?: Record<string, unknown>;
  message?: string;
  modules?: Record<string, unknown>;
  request?: Record<string, unknown>;
  server_name?: string;
  tags?: Record<string, unknown>;
  transaction?: string;
  user?: Record<string, unknown>;
};

const ALLOWED_TAG_KEYS = new Set<string>(PORACODE_DIAGNOSTIC_TAG_KEYS);
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
    .replace(/(?:file:\/\/)?\/(?:Users|home|private|tmp|var)\/[^\s"'<>)]*/g, "[path]")
    .replace(/[A-Za-z]:\\[^\s"'<>)]*/g, "[path]")
    .replace(/(token|secret|password|api[-_]?key|authorization)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function sanitizeFramePath(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const sanitized = sanitizeString(value);
  const pathMatch = sanitized.match(/\[path\][\\/]+([^\\/]+)$/);
  return pathMatch?.[1] ? `[app-file]/${pathMatch[1]}` : sanitized;
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
      output[key] = sanitizeString(value);
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
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
      const next = sanitizeRecord(entry as Record<string, unknown>, { allowSensitiveKeys: true });
      if (entry.value) {
        next.value = sanitizeString(entry.value);
      }
      if (entry.mechanism) {
        next.mechanism = sanitizeRecord(entry.mechanism);
      }
      const frames = entry.stacktrace?.frames;
      if (frames) {
        next.stacktrace = {
          frames: frames.map((frame) => {
            const sanitizedFrame = sanitizeRecord(frame, { allowSensitiveKeys: true });
            sanitizedFrame.filename = sanitizeFramePath(frame.filename);
            sanitizedFrame.abs_path = sanitizeFramePath(frame.abs_path);
            delete sanitizedFrame.vars;
            delete sanitizedFrame.context_line;
            delete sanitizedFrame.pre_context;
            delete sanitizedFrame.post_context;
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
  delete sanitized.breadcrumbs;
  delete sanitized.extra;
  delete sanitized.modules;
  delete sanitized.request;
  delete sanitized.server_name;
  delete sanitized.user;

  if (event.message) sanitized.message = sanitizeString(event.message);
  if (event.transaction) sanitized.transaction = sanitizeString(event.transaction);

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
