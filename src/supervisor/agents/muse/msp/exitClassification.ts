/**
 * `muse serve` exit classification (exit-classification guide). Codes are a
 * contract keyed by remedy; anything unrecognized — including signals — is
 * the crash row, which keeps a client built against a shorter list correct
 * (forward-compatibility rule). Nothing here parses stderr: capture it,
 * surface it, never branch on it.
 */

export type MuseServeExitKind =
  | "clean"
  | "unhandledError"
  | "usageError"
  | "configError"
  | "sessionLeaseUnavailable"
  | "sdkSurfaceUnavailable"
  | "crash";

export interface MuseServeExitClassification {
  kind: MuseServeExitKind;
  /** Human sentence for diagnostics; stderr carries the detail. */
  detail: string;
}

export function classifyMuseServeExit(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
): MuseServeExitClassification {
  if (signal !== null) {
    return {
      kind: "crash",
      detail: `Muse serve host killed by signal ${signal}; no session-end record exists.`,
    };
  }
  switch (exitCode) {
    case 0:
      return {
        kind: "clean",
        detail: "Muse serve host shut down cleanly; the session was durably closed.",
      };
    case 1:
      return {
        kind: "unhandledError",
        detail:
          "Muse serve host failed without a wire error; the session log is intact but has no session-end record.",
      };
    case 2:
      return {
        kind: "usageError",
        detail: "Muse serve host rejected its arguments; do not retry, fix the invocation.",
      };
    case 3:
      return {
        kind: "configError",
        detail: "Muse serve host could not load configuration or credentials; do not retry.",
      };
    case 4:
      return {
        kind: "sessionLeaseUnavailable",
        detail:
          "Muse serve host could not take the session lease (owned by another live process); same remedy as sessionInUse.",
      };
    case 5:
      return {
        kind: "sdkSurfaceUnavailable",
        detail: "This Muse build will not serve; do not retry with different arguments.",
      };
    default:
      return {
        kind: "crash",
        detail: `Muse serve host exited abnormally (code ${exitCode === null ? "<none>" : exitCode}); no session-end record exists.`,
      };
  }
}
