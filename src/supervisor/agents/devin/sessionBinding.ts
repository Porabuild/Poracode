import { attachErrorDetails, msg } from "@/shared/messages";
import type { SessionRef } from "@/shared/contracts";
import type { StructuredSessionHandle, StructuredSessionListener } from "../base/types";
import type { DevinAccountIdentityError } from "./accountIdentity";
import { checkDevinResumeScope, withDevinScopeIdentity } from "./sessionScope";

/**
 * Resume-scope binding plumbing shared by every Devin adapter lane: the typed
 * profile-unavailable failure, the resume-scope guard, and the structured
 * session ref stamping. Extracted from `index.ts` so the adapter composition
 * stays readable (God-file rule) — every export here is Devin-owned leaf code.
 */

/**
 * A profile's account view could not be resolved or verified; launches and
 * resumes fail visibly instead of continuing under a different account.
 */
export class DevinProfileUnavailableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DevinProfileUnavailableError";
    this.code = code;
  }
}

/**
 * A refused resume binding surfaces through the localized profile-unavailable
 * summary with the cause kept in the disclosed details block and the stable
 * code preserved on the error — the thread fails visibly instead of
 * reattaching under a different account.
 */
export function devinResumeScopeError(
  code: "resume-scope-missing" | "resume-scope-mismatch",
  detail: string,
): DevinProfileUnavailableError {
  return new DevinProfileUnavailableError(
    code,
    attachErrorDetails(msg("profile.executionUnavailable"), `${detail} (code: ${code})`),
  );
}

/** Wrap a context-resolution failure as the localized profile-unavailable error. */
export function profileUnavailable(code: string, message: string): DevinProfileUnavailableError {
  return new DevinProfileUnavailableError(
    code,
    attachErrorDetails(msg("profile.executionUnavailable"), message),
  );
}

/**
 * Convert a failed account-identity proof into the localized
 * profile-unavailable failure. The typed identity error never carries the
 * token, endpoint or account PII; its message becomes the disclosed details.
 */
export function identityUnavailable(
  error: DevinAccountIdentityError,
): DevinProfileUnavailableError {
  return new DevinProfileUnavailableError(
    `account-identity-${error.code}`,
    attachErrorDetails(msg("profile.executionUnavailable"), error.message),
  );
}

/** Validate a ref against the adapter's proven scope identity BEFORE any spawn. */
export function assertDevinResumeScope(
  identity: string | undefined,
  sessionRef: SessionRef | undefined,
): void {
  const check = checkDevinResumeScope(identity, sessionRef);
  if (!check.ok) throw devinResumeScopeError(check.code, check.detail);
}

/**
 * Stamp the immutable scope identity onto every ref a structured session
 * reports: the shared getter (spawn pipeline + subattempt runner) and every
 * listener update (the persisted ref path). Binding is captured the moment
 * the session exists — a ref is never persisted unbound from a profile.
 */
export function stampDevinStructuredSessionRefs(
  session: StructuredSessionHandle,
  identity: string,
): void {
  const innerGetSessionRef = session.getSessionRef?.bind(session);
  if (innerGetSessionRef) {
    session.getSessionRef = () => {
      const ref = innerGetSessionRef();
      return ref ? withDevinScopeIdentity(ref, identity) : undefined;
    };
  }
  const innerSetListener = session.setListener?.bind(session);
  if (!innerSetListener) return;
  session.setListener = (listener: StructuredSessionListener) => {
    const innerOnUpdate = listener.onUpdate?.bind(listener);
    innerSetListener({
      ...listener,
      ...(innerOnUpdate
        ? {
            onUpdate: (update) =>
              innerOnUpdate(
                update.sessionRef
                  ? {
                      ...update,
                      sessionRef: withDevinScopeIdentity(update.sessionRef, identity),
                    }
                  : update,
              ),
          }
        : {}),
    });
  };
}

/**
 * The terminal (PTY) lanes cannot honor a profile's `--agent-type` root
 * persona: the CLI accepts it only on `acp` (GUI/structured sessions), and
 * silently ignoring it would run a review/summarizer profile as the default
 * agent. Fail visibly instead.
 */
export function assertAgentTypeNotTerminal(agentType: string | undefined): void {
  if (agentType === undefined) return;
  throw new DevinProfileUnavailableError(
    "agent-type-terminal-unsupported",
    attachErrorDetails(
      msg("profile.executionUnavailable"),
      `This profile declares the root agent type "${agentType}", which the Devin CLI supports only for structured (GUI) ACP sessions. Run this profile in Chat, or remove the agent type to use it in Terminal. (code: agent-type-terminal-unsupported)`,
    ),
  );
}

/**
 * Cloud one-shot utilities are declared unsupported: `devin -p` under
 * `--cloud` is not a qualified cloud-safe utility path, and a plain local
 * spawn would silently run a cloud-profile utility against the DEFAULT local
 * account (wrong credentials, wrong usage attribution, and a persistent
 * session allocation the product does not own).
 */
export function assertCloudOneShotSupported(runtimeTarget: string | undefined): void {
  if (runtimeTarget !== "cloud") return;
  throw new DevinProfileUnavailableError(
    "cloud-oneshot-unsupported",
    attachErrorDetails(
      msg("profile.executionUnavailable"),
      "Utility one-shot generation is not supported for a Devin cloud profile: no qualified cloud-safe utility path exists, and running it locally would use the wrong account. Use a local-runtime profile for commit/PR/title generation. (code: cloud-oneshot-unsupported)",
    ),
  );
}
