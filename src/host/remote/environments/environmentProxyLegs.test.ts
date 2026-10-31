import { Agent } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_CONCURRENT_PRINCIPAL_WORK,
  DEFAULT_MAX_SOCKETS_PER_PRINCIPAL,
  DEFAULT_MAX_TOTAL_PRINCIPAL_WORK,
  DEFAULT_MAX_TOTAL_SOCKETS,
  DEFAULT_RESERVED_PRINCIPAL_CONTROL_CAPACITY,
  PrincipalAdmissionController,
  PrincipalOverloadError,
  type PrincipalAdmissionLimits,
} from "../server/principalAdmission";
import { EnvironmentProxyLegs, resolveEnvironmentProxyBudget } from "./environmentProxyLegs";
import type { EnvironmentProxyTarget } from "./types";

/**
 * Focused unit coverage for the E2 Cut E owner (leg registry, admission
 * leases, per-generation agent pool). These are the invariants the HTTP-level
 * proxy suites cannot pin deterministically: the already-invalidated fast
 * path, pool identity across generations, abort filtering, and
 * partial-admission rollback.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function admissionLimits(
  overrides: Partial<PrincipalAdmissionLimits> = {},
): PrincipalAdmissionLimits {
  return {
    maxConcurrentPrincipalWork: 4,
    reservedPrincipalControlCapacity: 1,
    maxTotalPrincipalWork: 16,
    maxSocketsPerPrincipal: 4,
    maxTotalSockets: 16,
    maxWatchesPerPrincipal: 8,
    maxTotalWatches: 32,
    maxBaselineStreamsPerPrincipal: 4,
    maxTotalBaselineStreams: 16,
    maxBaselineBytesPerPrincipal: 1024,
    maxTotalBaselineBytes: 4096,
    maxQueuedBytesPerPrincipal: 1024,
    maxTotalQueuedBytes: 4096,
    retryAfterMs: 1000,
    ...overrides,
  };
}

function makeAdmission(
  overrides: Partial<PrincipalAdmissionLimits> = {},
): PrincipalAdmissionController {
  return new PrincipalAdmissionController(admissionLimits(overrides), { evictSocket: () => {} });
}

function makeTarget(overrides: Partial<EnvironmentProxyTarget> = {}): {
  readonly target: EnvironmentProxyTarget;
  readonly invalidation: AbortController;
} {
  const invalidation = new AbortController();
  return {
    invalidation,
    target: {
      environmentId: "env-1",
      generation: 1,
      endpoint: "http://127.0.0.1:4711",
      remotePort: 4711,
      childDesktopId: "child-desktop",
      invalidation: invalidation.signal,
      assertCurrent: () => {},
      ...overrides,
    },
  };
}

describe("EnvironmentProxyLegs", () => {
  it("retains leases through a logical revoke and releases them only when the leg ends", () => {
    const admission = makeAdmission();
    const legs = new EnvironmentProxyLegs(admission);
    const { target } = makeTarget();
    const leg = legs.begin("session-1", "env-1", target);
    const leases = legs.admit("session-1", "bulk", leg);
    expect(legs.activeLegCount()).toBe(1);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 1, control: 0 },
      sockets: 1,
    });

    legs.revokeSession("session-1");
    expect(leg.controller.signal.aborted).toBe(true);
    // The logical revoke never releases: settlement truthfulness.
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 1, control: 0 },
      sockets: 1,
    });

    legs.end(leg, leases);
    expect(legs.activeLegCount()).toBe(0);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });
  });

  it("aborts only the revoked session's legs", () => {
    const legs = new EnvironmentProxyLegs(makeAdmission());
    const first = legs.begin("session-1", "env-1", makeTarget().target);
    const second = legs.begin("session-2", "env-1", makeTarget().target);

    legs.revokeSession("session-1");
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(legs.activeLegCount()).toBe(2);
  });

  it("aborts one environment's legs except the caller's own controller", () => {
    const legs = new EnvironmentProxyLegs(makeAdmission());
    const sibling = legs.begin("session-1", "env-1", makeTarget().target);
    const other = legs.begin("session-2", "env-1", makeTarget().target);
    const foreign = legs.begin("session-1", "env-2", makeTarget().target);

    legs.abortEnvironment("env-1", sibling.controller);
    expect(sibling.controller.signal.aborted).toBe(false);
    expect(other.controller.signal.aborted).toBe(true);
    expect(foreign.controller.signal.aborted).toBe(false);
  });

  it("begins an already-invalidated target in the aborted state", () => {
    const legs = new EnvironmentProxyLegs(makeAdmission());
    const aborted = new AbortController();
    aborted.abort();
    const { target } = makeTarget({ invalidation: aborted.signal });
    const leg = legs.begin("session-1", "env-1", target);

    expect(leg.controller.signal.aborted).toBe(true);
    legs.end(leg);
    expect(legs.activeLegCount()).toBe(0);
  });

  it("detaches a leg from the target invalidation when it ends", () => {
    const legs = new EnvironmentProxyLegs(makeAdmission());
    const { target, invalidation } = makeTarget();
    const leg = legs.begin("session-1", "env-1", target);
    legs.end(leg);

    invalidation.abort();
    expect(leg.controller.signal.aborted).toBe(false);
  });

  it("keys the agent pool per environment generation and destroys it with the tunnel", () => {
    const legs = new EnvironmentProxyLegs(makeAdmission());
    const first = makeTarget();
    const second = makeTarget({ generation: 2 });

    const firstAgent = legs.agentFor(first.target);
    expect(legs.agentFor(first.target)).toBe(firstAgent);
    const secondAgent = legs.agentFor(second.target);
    expect(secondAgent).not.toBe(firstAgent);

    const firstDestroy = vi.spyOn(firstAgent, "destroy");
    const secondDestroy = vi.spyOn(secondAgent, "destroy");
    first.invalidation.abort();
    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(secondDestroy).not.toHaveBeenCalled();

    // An invalidated generation never re-registers its unusable pool: the
    // handed-out agent is destroyed immediately instead of being cached.
    const prototypeDestroy = vi.spyOn(Agent.prototype, "destroy");
    const orphan = legs.agentFor(first.target);
    expect(orphan).not.toBe(firstAgent);
    expect(prototypeDestroy.mock.instances).toContain(orphan);

    legs.dispose();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
  });

  it("ends the leg before throwing when work admission is refused", () => {
    const admission = makeAdmission({
      maxConcurrentPrincipalWork: 2,
      reservedPrincipalControlCapacity: 1,
    });
    const legs = new EnvironmentProxyLegs(admission);
    // The parent's own bulk route holds the principal's only bulk slot.
    const local = admission.tryAdmitWork("session-1", "bulk");

    const refused = legs.begin("session-1", "env-1", makeTarget().target);
    expect(() => legs.admit("session-1", "bulk", refused)).toThrow("too much work in flight");
    expect(legs.activeLegCount()).toBe(0);
    expect(legs.usage("session-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 1, control: 0 },
      sockets: 0,
    });

    local.release();
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });
  });

  it("releases the work lease and ends the leg when socket admission is refused", () => {
    const admission = makeAdmission({ maxSocketsPerPrincipal: 1 });
    const legs = new EnvironmentProxyLegs(admission);
    // The parent's own event socket holds the principal's only socket.
    const events = admission.tryAdmitSocket("session-1");

    const refused = legs.begin("session-1", "env-1", makeTarget().target);
    expect(() => legs.admit("session-1", "control", refused)).toThrow("too many open connections");
    // The partial work admission rolled back with the leg.
    expect(legs.activeLegCount()).toBe(0);
    expect(legs.usage("session-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 1,
    });

    events.release();
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });
  });
});

describe("EnvironmentProxyLegs nested parent/environment budget (D2)", () => {
  const defaultLimits = {
    maxConcurrentPrincipalWork: DEFAULT_MAX_CONCURRENT_PRINCIPAL_WORK,
    reservedPrincipalControlCapacity: DEFAULT_RESERVED_PRINCIPAL_CONTROL_CAPACITY,
    maxTotalPrincipalWork: DEFAULT_MAX_TOTAL_PRINCIPAL_WORK,
    maxSocketsPerPrincipal: DEFAULT_MAX_SOCKETS_PER_PRINCIPAL,
    maxTotalSockets: DEFAULT_MAX_TOTAL_SOCKETS,
  } satisfies Partial<PrincipalAdmissionLimits>;
  const PARENT_BUSY = "too many environment requests in flight";
  const ENVIRONMENT_BUSY = "This environment has too many requests in flight";

  function expectBusy(admit: () => unknown, message: string, limit: "work" | "sockets"): void {
    let caught: unknown;
    try {
      admit();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PrincipalOverloadError);
    expect(caught).toMatchObject({
      code: "principal_busy",
      status: 429,
      retryAfterMs: 1000,
      limit,
    });
    expect((caught as Error).message).toContain(message);
  }

  function admitLeg(
    legs: EnvironmentProxyLegs,
    sessionId: string,
    environmentId: string,
    workClass: "bulk" | "control" = "bulk",
    target = makeTarget({ environmentId }).target,
  ) {
    const leg = legs.begin(sessionId, environmentId, target);
    return { leg, leases: legs.admit(sessionId, workClass, leg) };
  }

  function refuseLeg(
    legs: EnvironmentProxyLegs,
    sessionId: string,
    environmentId: string,
    workClass: "bulk" | "control",
    message: string,
    limit: "work" | "sockets",
  ): void {
    const leg = legs.begin(sessionId, environmentId, makeTarget({ environmentId }).target);
    expectBusy(() => legs.admit(sessionId, workClass, leg), message, limit);
  }

  it("derives both tiers from the principal limits and never resolves an unusable proxy", () => {
    // Defaults: the parent keeps 4 of 16 sockets, one environment gets 9 of
    // the remaining 12 legs, and each tier keeps a one-leg control slice.
    expect(resolveEnvironmentProxyBudget(admissionLimits(defaultLimits))).toEqual({
      parent: { legs: 12, bulkLegs: 11 },
      environment: { legs: 9, bulkLegs: 8 },
    });
    // The bulk-work quarter binds when sockets are plentiful.
    expect(
      resolveEnvironmentProxyBudget(
        admissionLimits({ ...defaultLimits, maxSocketsPerPrincipal: 64 }),
      ),
    ).toEqual({ parent: { legs: 48, bulkLegs: 21 }, environment: { legs: 36, bulkLegs: 16 } });
    // A one-slot bulk allowance (the F1 corrections host) stays usable.
    expect(
      resolveEnvironmentProxyBudget(
        admissionLimits({
          ...defaultLimits,
          maxConcurrentPrincipalWork: 2,
          reservedPrincipalControlCapacity: 1,
        }),
      ),
    ).toEqual({ parent: { legs: 12, bulkLegs: 1 }, environment: { legs: 9, bulkLegs: 1 } });
    // Tiny explicit budgets keep the pre-budget admission: no reserved
    // quarter, no control slice, and still one leg of each class per child.
    expect(
      resolveEnvironmentProxyBudget(
        admissionLimits({
          maxConcurrentPrincipalWork: 2,
          reservedPrincipalControlCapacity: 1,
          maxSocketsPerPrincipal: 1,
        }),
      ),
    ).toEqual({ parent: { legs: 1, bulkLegs: 1 }, environment: { legs: 1, bulkLegs: 1 } });
    expect(
      resolveEnvironmentProxyBudget(
        admissionLimits({
          maxConcurrentPrincipalWork: 1,
          reservedPrincipalControlCapacity: 0,
          maxSocketsPerPrincipal: 3,
        }),
      ),
    ).toEqual({ parent: { legs: 3, bulkLegs: 1 }, environment: { legs: 3, bulkLegs: 1 } });
  });

  it("bounds one environment to its share while siblings, the parent, and other principals stay admissible", () => {
    const admission = makeAdmission(defaultLimits);
    const legs = new EnvironmentProxyLegs(admission);
    const { environment } = legs.budget;
    // A stalled child fills its own bulk share…
    const stalled = Array.from({ length: environment.bulkLegs }, () =>
      admitLeg(legs, "session-1", "env-1"),
    );
    expect(legs.usage("session-1", "env-1")).toEqual({
      legs: environment.bulkLegs,
      bulkLegs: environment.bulkLegs,
    });
    refuseLeg(legs, "session-1", "env-1", "bulk", ENVIRONMENT_BUSY, "work");
    // …keeps its control slice for a Stop, and then its whole share is held.
    const stop = admitLeg(legs, "session-1", "env-1", "control");
    expect(legs.usage("session-1", "env-1")).toEqual({
      legs: environment.legs,
      bulkLegs: environment.bulkLegs,
    });
    refuseLeg(legs, "session-1", "env-1", "control", ENVIRONMENT_BUSY, "sockets");

    // A healthy sibling of the same parent still gets a socket, a request,
    // and a Stop; the parent's own bulk route and event socket still get in.
    const sibling = [
      admitLeg(legs, "session-1", "env-2"),
      admitLeg(legs, "session-1", "env-2"),
      admitLeg(legs, "session-1", "env-2", "control"),
    ];
    const local = admission.tryAdmitWork("session-1", "bulk");
    const events = admission.tryAdmitSocket("session-1");
    // Another principal has its own tiers, even on the stalled child.
    const other = admitLeg(legs, "session-2", "env-1");

    // Refused legs left nothing behind.
    expect(legs.activeLegCount()).toBe(stalled.length + 1 + sibling.length + 1);
    expect(legs.usage("session-1")).toEqual({
      legs: environment.legs + sibling.length,
      bulkLegs: environment.bulkLegs + 2,
    });
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: environment.bulkLegs + 2 + 1, control: 2 },
      sockets: environment.legs + sibling.length + 1,
    });

    for (const { leg, leases } of [...stalled, stop, ...sibling, other]) legs.end(leg, leases);
    local.release();
    events.release();
    for (const environmentId of ["env-1", "env-2"]) {
      expect(legs.usage("session-1", environmentId)).toEqual({ legs: 0, bulkLegs: 0 });
    }
    expect(legs.usage("session-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(legs.usage("session-2")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(admission.totals()).toMatchObject({ work: { bulk: 0, control: 0 }, sockets: 0 });
  });

  it("bounds all of a parent's environments together by its aggregate budget", () => {
    const admission = makeAdmission(defaultLimits);
    const legs = new EnvironmentProxyLegs(admission);
    const { parent, environment } = legs.budget;
    // Three children, none at its own share, together reach the parent's.
    const held = Array.from({ length: parent.bulkLegs }, (_, index) =>
      admitLeg(legs, "session-1", `env-${(index % 3) + 1}`),
    );
    for (const environmentId of ["env-1", "env-2", "env-3"]) {
      expect(legs.usage("session-1", environmentId).bulkLegs).toBeLessThan(environment.bulkLegs);
    }
    expect(legs.usage("session-1")).toEqual({ legs: parent.bulkLegs, bulkLegs: parent.bulkLegs });

    // Any child, held or fresh, is refused before it takes a principal lease.
    refuseLeg(legs, "session-1", "env-1", "bulk", PARENT_BUSY, "work");
    refuseLeg(legs, "session-1", "env-4", "bulk", PARENT_BUSY, "work");
    expect(legs.activeLegCount()).toBe(parent.bulkLegs);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: parent.bulkLegs, control: 0 },
      sockets: parent.bulkLegs,
    });

    // The parent's own bulk route and event socket still get in, a proxied
    // Stop keeps the parent's control slice, and another principal is
    // untouched.
    const local = admission.tryAdmitWork("session-1", "bulk");
    const events = admission.tryAdmitSocket("session-1");
    const stop = admitLeg(legs, "session-1", "env-4", "control");
    expect(legs.usage("session-1")).toEqual({ legs: parent.legs, bulkLegs: parent.bulkLegs });
    refuseLeg(legs, "session-1", "env-4", "control", PARENT_BUSY, "sockets");
    const other = admitLeg(legs, "session-2", "env-1");

    for (const { leg, leases } of [...held, stop, other]) legs.end(leg, leases);
    local.release();
    events.release();
    expect(legs.usage("session-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(admission.totals()).toMatchObject({ work: { bulk: 0, control: 0 }, sockets: 0 });
  });

  it("returns budget slots exactly once, when legs settle after a revoke or a restart", () => {
    const admission = makeAdmission(defaultLimits);
    const legs = new EnvironmentProxyLegs(admission);
    const { environment } = legs.budget;
    const restarting = makeTarget();
    const fill = (target: EnvironmentProxyTarget) =>
      Array.from({ length: environment.bulkLegs }, () =>
        admitLeg(legs, "session-1", "env-1", "bulk", target),
      );

    // Revocation aborts the legs but frees nothing until they settle.
    const revoked = fill(restarting.target);
    legs.revokeSession("session-1");
    expect(revoked.every(({ leg }) => leg.controller.signal.aborted)).toBe(true);
    refuseLeg(legs, "session-1", "env-1", "bulk", ENVIRONMENT_BUSY, "work");
    for (const { leg, leases } of revoked) {
      legs.end(leg, leases);
      // A duplicate settlement never double-frees.
      legs.end(leg, leases);
      leases.work.release();
      leases.socket.release();
    }
    expect(legs.usage("session-1", "env-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(legs.usage("session-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });

    // An environment restart (generation invalidation) behaves the same, and
    // the next generation gets exactly its full share back.
    const beforeRestart = fill(restarting.target);
    restarting.invalidation.abort();
    expect(beforeRestart.every(({ leg }) => leg.controller.signal.aborted)).toBe(true);
    for (const { leg, leases } of beforeRestart) legs.end(leg, leases);
    const refilled = fill(makeTarget({ generation: 2 }).target);
    expect(legs.usage("session-1", "env-1")).toEqual({
      legs: environment.bulkLegs,
      bulkLegs: environment.bulkLegs,
    });
    refuseLeg(legs, "session-1", "env-1", "bulk", ENVIRONMENT_BUSY, "work");
    for (const { leg, leases } of refilled) legs.end(leg, leases);
    expect(legs.usage("session-1")).toEqual({ legs: 0, bulkLegs: 0 });
    expect(admission.totals()).toMatchObject({ work: { bulk: 0, control: 0 }, sockets: 0 });
  });
});
