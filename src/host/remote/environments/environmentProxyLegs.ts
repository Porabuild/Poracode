import { Agent } from "node:http";
import type { IngressWorkClass } from "../remoteAccessServerTypes";
import type {
  PrincipalAdmissionController,
  PrincipalSocketLease,
  PrincipalWorkLease,
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

export class EnvironmentProxyLegs {
  private readonly principalAdmission: PrincipalAdmissionController;
  private readonly legs = new Map<AbortController, ActiveLeg>();
  private readonly agents = new Map<string, Agent>();

  constructor(principalAdmission: PrincipalAdmissionController) {
    this.principalAdmission = principalAdmission;
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
   * One proxy leg consumes one principal work admission and one principal
   * socket admission. The work class is the shared inner-path classification
   * (proxied Stop/answer keeps the reserved control class at this layer too);
   * the socket lease is the raw-proxy connection bound: held until the leg's
   * transport actually settles, never released on the logical revoke call.
   * Refusal is a typed 429 from the existing controller — there is no
   * per-environment socket budget. A refused admission ends the leg before
   * throwing.
   */
  admit(sessionId: string, workClass: IngressWorkClass, leg: ActiveLeg): EnvironmentProxyLegLeases {
    let work: PrincipalWorkLease;
    try {
      work = this.principalAdmission.tryAdmitWork(sessionId, workClass);
    } catch (error) {
      this.end(leg);
      throw error;
    }
    try {
      const socket = this.principalAdmission.tryAdmitSocket(sessionId);
      return { work, socket };
    } catch (error) {
      work.release();
      this.end(leg);
      throw error;
    }
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
