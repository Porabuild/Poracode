import { ExpectedStructuredRuntimeError } from "../../agents/base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import type { SessionRuntime } from "../sessionTypes";
import {
  StructuredRuntimeDiagnosticError,
  structuredRuntimeFeatureArea,
  type StructuredRuntimeFailureClass,
} from "./structuredRuntimeDiagnosticError";

const EXPECTED_PROVIDER_OUTCOME =
  /\b(?:(?:you(?:['’]ve| have) )(?:reached|hit) your (?:usage|quota) limit|(?:quota|usage|billing)(?:[_ -](?:quota|limit))?[_ -](?:is[_ -])?(?:exhausted|exceeded|reached)|(?:quota|usage|billing)[_ -]credits?[_ -](?:are[_ -])?(?:exhausted|exceeded)|insufficient_quota|auth_required|device authentication failed|user must authenticate)\b/i;

function isExpectedStructuredFailure(error: unknown): boolean {
  let current = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 5 && current !== undefined && !visited.has(current); depth += 1) {
    visited.add(current);
    if (current instanceof ExpectedStructuredRuntimeError) return true;
    const message =
      current instanceof Error ? current.message : typeof current === "string" ? current : "";
    if (EXPECTED_PROVIDER_OUTCOME.test(message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function failureClassFor(error: unknown): StructuredRuntimeFailureClass {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /^(?:ACP connection closed unexpectedly\.|ACP agent exited unexpectedly \(code -?\d+\)\.)$/u.test(
    message,
  )
    ? "transport"
    : "turn";
}

/**
 * Reports a non-expected structured runtime failure once per active failure
 * episode.
 *
 * The captured exception is deliberately synthetic: provider errors can carry
 * prompts, command output, paths, or credentials. The user-facing failure is
 * still surfaced separately by ThreadSessionManager, including expected
 * provider outcomes that are deliberately not captured. Telemetry receives
 * only a stable domain error and structural tags.
 */
export class StructuredFailureReporter {
  private readonly reported = new WeakSet<SessionRuntime>();

  /**
   * Opens a new user-visible failure episode. A single turn can surface through
   * both a rejection and a derivative close callback, but a later turn on the
   * same provider session must remain independently observable.
   */
  beginEpisode(session: SessionRuntime): void {
    this.reported.delete(session);
  }

  capture(session: SessionRuntime, error: unknown): void {
    if (isExpectedStructuredFailure(error)) return;
    if (this.reported.has(session)) return;
    this.reported.add(session);
    const failureClass = failureClassFor(error);
    captureSupervisorException(
      new StructuredRuntimeDiagnosticError(failureClass, session.agentKind),
      {
        "poracode.feature_area": structuredRuntimeFeatureArea(failureClass),
        "poracode.presentation": session.presentationMode ?? "terminal",
        "poracode.provider": session.agentKind,
        "poracode.runtime_kind": "structured",
      },
    );
  }
}
