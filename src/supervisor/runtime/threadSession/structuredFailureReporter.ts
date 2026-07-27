import { ExpectedStructuredRuntimeError } from "../../agents/base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import type { SessionRuntime } from "../sessionTypes";

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

/**
 * Reports a non-expected structured runtime failure once per concrete session
 * instance.
 *
 * The captured exception is deliberately synthetic: provider errors can carry
 * prompts, command output, paths, or credentials. The user-facing failure is
 * still surfaced separately by ThreadSessionManager, including expected
 * provider outcomes that are deliberately not captured. Telemetry receives
 * only a stable domain error and structural tags.
 */
export class StructuredFailureReporter {
  private readonly reported = new WeakSet<SessionRuntime>();

  capture(session: SessionRuntime, error: unknown): void {
    if (isExpectedStructuredFailure(error)) return;
    if (this.reported.has(session)) return;
    this.reported.add(session);
    captureSupervisorException(new Error("Structured runtime session failed."), {
      "poracode.feature_area": "thread-session-lifecycle",
      "poracode.presentation": session.presentationMode ?? "terminal",
      "poracode.provider": session.agentKind,
      "poracode.runtime_kind": "structured",
    });
  }
}
