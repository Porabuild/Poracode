import { describe, expect, it } from "vitest";
import type { SessionRef } from "@/shared/contracts";
import {
  checkDevinResumeScope,
  devinSessionScopeIdentity,
  withDevinScopeIdentity,
  type DevinSessionScopeContext,
} from "./sessionScope";

const context = (overrides: Partial<DevinSessionScopeContext> = {}) =>
  ({
    account: { kind: "isolated", ownerId: "work" },
    roots: { dataRoot: "/roots/work/data" },
    location: { kind: "posix", path: "/project" },
    runtimeTarget: "local",
    ...overrides,
  }) as DevinSessionScopeContext;

const ref = (executionIdentity?: string): SessionRef | undefined =>
  executionIdentity === undefined
    ? { providerSessionId: "sid", discoveredAt: "2026-10-07T00:00:00Z" }
    : {
        providerSessionId: "sid",
        discoveredAt: "2026-10-07T00:00:00Z",
        executionIdentity,
      };

describe("devinSessionScopeIdentity", () => {
  it("distinguishes identical account/root/user inputs in separate WSL distros", () => {
    const input = context({
      account: { kind: "default" },
      roots: { dataRoot: "${XDG_DATA_HOME:-$HOME/.local/share}" },
      accountUserId: "same-user",
    });
    const first = devinSessionScopeIdentity({
      ...input,
      location: { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "" },
    });
    const second = devinSessionScopeIdentity({
      ...input,
      location: { kind: "wsl", distro: "Debian", linuxPath: "/project", uncPath: "" },
    });
    expect(second).not.toBe(first);
    expect(first).toMatch(/^devin-session-scope-4:[0-9a-f]{32}$/);
    expect(checkDevinResumeScope(second, ref(first))).toMatchObject({
      ok: false,
      code: "resume-scope-mismatch",
    });
  });
  it("invalidates prior WSL v3 bindings that carried no distro namespace", () => {
    const current = devinSessionScopeIdentity(
      context({ location: { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "" } }),
    );
    expect(
      checkDevinResumeScope(current, ref("devin-session-scope-3:f8bd7d98d0218116b918c18fd3ae627d")),
    ).toMatchObject({ ok: false, code: "resume-scope-mismatch" });
  });
  it("preserves the pre-upgrade native binding byte-for-byte", () => {
    expect(devinSessionScopeIdentity(context())).toBe(
      "devin-session-scope-3:f8bd7d98d0218116b918c18fd3ae627d",
    );
  });
  it("is an opaque bounded token under the v3 prefix, stable for an identical scope", () => {
    const identity = devinSessionScopeIdentity(context());
    // v3 binds the EFFECTIVE org selection (the org the session actually
    // runs under, read from the config it resolves); the unshipped v1/v2
    // draft bindings are intentionally invalidated (never migrated).
    expect(identity).toMatch(/^devin-session-scope-3:[0-9a-f]{32}$/);
    expect(identity).toBe(devinSessionScopeIdentity(context()));
    expect(identity.length).toBeLessThanOrEqual(256);
  });

  it("changes with every scope-defining dimension", () => {
    const base = devinSessionScopeIdentity(context());
    // Account source.
    expect(devinSessionScopeIdentity(context({ account: { kind: "default" } }))).not.toBe(base);
    expect(
      devinSessionScopeIdentity(context({ account: { kind: "isolated", ownerId: "other" } })),
    ).not.toBe(base);
    // Account data root.
    expect(
      devinSessionScopeIdentity(context({ roots: { dataRoot: "/roots/other/data" } })),
    ).not.toBe(base);
    // Org selection.
    expect(devinSessionScopeIdentity(context({ orgId: "org-1" }))).not.toBe(base);
    // Validated stable account user id.
    expect(devinSessionScopeIdentity(context({ accountUserId: "user-1" }))).not.toBe(base);
    // Runtime target.
    expect(devinSessionScopeIdentity(context({ runtimeTarget: "cloud" }))).not.toBe(base);
  });

  it("survives a credential rotation for the SAME proved user and refuses a different user", () => {
    // A rotating token is NOT an input: the binding changes only when the
    // PROVED stable user id changes, so a same-account re-login keeps every
    // resumable session while a different login at the same root orphans none
    // silently — the resume check refuses instead.
    const before = devinSessionScopeIdentity(context({ accountUserId: "user-1" }));
    const afterRotationSameUser = devinSessionScopeIdentity(context({ accountUserId: "user-1" }));
    const afterDifferentUser = devinSessionScopeIdentity(context({ accountUserId: "user-2" }));
    expect(afterRotationSameUser).toBe(before);
    expect(checkDevinResumeScope(afterRotationSameUser, ref(before))).toEqual({ ok: true });
    expect(checkDevinResumeScope(afterDifferentUser, ref(before))).toMatchObject({
      ok: false,
      code: "resume-scope-mismatch",
    });
  });

  it("refuses v1/v2 draft bindings as visible mismatches (intentional invalidation)", () => {
    // v1 (P3 draft, user-id dimension) and v2 (P4 draft, settings-org org
    // dimension) never shipped; a ref carrying either must surface as a
    // visible scope mismatch, never silently reattach under the v3
    // effective-org semantics.
    const identity = devinSessionScopeIdentity(context({ accountUserId: "user-1" }));
    for (const prefix of ["devin-session-scope-1:", "devin-session-scope-2:"]) {
      const check = checkDevinResumeScope(identity, ref(prefix + "a".repeat(32)));
      expect(check).toMatchObject({ ok: false, code: "resume-scope-mismatch" });
    }
  });

  it("ignores mutable launch dimensions (binary, model, thought, rules, config)", () => {
    // The input type only carries account/roots/org/target — binary identity,
    // model/thought selections and config content are structurally excluded
    // from the hash, so a CLI update or a settings edit never orphans refs.
    const identity = devinSessionScopeIdentity(context());
    expect(identity).toBe(devinSessionScopeIdentity(context()));
  });

  it("never embeds tokens or environment values (paths and org only)", () => {
    const identity = devinSessionScopeIdentity(
      context({ orgId: "acme-org", account: { kind: "isolated", ownerId: "work" } }),
    );
    expect(identity).not.toContain("acme-org");
    expect(identity).not.toContain("/roots");
  });

  it("does not use the win32 path normalizer for Linux scope roots", () => {
    // A WSL data root keeps forward slashes as literal hash input: the win32
    // path semantics can never leak into identity derivation because the
    // identity hashes the root STRING, and the root itself is POSIX-built.
    const wslIdentity = devinSessionScopeIdentity(
      context({ roots: { dataRoot: "${XDG_DATA_HOME:-$HOME/.local/share}" } }),
    );
    expect(wslIdentity).toBe(
      devinSessionScopeIdentity(
        context({ roots: { dataRoot: "${XDG_DATA_HOME:-$HOME/.local/share}" } }),
      ),
    );
  });
});

describe("checkDevinResumeScope", () => {
  const identity = devinSessionScopeIdentity(context());

  it("accepts a fresh launch without a ref", () => {
    expect(checkDevinResumeScope(identity, undefined)).toEqual({ ok: true });
  });

  it("accepts a profile resume bound to the matching scope", () => {
    expect(checkDevinResumeScope(identity, ref(identity))).toEqual({ ok: true });
  });

  it("fails closed on a profile resume with a missing binding", () => {
    const check = checkDevinResumeScope(identity, ref(undefined));
    expect(check.ok).toBe(false);
    expect(check).toMatchObject({ ok: false, code: "resume-scope-missing" });
    expect(check.ok === false && check.detail).toMatch(/no Devin account-scope binding/);
  });

  it("fails closed on a foreign scope without recovering", () => {
    const foreign = devinSessionScopeIdentity(context({ orgId: "other-org" }));
    const check = checkDevinResumeScope(identity, ref(foreign));
    expect(check).toMatchObject({ ok: false, code: "resume-scope-mismatch" });
  });

  it("refuses unbound refs when the current account has no proof", () => {
    expect(checkDevinResumeScope(undefined, ref(undefined))).toMatchObject({
      ok: false,
      code: "resume-scope-missing",
    });
  });

  it("refuses a bound ref when the current account has no proof", () => {
    const check = checkDevinResumeScope(undefined, ref(identity));
    expect(check).toMatchObject({ ok: false, code: "resume-scope-missing" });
  });
});

describe("withDevinScopeIdentity", () => {
  it("stamps a ref without dropping native fields", () => {
    const identity = "devin-session-scope-2:abc";
    expect(withDevinScopeIdentity(ref(undefined)!, identity)).toEqual({
      providerSessionId: "sid",
      discoveredAt: "2026-10-07T00:00:00Z",
      executionIdentity: identity,
    });
  });
});
