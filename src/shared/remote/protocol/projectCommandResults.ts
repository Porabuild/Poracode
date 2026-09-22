import { REMOTE_PROJECT_COMMAND_RESULTS_VERSION } from "./core";

export { REMOTE_PROJECT_COMMAND_RESULTS_VERSION };

/**
 * Per-request declaration value for the bounded project-command result mode.
 * The existing `POST /api/projects/command` route carries
 * {@link REMOTE_PROJECT_COMMAND_RESULT_HEADER} with exactly this value; only
 * the exact value counts (fail closed). An undeclared request keeps the
 * complete legacy `{projects, project?}` result.
 */
export const REMOTE_PROJECT_COMMAND_RESULT_DECLARATION = "bounded-v1" as const;

/**
 * Request header carrying {@link REMOTE_PROJECT_COMMAND_RESULT_DECLARATION} on
 * the existing project-command route. A separate negotiation from the
 * catalog-mutation *kinds*: the kinds decide whether a mutation may be sent at
 * all, this declaration decides only the response shape.
 */
export const REMOTE_PROJECT_COMMAND_RESULT_HEADER = "x-poracode-project-command-result" as const;

/**
 * True only when a host advertised `capabilities.projectCommandResults`
 * version 1. A client uses this as the single pre-flight gate before declaring
 * the bounded result mode: an old host ignores the unknown header and answers
 * the complete legacy result, so a client that needs the bounded guarantee
 * must treat the absent capability as "do not declare" (and never claim the
 * bounded guarantee from a response it cannot distinguish).
 */
export function hostSupportsProjectCommandResults(
  capability: { readonly versions: readonly number[] } | undefined,
): boolean {
  return capability?.versions.includes(REMOTE_PROJECT_COMMAND_RESULTS_VERSION) === true;
}
