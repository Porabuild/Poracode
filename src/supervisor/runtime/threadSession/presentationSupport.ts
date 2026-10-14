import type { ThreadPresentationMode } from "@/shared/contracts";
import type { AgentAdapter } from "../../agents/base";

export const UNSUPPORTED_THREAD_PRESENTATION_CODE = "unsupported_thread_presentation" as const;

/**
 * Explicit refusal for a client-requested presentation the adapter never
 * declared. The supervisor is the source of truth for a thread's active
 * presentation; silently switching (or co-producing a PTY plus a structured
 * process) is not allowed, so callers must pick a declared mode.
 */
export class UnsupportedThreadPresentationError extends Error {
  readonly code = UNSUPPORTED_THREAD_PRESENTATION_CODE;

  constructor(
    readonly agentKind: string,
    readonly requested: ThreadPresentationMode,
    readonly supported: readonly ThreadPresentationMode[],
  ) {
    super(
      `Agent ${agentKind} does not support ${requested} presentation (declared: ${
        supported.join(", ") || "none"
      }).`,
    );
    this.name = "UnsupportedThreadPresentationError";
  }
}

export function isUnsupportedThreadPresentationError(
  error: unknown,
): error is UnsupportedThreadPresentationError {
  return (
    error instanceof UnsupportedThreadPresentationError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === UNSUPPORTED_THREAD_PRESENTATION_CODE)
  );
}

/** Declared presentation modes for one adapter; the default mode is the fallback. */
export function declaredPresentationModes(
  adapter: Pick<AgentAdapter, "capabilities">,
): readonly ThreadPresentationMode[] {
  return adapter.capabilities.presentationModes ?? [adapter.capabilities.presentationMode];
}

export function supportsDeclaredPresentation(
  adapter: Pick<AgentAdapter, "capabilities">,
  mode: ThreadPresentationMode,
): boolean {
  return declaredPresentationModes(adapter).includes(mode);
}

/**
 * Refuse an explicitly requested presentation before any queue mutation,
 * teardown or process effect. An absent request is left to the adapter's
 * declared default (intentional no-mode compatibility).
 */
export function assertAdapterSupportsPresentation(
  adapter: (Pick<AgentAdapter, "capabilities"> & Pick<AgentAdapter, "kind">) | undefined,
  requested: ThreadPresentationMode | undefined,
): void {
  if (!requested || !adapter) return;
  if (!supportsDeclaredPresentation(adapter, requested)) {
    throw new UnsupportedThreadPresentationError(
      adapter.kind,
      requested,
      declaredPresentationModes(adapter),
    );
  }
}
