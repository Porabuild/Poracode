export type StructuredRuntimeFailureClass = "session-creation" | "transport" | "turn";

const STRUCTURED_RUNTIME_FAILURE_MESSAGES: Record<StructuredRuntimeFailureClass, string> = {
  "session-creation": "Structured runtime session creation failed.",
  transport: "Structured runtime transport failed.",
  turn: "Structured runtime turn failed.",
};

/**
 * Privacy-safe structured-runtime failure identity.
 *
 * Provider errors can contain prompts, command output, paths, and credentials,
 * so telemetry receives only this stable class and message. The raw failure is
 * still logged locally and shown to the user by the owning runtime boundary.
 */
export class StructuredRuntimeDiagnosticError extends Error {
  override readonly name = "StructuredRuntimeDiagnosticError";
  readonly failureClass: StructuredRuntimeFailureClass;
  readonly diagnosticProvider: string | undefined;

  constructor(failureClass: StructuredRuntimeFailureClass, diagnosticProvider?: string) {
    super(STRUCTURED_RUNTIME_FAILURE_MESSAGES[failureClass]);
    this.failureClass = failureClass;
    this.diagnosticProvider = diagnosticProvider;
  }
}

export function structuredRuntimeFeatureArea(failureClass: StructuredRuntimeFailureClass): string {
  return `structured-runtime-${failureClass}`;
}
