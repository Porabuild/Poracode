import { createHash } from "node:crypto";
import type { SessionRef } from "@/shared/contracts";
import type { DevinExecutionContext } from "./profileContext";

/**
 * Immutable resume-scope identity for Devin sessions (root seam
 * `SessionRef.executionIdentity`).
 *
 * A persisted session ref must never silently attach to a different account
 * view: the identity hashes ONLY the dimensions that define which login,
 * organization and runtime a session belongs to — the account source, the
 * resolved account data root, the EFFECTIVE org selection, the VALIDATED
 * stable account user id, and the local/cloud runtime target. Deliberately
 * excluded: binary identity, model/effort/thought and rules/config content
 * (mutable per launch — a CLI update or a settings edit must not orphan
 * existing sessions), and any credential material.
 *
 * The credential token is NEVER an identity input: it is long-lived but
 * rotatable, and hashing it would invalidate resumable sessions after a
 * same-account re-login. Instead the binding carries the stable account user
 * id proved over the authenticated native metadata endpoint
 * (`accountIdentity.ts`): a token rotation for the SAME account keeps the
 * binding (resume preserved), while a different login at the SAME account
 * root changes it — the case root-only dimensions cannot detect.
 *
 * The value is opaque and secret-free: it is a digest that names no tokens,
 * no raw user ids and no environment values. The native default adapter and
 * every profile stamp and validate the binding before spawn or reattach.
 * Historical unbound refs cannot establish account ownership and are refused.
 *
 * Prefix version: `-3` binds the EFFECTIVE org selection — `devin.org_id`
 * from the config the session actually resolves (explicit `--config` file,
 * seeded view, or inherited native config), not merely the profile setting —
 * so an org change at the same user/root/path is a visible mismatch.
 * `-2` bindings (stamped only by the unshipped P4 draft, never released)
 * hashed the settings org dimension; they are intentionally invalidated as
 * visible scope mismatches rather than migrated. `-1` was the unshipped P3
 * draft (user-id dimension) and is invalidated the same way.
 * WSL uses `-4`, adding the distribution namespace to those same dimensions.
 * Prior WSL `-3` refs cannot identify a distro and are refused; native `-3`
 * bindings retain their exact existing meaning and bytes.
 */

const SCOPE_IDENTITY_PREFIX = "devin-session-scope-3:";

export type DevinSessionScopeContext = Pick<
  DevinExecutionContext,
  "account" | "orgId" | "runtimeTarget" | "location"
> & {
  roots: Pick<DevinExecutionContext["roots"], "dataRoot">;
  /** Validated stable account user id (proved over authenticated native metadata). */
  accountUserId?: string | undefined;
};

/** Opaque scope identity for one proved execution context. */
export function devinSessionScopeIdentity(context: DevinSessionScopeContext): string {
  // \0 separators: components are paths and ids where a "|" could collide.
  const dimensions = [
    context.account.kind,
    context.account.kind === "default" ? "-" : context.account.ownerId,
    context.roots.dataRoot,
    context.orgId ?? "-",
    context.accountUserId ?? "-",
    context.runtimeTarget,
  ];
  // WSL roots can be identical templates in different distributions. Their
  // filesystem namespaces are distinct even when the login/user is the same.
  const wsl = context.location.kind === "wsl";
  if (wsl) dimensions.push("wsl", context.location.distro);
  const prefix = wsl ? "devin-session-scope-4:" : SCOPE_IDENTITY_PREFIX;
  return prefix + createHash("sha256").update(dimensions.join("\u0000")).digest("hex").slice(0, 32);
}

/**
 * Stamp a freshly created/observed ref with the adapter's scope identity so
 * the binding is captured the moment the session exists (listener updates and
 * the shared getter both flow through this).
 */
export function withDevinScopeIdentity(ref: SessionRef, identity: string): SessionRef {
  return { ...ref, executionIdentity: identity };
}

export type DevinResumeScopeCheck =
  | { ok: true }
  | {
      ok: false;
      /** Stable failure code preserved on the surfaced error. */
      code: "resume-scope-missing" | "resume-scope-mismatch";
      detail: string;
    };

/**
 * Validate a thread's incoming session ref against the resolving adapter
 * BEFORE any spawn or reattach. Every adapter refuses missing bindings and
 * mismatches (a different account/org/user/runtime). Never derive ownership
 * of a historical unbound ref from whoever happens to be signed in now.
 */
export function checkDevinResumeScope(
  expected: string | undefined,
  sessionRef: SessionRef | undefined,
): DevinResumeScopeCheck {
  if (sessionRef === undefined) return { ok: true };
  const bound = sessionRef.executionIdentity;
  if (expected === undefined) {
    return {
      ok: false,
      code: "resume-scope-missing",
      detail:
        "The current Devin account scope could not be proved, so this session cannot be reattached.",
    };
  }
  if (bound === undefined) {
    return {
      ok: false,
      code: "resume-scope-missing",
      detail:
        "The thread's session reference carries no Devin account-scope binding, so it cannot be proven to belong to the current account.",
    };
  }
  if (bound !== expected) {
    return {
      ok: false,
      code: "resume-scope-mismatch",
      detail:
        "The thread's session was created under a different Devin account scope (login source, account root, organization, account user or local/cloud runtime).",
    };
  }
  return { ok: true };
}
