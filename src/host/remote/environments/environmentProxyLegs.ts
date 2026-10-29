import { Agent } from "node:http";
import { resolveControlReserve, type IngressWorkClass } from "../remoteAccessServerTypes";
import {
  PrincipalOverloadError,
  type PrincipalAdmissionController,
  type PrincipalAdmissionLimits,
  type PrincipalLimitKind,
  type PrincipalSocketLease,
  type PrincipalWorkLease,
} from "../server/principalAdmission";
import type { EnvironmentProxyTarget } from "./types";

/**
 * C1.2 parent proxy legs (E2 Cut E). One owner for the proxy's live resource
 * accounting: the leg registry, the principal admission leases each leg
 * holds, and the per-target-generation keep-alive agent pool. The gateway
 * keeps the transport/orchestration and calls in; nothing here dials.
 *
 * Resource budget (the definition tests and operators rely on):
 * - one proxied leg = one principal work lease + one principal socket lease
 *   from the existing `PrincipalAdmissionController` (bulk class), acquired
 *   only after parent authentication and released only when the leg's
 *   transport actually settles — never on the logical revoke call;
 * - every leg also holds a slot of its parent principal's aggregate proxy
 *   budget and of its environment's share of that budget
 *   ({@link resolveEnvironmentProxyBudget}), released with the leases;
 * - each verified target generation owns one keep-alive pool with a hard
 *   socket cap, destroyed on invalidation, so upstream connections are
 *   bounded per environment and never outlive their tunnel.
 */

export interface ActiveLeg {
  readonly controller: AbortController;
  readonly sessionId: string;
  readonly environmentId: string;
  readonly target: EnvironmentProxyTarget;
  readonly onInvalidate: () => void;
}

export interface EnvironmentProxyLegLeases {
  readonly work: PrincipalWorkLease;
  readonly socket: PrincipalSocketLease;
}

/**
 * Pool policy for the per-target keep-alive agents. Same idle semantics as the
 * port-forward pools (idle sockets retire ~5s after their last response;
 * `timeout` never deadlines an in-flight response), plus a hard socket cap per
 * environment generation so one environment cannot grow unbounded upstream
 * connections.
 */
const ENVIRONMENT_AGENT_OPTIONS = {
  keepAlive: true,
  scheduling: "lifo" as const,
  timeout: 5_000,
  maxSockets: 32,
};

/** Live proxy legs counted against one budget tier. */
export interface EnvironmentProxyLegCounts {
  /** Legs of any class; each holds one principal socket. */
  readonly legs: number;
  /** Bulk legs; each also holds one principal bulk work slot. */
  readonly bulkLegs: number;
}

export interface EnvironmentProxyBudget {
  /** All of one parent principal's legs, summed over its environments. */
  readonly parent: EnvironmentProxyLegCounts;
  /** One environment's legs, inside its parent's budget. */
  readonly environment: EnvironmentProxyLegCounts;
}

interface LegTally {
  legs: number;
  bulkLegs: number;
}

/** Each tier keeps 1/N of the allowance it divides, rounded down. */
const RESERVED_SHARE_DIVISOR = 4;

function afterReservedShare(allowance: number): number {
  return allowance - Math.floor(allowance / RESERVED_SHARE_DIVISOR);
}

/** One tier: bulk stops short of `legs` by a control slice sized like the
 * principal's default reserve. */
function budgetTier(
  legs: number,
  bulkWork: number,
  controlReserve: number,
): EnvironmentProxyLegCounts {
  const controlSlice = resolveControlReserve(
    "environmentProxyControlSlice",
    undefined,
    controlReserve,
    legs,
  );
  return { legs, bulkLegs: Math.min(legs - controlSlice, bulkWork) };
}

/**
 * The nested proxy budget every parent principal gets, derived from the
 * principal's resolved limits with no knob of its own. A frozen or
 * restarting child holds its legs until the client gives up, and a proxied
 * WebSocket holds its leg for the socket's lifetime, so without these bounds
 * one child could shed its siblings, and environments together could shed
 * the parent's own chat, attachments, and event socket, with 429s.
 *
 * Each tier keeps a quarter (rounded down) of the allowance it divides:
 * - `parent` bounds all of one parent's legs, so at least a quarter of the
 *   principal's sockets and bulk work stays with the parent (by default 4
 *   sockets: its event socket and a device-preview pair, with room to
 *   spare). Environments share three quarters rather than half, because
 *   every connected environment's event socket keeps one leg for its
 *   lifetime.
 * - `environment` bounds one environment inside that, so a stalled child
 *   leaves its siblings at least a quarter of the parent budget (3 legs by
 *   default) while one child still gets three quarters for its own bursts
 *   (9 legs, 8 of them bulk, by default).
 *
 * At both tiers bulk legs stop short of `legs` by a control slice, so a
 * proxied Stop or approval stays admissible while bulk is saturated. Every
 * share rounds down: a very small explicit budget keeps no reserved quarter
 * and at least one leg of each class, as before, rather than an unusable
 * proxy.
 */
export function resolveEnvironmentProxyBudget(
  limits: PrincipalAdmissionLimits,
): EnvironmentProxyBudget {
  const controlReserve = limits.reservedPrincipalControlCapacity;
  const parent = budgetTier(
    afterReservedShare(limits.maxSocketsPerPrincipal),
    afterReservedShare(limits.maxConcurrentPrincipalWork - controlReserve),
    controlReserve,
  );
  return {
    parent,
    environment: budgetTier(
      afterReservedShare(parent.legs),
      afterReservedShare(parent.bulkLegs),
      controlReserve,
    ),
  };
}

function environmentTallyKey(sessionId: string, environmentId: string): string {
  return `${sessionId}\u0000${environmentId}`;
}

/** The limit a tier would exceed by admitting one more leg, if any. */
function exhaustedLimit(
  tally: LegTally | undefined,
  tier: EnvironmentProxyLegCounts,
  bulk: boolean,
): PrincipalLimitKind | null {
  if ((tally?.legs ?? 0) >= tier.legs) return "sockets";
  return bulk && (tally?.bulkLegs ?? 0) >= tier.bulkLegs ? "work" : null;
}

/** Counts one admitted leg under `key` (removed once empty) and returns the
 * per-field settle its leases run on release. */
function countLeg(
  tallies: Map<string, LegTally>,
  key: string,
  bulk: boolean,
): (field: keyof LegTally) => void {
  const tally = tallies.get(key) ?? { legs: 0, bulkLegs: 0 };
  tallies.set(key, tally);
  tally.legs += 1;
  if (bulk) tally.bulkLegs += 1;
  return (field) => {
    tally[field] -= 1;
    if (tally.legs <= 0 && tally.bulkLegs <= 0) tallies.delete(key);
  };
}

/** Wraps a principal lease so its one-shot release also runs `onRelease`. */
function releasingWith<Lease extends PrincipalWorkLease | PrincipalSocketLease>(
  lease: Lease,
  onRelease: () => void,
): Lease {
  let released = false;
  return {
    ...lease,
    release: () => {
      if (released) return;
      released = true;
      lease.release();
      onRelease();
    },
  };
}

export class EnvironmentProxyLegs {
  /** This gateway's nested proxy budget (diagnostics/tests). */
  readonly budget: EnvironmentProxyBudget;
  private readonly principalAdmission: PrincipalAdmissionController;
  private readonly legs = new Map<AbortController, ActiveLeg>();
  private readonly agents = new Map<string, Agent>();
  /** Live legs per parent session, and per parent session + environment. */
  private readonly parentTallies = new Map<string, LegTally>();
  private readonly environmentTallies = new Map<string, LegTally>();

  constructor(principalAdmission: PrincipalAdmissionController) {
    this.principalAdmission = principalAdmission;
    this.budget = resolveEnvironmentProxyBudget(principalAdmission.limits);
  }

  /**
   * Parent session revocation: aborts every leg this session owns. The
   * streams are destroyed synchronously; each leg's admission leases are
   * released only when its operation actually settles (never on the logical
   * revoke call), so accounting stays truthful while the transport drains.
   */
  revokeSession(sessionId: string): void {
    for (const leg of [...this.legs.values()]) {
      if (leg.sessionId === sessionId) leg.controller.abort();
    }
  }

  /** Aborts every live leg for one environment, except the caller's own
   * controller when supplied (the descriptor transform's sibling abort). */
  abortEnvironment(environmentId: string, exceptController?: AbortController): void {
    for (const leg of [...this.legs.values()]) {
      if (leg.environmentId === environmentId && leg.controller !== exceptController) {
        leg.controller.abort();
      }
    }
  }

  dispose(): void {
    for (const leg of [...this.legs.values()]) leg.controller.abort();
    for (const [key, agent] of this.agents) {
      agent.destroy();
      this.agents.delete(key);
    }
  }

  /** Live leg count (diagnostics/tests). */
  activeLegCount(): number {
    return this.legs.size;
  }

  /** Live legs one parent holds, or one of its environments when given
   * (diagnostics/tests). */
  usage(sessionId: string, environmentId?: string): EnvironmentProxyLegCounts {
    const tally =
      environmentId === undefined
        ? this.parentTallies.get(sessionId)
        : this.environmentTallies.get(environmentTallyKey(sessionId, environmentId));
    return { legs: tally?.legs ?? 0, bulkLegs: tally?.bulkLegs ?? 0 };
  }

  begin(sessionId: string, environmentId: string, target: EnvironmentProxyTarget): ActiveLeg {
    const controller = new AbortController();
    const onInvalidate = (): void => controller.abort();
    target.invalidation.addEventListener("abort", onInvalidate, { once: true });
    if (target.invalidation.aborted) controller.abort();
    const leg: ActiveLeg = { controller, sessionId, environmentId, target, onInvalidate };
    this.legs.set(controller, leg);
    return leg;
  }

  /**
   * One proxy leg consumes one slot of its parent's budget and of its
   * environment's share of it, one principal work admission, and one
   * principal socket admission. The work class is the shared inner-path
   * classification (proxied Stop/answer keeps the reserved control class at
   * every layer); the socket lease is the raw-proxy connection bound. The
   * leases and both budget slots are held until the leg's transport actually
   * settles, never released on the logical revoke call. Refusal is the
   * controller's typed 429 (`principal_busy` + Retry-After), and a refused
   * admission ends the leg before throwing.
   */
  admit(sessionId: string, workClass: IngressWorkClass, leg: ActiveLeg): EnvironmentProxyLegLeases {
    const bulk = workClass === "bulk";
    const environmentKey = environmentTallyKey(sessionId, leg.environmentId);
    const refusal = this.budgetRefusal(sessionId, environmentKey, bulk);
    if (refusal) {
      this.end(leg);
      throw refusal;
    }
    let work: PrincipalWorkLease;
    try {
      work = this.principalAdmission.tryAdmitWork(sessionId, workClass);
    } catch (error) {
      this.end(leg);
      throw error;
    }
    let socket: PrincipalSocketLease;
    try {
      socket = this.principalAdmission.tryAdmitSocket(sessionId);
    } catch (error) {
      work.release();
      this.end(leg);
      throw error;
    }
    const settleParent = countLeg(this.parentTallies, sessionId, bulk);
    const settleEnvironment = countLeg(this.environmentTallies, environmentKey, bulk);
    const settle = (field: keyof LegTally): void => {
      settleParent(field);
      settleEnvironment(field);
    };
    return {
      work: bulk ? releasingWith(work, () => settle("bulkLegs")) : work,
      socket: releasingWith(socket, () => settle("legs")),
    };
  }

  /** The typed overload for a leg its parent's budget or its environment's
   * share cannot admit, or null. */
  private budgetRefusal(
    sessionId: string,
    environmentKey: string,
    bulk: boolean,
  ): PrincipalOverloadError | null {
    const { retryAfterMs } = this.principalAdmission.limits;
    const parentLimit = exhaustedLimit(this.parentTallies.get(sessionId), this.budget.parent, bulk);
    if (parentLimit) {
      return new PrincipalOverloadError(
        parentLimit,
        "This paired client has too many environment requests in flight; retry shortly.",
        retryAfterMs,
      );
    }
    const environmentLimit = exhaustedLimit(
      this.environmentTallies.get(environmentKey),
      this.budget.environment,
      bulk,
    );
    if (environmentLimit) {
      return new PrincipalOverloadError(
        environmentLimit,
        "This environment has too many requests in flight; retry shortly.",
        retryAfterMs,
      );
    }
    return null;
  }

  end(leg: ActiveLeg, leases?: EnvironmentProxyLegLeases): void {
    leg.target.invalidation.removeEventListener("abort", leg.onInvalidate);
    this.legs.delete(leg.controller);
    leases?.socket.release();
    leases?.work.release();
  }

  /**
   * The per-target-generation keep-alive pool. A new generation (reconnect)
   * gets its own pool; invalidation destroys the old one, so a reconnected
   * environment can never reuse a socket from the previous tunnel.
   */
  agentFor(target: EnvironmentProxyTarget): Agent {
    const key = `${target.environmentId}\u0000${target.generation}`;
    const existing = this.agents.get(key);
    if (existing) return existing;
    const agent = new Agent(ENVIRONMENT_AGENT_OPTIONS);
    if (target.invalidation.aborted) {
      agent.destroy();
      return agent;
    }
    target.invalidation.addEventListener(
      "abort",
      () => {
        agent.destroy();
        this.agents.delete(key);
      },
      { once: true },
    );
    this.agents.set(key, agent);
    return agent;
  }
}
