import { describe, expect, it } from "vitest";
import {
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  HostResourceAdmissionOwner,
  HostResourceBusyError,
  HostResourceHandoffError,
  HostResourcePolicyUnavailableError,
  UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
  acquireOrHandoff,
  isHostResourceBusyError,
  resolveHostResourceAdmission,
  type HostResourceAdmissionPolicy,
} from "./hostResourceAdmission";
import { isHostResourcePolicyUnavailableError } from "@/shared/hostResourceAdmission";

function policy(overrides: Partial<HostResourceAdmissionPolicy> = {}): HostResourceAdmissionPolicy {
  return { ...UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY, ...overrides };
}

describe("HostResourceAdmissionOwner", () => {
  it("defaults to explicit unlimited capacity while still counting", () => {
    const owner = new HostResourceAdmissionOwner();
    const leases = Array.from({ length: 8 }, (_, index) =>
      owner.tryAcquire({ resourceClass: "agent-session", key: `thread-${index}` }),
    );
    expect(owner.usage()).toMatchObject({
      agentSessions: { active: 0, pending: 8, retiring: 0 },
      total: 8,
      refusals: 0,
    });
    for (const lease of leases) lease.activate();
    expect(owner.usage().agentSessions).toEqual({ active: 8, pending: 0, retiring: 0 });
  });

  it("counts pending reservations so held starts cannot exceed the cap", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 2 }));
    owner.tryAcquire({ resourceClass: "agent-session", key: "a" }).activate();
    owner.tryAcquire({ resourceClass: "agent-session", key: "b" });

    let refusal: unknown;
    try {
      owner.tryAcquire({ resourceClass: "agent-session", key: "c" });
    } catch (error) {
      refusal = error;
    }
    expect(isHostResourceBusyError(refusal)).toBe(true);
    expect(refusal).toBeInstanceOf(HostResourceBusyError);
    expect((refusal as HostResourceBusyError).details).toEqual({
      resourceClass: "agent-session",
      limit: 2,
      active: 1,
      pending: 1,
      retiring: 0,
      retryAfterMs: 1_000,
    });
    expect(owner.usage().refusals).toBe(1);
    expect(owner.usage().total).toBe(2);
  });

  it("keeps retiring capacity held until exit is confirmed", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const lease = owner.tryAcquire({ resourceClass: "agent-session", key: "a" });
    lease.activate();
    lease.beginRetirement();
    expect(owner.usage().agentSessions).toEqual({ active: 0, pending: 0, retiring: 1 });
    expect(() => owner.tryAcquire({ resourceClass: "agent-session", key: "b" })).toThrow(
      HostResourceBusyError,
    );

    lease.confirmExit();
    expect(owner.usage().agentSessions).toEqual({ active: 0, pending: 0, retiring: 0 });
    expect(owner.tryAcquire({ resourceClass: "agent-session", key: "b" })).toBeDefined();
  });

  it("is instance-keyed: a stale generation's late exit cannot free a successor", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const predecessor = owner.tryAcquire({ resourceClass: "agent-session", key: "a" });
    predecessor.activate();
    const successor = owner.tryHandoff(predecessor);
    expect(successor).toBeDefined();
    predecessor.confirmExit();
    successor!.activate();
    // Duplicate/late confirmation from the retired generation is a no-op.
    predecessor.confirmExit();
    expect(owner.usage()).toMatchObject({ total: 1, agentSessions: { active: 1 } });
    expect(() => owner.tryAcquire({ resourceClass: "agent-session", key: "b" })).toThrow(
      HostResourceBusyError,
    );
  });

  it("refuses duplicate-key acquisition and never creates a second reservation", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 0 }));
    const first = owner.tryAcquire({ resourceClass: "agent-session", key: "same" });
    expect(() => owner.tryAcquire({ resourceClass: "agent-session", key: "same" })).toThrow(
      HostResourceBusyError,
    );
    first.activate();
    expect(() => owner.tryAcquire({ resourceClass: "agent-session", key: "same" })).toThrow(
      HostResourceBusyError,
    );
    first.confirmExit();
    expect(owner.tryAcquire({ resourceClass: "agent-session", key: "same" })).toBeDefined();
  });

  it("holds the single slot across a handoff and refuses successor activation early", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const predecessor = owner.tryAcquire({ resourceClass: "agent-session", key: "thread" });
    predecessor.activate();
    const successor = owner.tryHandoff(predecessor)!;
    expect(owner.usage().total).toBe(1);
    expect(owner.usage().agentSessions).toEqual({ active: 0, pending: 0, retiring: 1 });
    expect(() => successor.activate()).toThrow(HostResourceHandoffError);

    predecessor.beginRetirement();
    expect(() => successor.activate()).toThrow(HostResourceHandoffError);
    predecessor.confirmExit();
    successor.activate();
    expect(owner.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, pending: 0, retiring: 0 },
    });
  });

  it("frees the reservation when the handed-off successor is cancelled", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const predecessor = owner.tryAcquire({ resourceClass: "agent-session", key: "thread" });
    predecessor.activate();
    const successor = owner.tryHandoff(predecessor)!;
    successor.cancel();
    expect(owner.usage().total).toBe(1);
    predecessor.confirmExit();
    expect(owner.usage().total).toBe(0);
    expect(owner.tryAcquire({ resourceClass: "agent-session", key: "other" })).toBeDefined();
  });

  it("cancels a pre-effect reservation and frees capacity", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const lease = owner.tryAcquire({ resourceClass: "agent-session", key: "a" });
    lease.cancel();
    lease.cancel();
    expect(owner.usage().total).toBe(0);
    owner.tryAcquire({ resourceClass: "agent-session", key: "b" });
  });

  it("refuses handoff for foreign, released, superseded or already-handoff leases", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const foreign = new HostResourceAdmissionOwner(() =>
      policy({ maxActiveAgentSessions: 1 }),
    ).tryAcquire({ resourceClass: "agent-session", key: "x" });
    expect(owner.tryHandoff(foreign)).toBeUndefined();

    const lease = owner.tryAcquire({ resourceClass: "agent-session", key: "a" });
    lease.activate();
    const successor = owner.tryHandoff(lease)!;
    expect(successor).toBeDefined();
    expect(owner.tryHandoff(lease)).toBeUndefined();
    expect(owner.tryHandoff(successor)).toBeUndefined();
    successor.cancel();
    lease.cancel();
    expect(owner.tryHandoff(lease)).toBeUndefined();
  });

  it("applies a lowered policy to the next acquire without killing live work", () => {
    let current = policy({ maxActiveAgentSessions: 0 });
    const owner = new HostResourceAdmissionOwner(() => current);
    const live = owner.tryAcquire({ resourceClass: "agent-session", key: "a" });
    live.activate();
    current = policy({ maxActiveAgentSessions: 1 });
    expect(() => owner.tryAcquire({ resourceClass: "agent-session", key: "b" })).toThrow(
      HostResourceBusyError,
    );
    live.confirmExit();
    expect(owner.tryAcquire({ resourceClass: "agent-session", key: "b" })).toBeDefined();
  });

  it("reports classes independently", () => {
    const owner = new HostResourceAdmissionOwner(() =>
      policy({ maxActiveAgentSessions: 1, maxActiveTerminalShells: 1 }),
    );
    const session = owner.tryAcquire({ resourceClass: "agent-session", key: "thread" });
    session.activate();
    const shell = owner.tryAcquire({ resourceClass: "terminal-shell", key: "shell" });
    shell.activate();
    expect(owner.usage()).toMatchObject({
      agentSessions: { active: 1 },
      terminalShells: { active: 1 },
      generationHelpers: { active: 0 },
      total: 2,
    });
  });
});

describe("acquireOrHandoff", () => {
  it("hands the single slot to a replacement predecessor and keeps it counted once", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const predecessor = owner.tryAcquire({ resourceClass: "agent-session", key: "thread" });
    predecessor.activate();

    const successor = acquireOrHandoff(owner, predecessor, {
      resourceClass: "agent-session",
      key: "thread",
    });
    expect(successor).not.toBe(predecessor);
    expect(owner.usage()).toMatchObject({ total: 1, agentSessions: { retiring: 1 } });
    // The replacement does not create a second unit: an unrelated start is refused.
    expect(() =>
      acquireOrHandoff(owner, undefined, { resourceClass: "agent-session", key: "other" }),
    ).toThrow(HostResourceBusyError);
    expect(() => successor.activate()).toThrow(HostResourceHandoffError);
    predecessor.confirmExit();
    successor.activate();
    expect(owner.usage()).toMatchObject({ total: 1, agentSessions: { active: 1 } });
  });

  it("acquires fresh for a missing, foreign, or already-handed-off predecessor", () => {
    const owner = new HostResourceAdmissionOwner(() => policy({ maxActiveAgentSessions: 1 }));
    const missing = acquireOrHandoff(owner, undefined, {
      resourceClass: "terminal-shell",
      key: "shell",
    });
    expect(missing.resourceClass).toBe("terminal-shell");

    const foreignOwner = new HostResourceAdmissionOwner(() => policy({}));
    const foreign = foreignOwner.tryAcquire({ resourceClass: "agent-session", key: "thread" });
    const fresh = acquireOrHandoff(owner, foreign, {
      resourceClass: "agent-session",
      key: "thread",
    });
    expect(fresh).not.toBe(foreign);

    const successor = acquireOrHandoff(owner, fresh, {
      resourceClass: "agent-session",
      key: "thread",
    });
    expect(successor).not.toBe(fresh);
    // A predecessor whose handoff is already bound falls back to a fresh acquire
    // of the same key, which refuses as a duplicate instead of handing off twice.
    expect(() =>
      acquireOrHandoff(owner, fresh, { resourceClass: "agent-session", key: "thread" }),
    ).toThrow(HostResourceBusyError);
  });
});

describe("HostResourceAdmissionOwner fail-closed policy", () => {
  it("refuses new counted starts before any capacity or duplicate check", () => {
    const owner = new HostResourceAdmissionOwner(() =>
      policy({ maxActiveAgentSessions: 2, refuseNewStarts: "host-resource-admission-invalid" }),
    );

    for (const key of ["first", "first"]) {
      let refusal: unknown;
      try {
        owner.tryAcquire({ resourceClass: "agent-session", key });
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toBeInstanceOf(HostResourcePolicyUnavailableError);
      expect(isHostResourcePolicyUnavailableError(refusal)).toBe(true);
      expect((refusal as HostResourcePolicyUnavailableError).code).toBe(
        HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
      );
      expect((refusal as HostResourcePolicyUnavailableError).reason).toBe(
        "host-resource-admission-invalid",
      );
    }
    expect(owner.usage()).toMatchObject({ total: 0, refusals: 2 });
  });

  it("keeps stop, cleanup, handoff and usage available while refusing new starts", () => {
    let refuse: string | undefined;
    const owner = new HostResourceAdmissionOwner(() =>
      policy(refuse === undefined ? {} : { refuseNewStarts: refuse }),
    );
    const live = owner.tryAcquire({ resourceClass: "agent-session", key: "thread-a" });
    live.activate();
    refuse = "settings-document-unreadable";

    expect(() => owner.tryAcquire({ resourceClass: "agent-session", key: "thread-b" })).toThrow(
      HostResourcePolicyUnavailableError,
    );
    expect(owner.usage().agentSessions).toEqual({ active: 1, pending: 0, retiring: 0 });

    const successor = owner.tryHandoff(live);
    expect(successor).toBeDefined();
    successor!.cancel();
    live.beginRetirement();
    live.confirmExit();
    expect(owner.usage().agentSessions).toEqual({ active: 0, pending: 0, retiring: 0 });
  });
});

describe("resolveHostResourceAdmission", () => {
  const configured = {
    maxActiveAgentSessions: 4,
    maxActiveTerminalShells: 2,
    maxActiveGenerationHelpers: 1,
  };

  it("resolves configured evidence into the effective policy and new lastGood", () => {
    const resolved = resolveHostResourceAdmission(
      { kind: "configured", settings: configured },
      undefined,
    );
    expect(resolved.policy).toEqual({ ...configured, overloadRetryAfterMs: 1_000 });
    expect(resolved.resolution).toEqual({ kind: "configured" });
    expect(resolved.lastGood).toEqual(configured);
  });

  it("treats an absent field in a valid document as an explicit unlimited reset", () => {
    const resolved = resolveHostResourceAdmission({ kind: "absent" }, configured);
    expect(resolved.policy).toEqual(UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
    expect(resolved.resolution).toEqual({ kind: "absent" });
    expect(resolved.lastGood).toBe("unlimited");
  });

  it("treats a missing file as transient and keeps the last known valid policy", () => {
    const start = resolveHostResourceAdmission(
      { kind: "configured", settings: configured },
      undefined,
    );
    const missing = resolveHostResourceAdmission({ kind: "missing" }, start.lastGood);
    expect(missing.policy).toEqual({ ...configured, overloadRetryAfterMs: 1_000 });
    expect(missing.resolution).toEqual({ kind: "missing" });
    expect(missing.lastGood).toEqual(configured);
  });

  it("treats a missing file before any valid policy as legacy transitional unlimited", () => {
    const missing = resolveHostResourceAdmission({ kind: "missing" }, undefined);
    expect(missing.policy).toEqual(UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
    expect(missing.policy).not.toHaveProperty("refuseNewStarts");
    expect(missing.resolution).toEqual({ kind: "missing" });
    expect(missing.lastGood).toBeUndefined();
  });

  it("retains the last known valid policy across invalid evidence and never erases it", () => {
    const invalid = resolveHostResourceAdmission(
      { kind: "invalid", problem: "host-resource-admission-invalid" },
      configured,
    );
    expect(invalid.policy).toEqual({ ...configured, overloadRetryAfterMs: 1_000 });
    expect(invalid.resolution).toEqual({
      kind: "retained",
      problem: "host-resource-admission-invalid",
    });
    expect(invalid.lastGood).toEqual(configured);

    const unreadable = resolveHostResourceAdmission(
      { kind: "unreadable", problem: "settings-document-unreadable" },
      invalid.lastGood,
    );
    expect(unreadable.policy).toEqual({ ...configured, overloadRetryAfterMs: 1_000 });
    expect(unreadable.resolution.kind).toBe("retained");
  });

  it("fails closed on invalid evidence with no prior valid policy", () => {
    for (const evidence of [
      { kind: "invalid", problem: "settings-document-unparseable" },
      { kind: "unreadable", problem: "settings-document-unreadable" },
    ] as const) {
      const resolved = resolveHostResourceAdmission(evidence, undefined);
      expect(resolved.policy).toMatchObject({
        maxActiveAgentSessions: 0,
        maxActiveTerminalShells: 0,
        maxActiveGenerationHelpers: 0,
        refuseNewStarts: evidence.problem,
      });
      expect(resolved.resolution).toEqual({ kind: "unavailable", problem: evidence.problem });
      expect(resolved.lastGood).toBeUndefined();
    }
  });
});
