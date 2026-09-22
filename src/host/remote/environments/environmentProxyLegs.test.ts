import { Agent } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PrincipalAdmissionController,
  type PrincipalAdmissionLimits,
} from "../server/principalAdmission";
import { EnvironmentProxyLegs } from "./environmentProxyLegs";
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
    const held = legs.begin("session-1", "env-1", makeTarget().target);
    const heldLeases = legs.admit("session-1", "bulk", held);

    const refused = legs.begin("session-1", "env-1", makeTarget().target);
    expect(() => legs.admit("session-1", "bulk", refused)).toThrow("too much work in flight");
    expect(legs.activeLegCount()).toBe(1);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 1, control: 0 },
      sockets: 1,
    });

    legs.end(held, heldLeases);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });
  });

  it("releases the work lease and ends the leg when socket admission is refused", () => {
    const admission = makeAdmission({ maxSocketsPerPrincipal: 1 });
    const legs = new EnvironmentProxyLegs(admission);
    const held = legs.begin("session-1", "env-1", makeTarget().target);
    const heldLeases = legs.admit("session-1", "control", held);

    const refused = legs.begin("session-1", "env-1", makeTarget().target);
    expect(() => legs.admit("session-1", "control", refused)).toThrow("too many open connections");
    // The partial work admission rolled back with the leg.
    expect(legs.activeLegCount()).toBe(1);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 1 },
      sockets: 1,
    });

    legs.end(held, heldLeases);
    expect(admission.usage("session-1")).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });
  });
});
