import { captureSupervisorException } from "../../diagnostics/sentry";
import type { SessionRuntime } from "../sessionTypes";

/**
 * Reports a structured runtime failure once per concrete session instance.
 *
 * The captured exception is deliberately synthetic: provider errors can carry
 * prompts, command output, paths, or credentials. The user-facing failure is
 * still surfaced separately by ThreadSessionManager, while telemetry receives
 * only a stable domain error and structural tags.
 */
export class StructuredFailureReporter {
  private readonly reported = new WeakSet<SessionRuntime>();

  capture(session: SessionRuntime): void {
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
