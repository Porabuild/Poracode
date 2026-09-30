import {
  environmentPublicProjectionSchema,
  type EnvironmentProjection,
  type EnvironmentPublicError,
  type EnvironmentPublicProjection,
  type EnvironmentRuntimeState,
} from "@/shared/environments";
import type { RemoteEnvironmentDescriptor } from "@/shared/remote/protocol";
import type { EnvironmentStore } from "./EnvironmentStore";
import { deepFreeze } from "./environmentProjection";
import {
  EnvironmentRuntimeError,
  environmentAbortError,
  environmentRuntimeError,
  environmentStateForError,
  isEnvironmentAbortError,
} from "./environmentRuntimeErrors";

/**
 * The host-local observed runtime state for host-owned environments (ADR §2).
 *
 * This module is the single owner of everything the host observed but never
 * persisted: the runtime entry per environment (state, last public error,
 * published verified target), the monotonic per-environment `generation` the
 * parent proxy fences on, and the connection-custody map that ties a live SSH
 * child to the environment that owns it.
 *
 * The SSH dial stays in the runtime service: the service calls
 * {@link EnvironmentObservedState.claim}/{@link EnvironmentObservedState.releaseIfOwned}
 * around the transport it owns. This module never talks to a transport, the
 * store is used read-only for the durable projection, and it exposes no map.
 */

/**
 * An internal capability for the parent proxy. It is deliberately not part of
 * any public projection: endpoint/port stay host-local, and every consumer must
 * fence on `generation`/`assertCurrent` and watch `invalidation`.
 */
export interface EnvironmentVerifiedTarget {
  readonly environmentId: string;
  readonly generation: number;
  readonly connectionId: string;
  readonly endpoint: string;
  readonly remotePort: number;
  readonly runtimeHash: string;
  readonly childDesktopId: string;
  readonly descriptor: RemoteEnvironmentDescriptor;
  readonly invalidation: AbortSignal;
  assertCurrent(): void;
}

/**
 * The construction shape of a target the runtime service verified. It is
 * published exactly once through {@link EnvironmentObservedState.publishTarget};
 * the module owns its invalidation lifetime after that.
 */
export interface VerifiedTargetState {
  readonly connectionId: string;
  readonly endpoint: string;
  readonly remotePort: number;
  readonly runtimeHash: string;
  readonly childDesktopId: string;
  readonly descriptor: RemoteEnvironmentDescriptor;
  readonly invalidation: AbortController;
}

interface RuntimeEntry {
  state: EnvironmentRuntimeState;
  lastError?: EnvironmentPublicError;
  target?: VerifiedTargetState;
  generation: number;
}

/** One live connection-custody pair: the child and the environment that owns it. */
export interface EnvironmentOwnedConnection {
  readonly connectionId: string;
  readonly environmentId: string;
}

/** A cancellation is owned by the mutation/lifecycle, not a failure to report. */
export function isEnvironmentCancellation(error: unknown): boolean {
  return (
    isEnvironmentAbortError(error) ||
    (error instanceof EnvironmentRuntimeError && error.code === "environment/cancelled")
  );
}

/**
 * The only place an observed state transition or a custody claim is applied.
 * Every mutator bumps `generation` exactly once and aborts a replaced target
 * before dropping it, so a proxy holding a stale target can never act on it.
 */
export class EnvironmentObservedState {
  private readonly runtime = new Map<string, RuntimeEntry>();
  private readonly connectionOwners = new Map<string, string>();

  constructor(private readonly projections: Pick<EnvironmentStore, "getPublic">) {}

  /** Overlay the observed state on a durable projection (never persisted). */
  overlay(projection: EnvironmentProjection): EnvironmentPublicProjection {
    const entry = this.runtime.get(projection.environmentId);
    const value = environmentPublicProjectionSchema.parse({
      ...projection,
      state: entry?.state ?? "disconnected",
      ...(entry?.lastError === undefined ? {} : { lastError: entry.lastError }),
    });
    return deepFreeze(value);
  }

  /** The overlay for a known environment, or the bounded not-found failure. */
  requirePublic(environmentId: string): EnvironmentPublicProjection {
    const projection = this.projections.getPublic(environmentId);
    if (projection === undefined) throw new EnvironmentRuntimeError("environment/not-found");
    return this.overlay(projection);
  }

  /**
   * The verified target for the parent proxy, or `not-connected`. The returned
   * value is fenced on exactly this entry, generation, and target object.
   */
  getVerifiedTarget(environmentId: string): EnvironmentVerifiedTarget {
    const entry = this.runtime.get(environmentId);
    const target = entry?.target;
    if (entry === undefined || entry.state !== "connected" || target === undefined) {
      throw new EnvironmentRuntimeError("environment/not-connected");
    }
    const generation = entry.generation;
    const runtime = this.runtime;
    return Object.freeze({
      environmentId,
      generation,
      connectionId: target.connectionId,
      endpoint: target.endpoint,
      remotePort: target.remotePort,
      runtimeHash: target.runtimeHash,
      childDesktopId: target.childDesktopId,
      descriptor: target.descriptor,
      invalidation: target.invalidation.signal,
      assertCurrent(): void {
        const current = runtime.get(environmentId);
        if (
          current === undefined ||
          current.generation !== generation ||
          current.target !== target
        ) {
          throw new EnvironmentRuntimeError("environment/not-connected");
        }
      },
    });
  }

  // -------------------------------------------------------------------------
  // Connection custody (the SSH dial stays in the service)
  // -------------------------------------------------------------------------

  /** Register a live child handle as owned by the environment. */
  claim(connectionId: string, environmentId: string): void {
    this.connectionOwners.set(connectionId, environmentId);
  }

  owns(connectionId: string): boolean {
    return this.connectionOwners.has(connectionId);
  }

  /** Release only when this environment is the recorded owner of the handle. */
  releaseIfOwned(connectionId: string, environmentId: string): void {
    if (this.connectionOwners.get(connectionId) === environmentId) {
      this.connectionOwners.delete(connectionId);
    }
  }

  /** Custody pairs in insertion order; disposal retries each outstanding join. */
  ownedConnections(): readonly EnvironmentOwnedConnection[] {
    return Object.freeze(
      [...this.connectionOwners].map(([connectionId, environmentId]) => ({
        connectionId,
        environmentId,
      })),
    );
  }

  /** Environments with observed state; disposal invalidates each entry. */
  pendingEnvironmentIds(): readonly string[] {
    return Object.freeze([...this.runtime.keys()]);
  }

  /** Drop the observed entry after a confirmed durable delete. */
  forget(environmentId: string): void {
    this.runtime.delete(environmentId);
  }

  // -------------------------------------------------------------------------
  // Observed transitions (one generation bump per mutation)
  // -------------------------------------------------------------------------

  transition(
    environmentId: string,
    patch: { readonly state: EnvironmentRuntimeState; readonly lastError?: EnvironmentPublicError },
  ): void {
    const entry = this.ensureRuntimeEntry(environmentId);
    if (patch.state !== "connected" && entry.target !== undefined) {
      entry.target.invalidation.abort(
        environmentAbortError("The environment is no longer connected."),
      );
      delete entry.target;
    }
    entry.state = patch.state;
    if (patch.lastError === undefined) delete entry.lastError;
    else entry.lastError = patch.lastError;
    entry.generation += 1;
  }

  fail(environmentId: string, error: EnvironmentRuntimeError): void {
    this.transition(environmentId, {
      state: environmentStateForError(error),
      lastError: error.toPublicError(),
    });
  }

  /**
   * Report a bounded failure unless it is a cancellation owned by a mutation
   * or the service lifecycle; a cancellation must not turn the environment
   * into an error state behind the owner's back.
   */
  failUnlessCancelled(environmentId: string, error: unknown): EnvironmentRuntimeError {
    const runtimeError = environmentRuntimeError(error);
    if (!isEnvironmentCancellation(runtimeError)) this.fail(environmentId, runtimeError);
    return runtimeError;
  }

  publishTarget(environmentId: string, target: VerifiedTargetState): void {
    const entry = this.ensureRuntimeEntry(environmentId);
    if (entry.target !== undefined && entry.target !== target) {
      entry.target.invalidation.abort(environmentAbortError("The environment reconnected."));
      if (entry.target.connectionId !== target.connectionId) {
        this.connectionOwners.delete(entry.target.connectionId);
      }
    }
    entry.target = target;
    entry.state = "connected";
    delete entry.lastError;
    entry.generation += 1;
    this.connectionOwners.set(target.connectionId, environmentId);
  }

  invalidateTarget(environmentId: string, reason: string): void {
    const entry = this.runtime.get(environmentId);
    if (entry?.target === undefined) return;
    const target = entry.target;
    target.invalidation.abort(environmentAbortError(reason));
    delete entry.target;
    entry.generation += 1;
    // The connection-owner mapping is custody, not target state: a failed join
    // must keep it so the tunnel exit still routes and a retry can join.
  }

  /** A transport tunnel exit only ever touches the connection's owning entry. */
  handleTunnelExit(connectionId: string): void {
    const environmentId = this.connectionOwners.get(connectionId);
    if (environmentId === undefined) return;
    const entry = this.runtime.get(environmentId);
    if (entry?.target?.connectionId !== connectionId) return;
    this.invalidateTarget(environmentId, "The environment tunnel closed.");
    this.transition(environmentId, { state: "disconnected" });
  }

  private ensureRuntimeEntry(environmentId: string): RuntimeEntry {
    const existing = this.runtime.get(environmentId);
    if (existing !== undefined) return existing;
    const entry: RuntimeEntry = { state: "disconnected", generation: 0 };
    this.runtime.set(environmentId, entry);
    return entry;
  }
}
