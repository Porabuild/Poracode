/**
 * Neutral provider seam for one opened ACP session.
 *
 * `AcpStructuredSessionOptions.configureOpenedSession` is a provider-declared
 * hook that runs exactly once per successful open — after the `session/new`,
 * `session/load`, or `session/resume` result's session id is adopted and the
 * agent's native config options and current mode are retained, and before the
 * standard launch config application or any prompt. The provider parses its
 * own opaque open-response metadata and may drive live config writes through
 * the same validated, echo-confirmed control the shared session uses.
 *
 * Fencing: the context handed to the hook is bound to one session incarnation
 * (native session id + reopen generation) and to the hook's own active phase.
 * Ownership is asserted before and after the hook and around every
 * reader/writer callback, and the context is closed for good when the hook
 * ends — so a callback retained past the hook fails with a typed stale error
 * even while the same incarnation is still alive, and after a reopen that
 * reuses the same native id, a dispose, or a transport close it can never
 * touch the newer session.
 *
 * Fail closed: every failure — an undetachable or out-of-bounds open
 * response, a stale incarnation before or after the hook, a writer error, or
 * a hook exception — rejects the hook run, and the caller must reject the
 * whole open operation. The open never falls back to the default config path,
 * which could apply the launch config or prompt on the wrong
 * repo/platform/persona. The exact allocated native session ref stays adopted
 * on the session, so the supervisor's unpublished-start custody still sees it
 * through `getSessionRef`. Hook activity never synthesizes a prompt or turn.
 */

import { toErrorMessage } from "@/shared/errorMessage";
import { assertBoundedJson } from "@/shared/jsonBounds";
import type { AcpSessionConfigOptionWriteValue } from "../base/types";
import type { AcpSessionConfigOwner } from "./sessionConfigControl";

/** Upper bound for the detached raw open-response handed to the hook (bytes / nesting depth via the shared JSON bounds). */
export const OPENED_SESSION_OPEN_RESPONSE_MAX_BYTES = 512 * 1024;

/** Which open call produced the session now being configured. */
export type AcpOpenedSessionKind = "new" | "load" | "resume";

/** Fenced live-config surface of the opened session, bound to one incarnation. */
export interface AcpConfigureOpenedSessionContext {
  /** Which open call produced the session. */
  readonly kind: AcpOpenedSessionKind;
  /** The exact native session id adopted for this incarnation. */
  readonly sessionId: string;
  /**
   * Detached, bounded snapshot of the raw open response. The provider owns
   * any opaque metadata parsing; mutating the snapshot never reaches session
   * state, and later session changes never reach an already-returned one.
   */
  readonly openResponse: unknown;
  /** Detached snapshot of the retained (normalized) current options. */
  readCurrentConfigOptions(): readonly unknown[];
  /**
   * Validated write to one advertised config option through the shared live
   * control: single config writer, owner/generation/dispose/transport fences,
   * echo confirmation. Resolves only after the session's own echoed state
   * carries the value. Never emits a prompt or turn.
   */
  setConfigOption(
    configId: string,
    value: AcpSessionConfigOptionWriteValue,
    callOptions?: { signal?: AbortSignal },
  ): Promise<void>;
}

/**
 * Provider-declared setup for one opened ACP session. See
 * `AcpStructuredSessionOptions.configureOpenedSession`.
 */
export type AcpConfigureOpenedSession = (
  context: AcpConfigureOpenedSessionContext,
) => void | Promise<void>;

/**
 * Outcome of one open-hook run. `ran` — the hook completed and the session
 * incarnation still owns the session. `skipped` — the session declares no
 * hook (default parity path). Every failure rejects instead of being
 * reported through an outcome.
 */
export type AcpOpenedSessionSetupOutcome = "ran" | "skipped";

/**
 * Typed fence failure: the incarnation this context was bound to is gone
 * (superseded by a reopen, disposed, or transport-closed), or the hook's
 * active phase has ended so the context can no longer be used at all.
 */
export class AcpOpenedSessionSetupStaleError extends Error {
  constructor() {
    super("The opened-session setup context is no longer active.");
    this.name = "AcpOpenedSessionSetupStaleError";
  }
}

export interface AcpOpenedSessionSetupInput {
  kind: AcpOpenedSessionKind;
  sessionId: string;
  openResponse: unknown;
  /** The declared hook, or undefined when the session declares none. */
  hook: AcpConfigureOpenedSession | undefined;
  /** Live owner probe for the fencing assertions. */
  getOwner: () => AcpSessionConfigOwner | undefined;
  /** Detached current-options reader (the shared live control's snapshot). */
  readConfigOptions: () => readonly unknown[];
  /** Validated option writer (the shared live control's setter). */
  writeConfigOption: (
    configId: string,
    value: AcpSessionConfigOptionWriteValue,
    callOptions?: { signal?: AbortSignal },
  ) => Promise<void>;
}

function assertSameIncarnation(
  getOwner: () => AcpSessionConfigOwner | undefined,
  owner: AcpSessionConfigOwner,
): void {
  const current = getOwner();
  if (
    !current ||
    current.sessionId !== owner.sessionId ||
    current.generation !== owner.generation ||
    current.disposed ||
    current.transportClosed
  ) {
    throw new AcpOpenedSessionSetupStaleError();
  }
}

function detachBoundedOpenResponse(openResponse: unknown): unknown {
  let snapshot: unknown;
  try {
    snapshot = structuredClone(openResponse);
  } catch (error) {
    throw new Error(
      `The opened-session hook could not detach the open response: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
  try {
    assertBoundedJson(snapshot, OPENED_SESSION_OPEN_RESPONSE_MAX_BYTES);
  } catch (error) {
    throw new Error(
      `The opened-session hook's open-response snapshot exceeds JSON bounds: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
  return snapshot;
}

/**
 * Run the provider's `configureOpenedSession` hook for one opened session.
 * Fails closed: every failure rejects — a hook throw, an undetachable or
 * out-of-bounds open response, or a stale incarnation before or after the
 * hook — so the caller rejects the whole open operation. The exact allocated
 * native session ref stays adopted on the session for the supervisor's
 * unpublished-start custody; nothing here rolls it back.
 */
export async function runAcpOpenedSessionSetup(
  input: AcpOpenedSessionSetupInput,
): Promise<AcpOpenedSessionSetupOutcome> {
  const { hook, kind, sessionId, openResponse, getOwner, readConfigOptions, writeConfigOption } =
    input;
  if (!hook) return "skipped";
  if (!sessionId) {
    throw new Error("The opened-session hook requires a native session id.");
  }
  const live = getOwner();
  if (!live || live.sessionId !== sessionId || live.disposed || live.transportClosed) {
    throw new AcpOpenedSessionSetupStaleError();
  }
  const owner: AcpSessionConfigOwner = { ...live };
  const snapshot = detachBoundedOpenResponse(openResponse);
  // Active-phase guard: the context is usable only while the hook runs. Once
  // this runner returns or throws, a retained context is dead even if the
  // same incarnation is still alive — later writes must never race the
  // session's own config path.
  let closed = false;
  const assertUsable = (): void => {
    if (closed) throw new AcpOpenedSessionSetupStaleError();
    assertSameIncarnation(getOwner, owner);
  };
  const context: AcpConfigureOpenedSessionContext = {
    kind,
    sessionId,
    openResponse: snapshot,
    readCurrentConfigOptions: () => {
      assertUsable();
      const options = readConfigOptions();
      assertSameIncarnation(getOwner, owner);
      return options;
    },
    setConfigOption: async (configId, value, callOptions) => {
      assertUsable();
      await writeConfigOption(configId, value, callOptions);
      assertSameIncarnation(getOwner, owner);
    },
  };
  try {
    await hook(context);
    // The hook's outcome only stands if this incarnation still owns the
    // session when the hook completes.
    assertSameIncarnation(getOwner, owner);
  } finally {
    closed = true;
  }
  return "ran";
}
