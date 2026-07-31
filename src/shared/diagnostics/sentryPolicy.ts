export const DIAGNOSTIC_BREADCRUMB_CATEGORY = "poracode.diagnostic.transition";

export type DiagnosticFailureClass =
  | "expected-operational"
  | "transient-service"
  | "product-defect"
  | "unknown";

export type DiagnosticTreatment = "drop" | "metric" | "capture";
export type DiagnosticLevel = "warning" | "error";

export type DiagnosticFailureMetadata = {
  failureClass: Exclude<DiagnosticFailureClass, "unknown">;
  domain: string;
  errorClass: string;
};

export type DiagnosticFailureContext = {
  domain: string;
  operation: string;
};

export type DiagnosticFailureDecision = {
  failureClass: DiagnosticFailureClass;
  treatment: DiagnosticTreatment;
  level: DiagnosticLevel | null;
  operational: boolean;
  domain: string;
  operation: string;
  errorClass: string;
  fingerprint: string[] | null;
};

export type DiagnosticBreadcrumb = {
  category: typeof DIAGNOSTIC_BREADCRUMB_CATEGORY;
  type: "info";
  level: "info" | "warning" | "error";
  data: {
    domain: string;
    operation: string;
    state: string;
    transition: string;
  };
};

const DIAGNOSTIC_TOKEN_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const MAX_DIAGNOSTIC_TOKEN_LENGTH = 64;

const TREATMENTS: Record<
  DiagnosticFailureClass,
  { treatment: DiagnosticTreatment; level: DiagnosticLevel | null; operational: boolean }
> = {
  "expected-operational": { treatment: "drop", level: null, operational: true },
  "transient-service": { treatment: "metric", level: "warning", operational: true },
  "product-defect": { treatment: "capture", level: "error", operational: false },
  unknown: { treatment: "capture", level: "error", operational: false },
};

function stableToken(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_DIAGNOSTIC_TOKEN_LENGTH ||
    !DIAGNOSTIC_TOKEN_PATTERN.test(normalized)
  ) {
    return fallback;
  }
  return normalized;
}

function builtInErrorClass(error: unknown): string {
  if (error instanceof AggregateError) return "aggregate-error";
  if (error instanceof EvalError) return "eval-error";
  if (error instanceof RangeError) return "range-error";
  if (error instanceof ReferenceError) return "reference-error";
  if (error instanceof SyntaxError) return "syntax-error";
  if (error instanceof TypeError) return "type-error";
  if (error instanceof URIError) return "uri-error";
  if (error instanceof Error) return "error";
  return "non-error";
}

export class DiagnosticError extends Error {
  readonly diagnostic: DiagnosticFailureMetadata;

  constructor(
    message: string,
    diagnostic: DiagnosticFailureMetadata,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export function isStableDiagnosticToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_DIAGNOSTIC_TOKEN_LENGTH &&
    DIAGNOSTIC_TOKEN_PATTERN.test(value)
  );
}

export function classifyDiagnosticFailure(
  error: unknown,
  context: DiagnosticFailureContext,
  knownClassification?: DiagnosticFailureMetadata,
): DiagnosticFailureDecision {
  const metadata =
    knownClassification ?? (error instanceof DiagnosticError ? error.diagnostic : undefined);
  const failureClass = metadata?.failureClass ?? "unknown";
  const treatment = TREATMENTS[failureClass];
  const domain = stableToken(metadata?.domain ?? context.domain, "unknown");
  const operation = stableToken(context.operation, "unknown");
  const errorClass = stableToken(metadata?.errorClass ?? builtInErrorClass(error), "unknown-error");

  return {
    failureClass,
    ...treatment,
    domain,
    operation,
    errorClass,
    fingerprint: failureClass === "unknown" ? null : ["poracode", domain, operation, errorClass],
  };
}

export function buildDiagnosticBreadcrumb(
  input: Omit<DiagnosticBreadcrumb["data"], "domain" | "operation"> &
    Pick<DiagnosticFailureDecision, "domain" | "operation"> & {
      level?: DiagnosticBreadcrumb["level"];
    },
): DiagnosticBreadcrumb {
  return {
    category: DIAGNOSTIC_BREADCRUMB_CATEGORY,
    type: "info",
    level: input.level ?? "info",
    data: {
      domain: stableToken(input.domain, "unknown"),
      operation: stableToken(input.operation, "unknown"),
      state: stableToken(input.state, "unknown"),
      transition: stableToken(input.transition, "unknown"),
    },
  };
}
