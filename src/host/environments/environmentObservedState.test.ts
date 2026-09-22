import { describe, expect, it } from "vitest";
import type {
  EnvironmentProjection,
  EnvironmentPublicProjection,
  EnvironmentRuntime,
} from "@/shared/environments";
import type { RemoteEnvironmentDescriptor } from "@/shared/remote/protocol";
import {
  EnvironmentObservedState,
  type VerifiedTargetState,
  isEnvironmentCancellation,
} from "./environmentObservedState";
import { EnvironmentRuntimeError, environmentAbortError } from "./environmentRuntimeErrors";

const environmentId = "11111111-1111-4111-8111-111111111111";
const otherEnvironmentId = "22222222-2222-4222-8222-222222222222";
const fingerprint = `SHA256:${"A".repeat(43)}`;

function projectionSnapshot(): EnvironmentProjection {
  return {
    environmentId,
    revision: 1,
    label: "Lab",
    target: "dev@host.example",
    trust: { state: "pinned", hostKeyFingerprint: fingerprint },
    runtime: { hash: "a".repeat(64) },
    credential: "none",
    legacyConnectionIds: [],
    desired: "enabled",
    createdAt: 1,
    updatedAt: 1,
  };
}

class ProjectionSource {
  projection: EnvironmentProjection | undefined = projectionSnapshot();

  getPublic(id: string): EnvironmentProjection | undefined {
    return id === this.projection?.environmentId ? this.projection : undefined;
  }
}

function descriptor(): RemoteEnvironmentDescriptor {
  return {
    protocolVersion: 12,
    hostMode: "helper",
    desktopId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    label: "Remote",
    appVersion: "1.0.0",
    platform: "linux",
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      scopes: ["session:read"],
    },
    endpoints: { httpBaseUrl: "http://127.0.0.1:5555/", wsBaseUrl: "ws://127.0.0.1:5555/" },
  };
}

let targetCounter = 0;

function target(connectionId = `connection-${++targetCounter}`): VerifiedTargetState {
  const runtime: EnvironmentRuntime = { hash: "a".repeat(64) };
  return {
    connectionId,
    endpoint: "http://127.0.0.1:5555/",
    remotePort: 5555,
    runtimeHash: runtime.hash,
    childDesktopId: descriptor().desktopId,
    descriptor: descriptor(),
    invalidation: new AbortController(),
  };
}

function stateAndSource(): { state: EnvironmentObservedState; source: ProjectionSource } {
  const source = new ProjectionSource();
  return { state: new EnvironmentObservedState(source), source };
}

function notFoundFrom(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("EnvironmentObservedState overlay", () => {
  it("reports an unobserved environment as disconnected and freezes the value", () => {
    const { state } = stateAndSource();
    const value: EnvironmentPublicProjection = state.requirePublic(environmentId);
    expect(value.state).toBe("disconnected");
    expect(value.lastError).toBeUndefined();
    expect(Object.isFrozen(value)).toBe(true);
    expect(value.runtime.hash).toBe("a".repeat(64));
  });

  it("overlays the observed state and last error on the durable projection", () => {
    const { state } = stateAndSource();
    state.transition(environmentId, { state: "connecting" });
    state.fail(environmentId, new EnvironmentRuntimeError("environment/identity-changed"));
    const value = state.requirePublic(environmentId);
    expect(value.state).toBe("identity-changed");
    expect(value.lastError).toEqual({
      code: "environment/identity-changed",
      message: "The remote child identity changed; access was closed.",
    });
    state.transition(environmentId, { state: "connecting" });
    expect(state.requirePublic(environmentId).lastError).toBeUndefined();
  });

  it("throws the bounded not-found error for an unknown environment", () => {
    const { state, source } = stateAndSource();
    source.projection = undefined;
    const error = notFoundFrom(() => state.requirePublic(environmentId));
    expect(error).toBeInstanceOf(EnvironmentRuntimeError);
    expect((error as EnvironmentRuntimeError).code).toBe("environment/not-found");
  });
});

describe("EnvironmentObservedState custody", () => {
  it("releases only the owning environment and keeps a foreign claim", () => {
    const { state } = stateAndSource();
    state.claim("connection-1", environmentId);
    state.releaseIfOwned("connection-1", otherEnvironmentId);
    expect(state.owns("connection-1")).toBe(true);
    state.releaseIfOwned("connection-1", environmentId);
    expect(state.owns("connection-1")).toBe(false);
    state.releaseIfOwned("connection-1", environmentId);
    expect(state.owns("connection-1")).toBe(false);
  });

  it("lists custody pairs in insertion order", () => {
    const { state } = stateAndSource();
    state.claim("connection-1", environmentId);
    state.claim("connection-2", otherEnvironmentId);
    expect(state.ownedConnections()).toEqual([
      { connectionId: "connection-1", environmentId },
      { connectionId: "connection-2", environmentId: otherEnvironmentId },
    ]);
  });

  it("drops the observed entry on forget but leaves custody untouched", () => {
    const { state } = stateAndSource();
    state.claim("connection-1", environmentId);
    state.transition(environmentId, { state: "connecting" });
    expect(state.pendingEnvironmentIds()).toEqual([environmentId]);
    state.forget(environmentId);
    expect(state.pendingEnvironmentIds()).toEqual([]);
    expect(state.requirePublic(environmentId).state).toBe("disconnected");
    expect(state.owns("connection-1")).toBe(true);
  });
});

describe("EnvironmentObservedState verified target", () => {
  it("bumps the generation exactly once per publish, transition, and invalidation", () => {
    const { state } = stateAndSource();
    const published = target("connection-1");
    state.publishTarget(environmentId, published);
    state.transition(environmentId, { state: "connected" });
    let verified = state.getVerifiedTarget(environmentId);
    expect(verified.generation).toBe(2);
    expect(verified.connectionId).toBe("connection-1");
    verified.assertCurrent();

    state.invalidateTarget(environmentId, "The environment was disconnected.");
    expect(published.invalidation.signal.aborted).toBe(true);
    const replacement = target("connection-2");
    state.publishTarget(environmentId, replacement);
    state.transition(environmentId, { state: "connected" });
    verified = state.getVerifiedTarget(environmentId);
    expect(verified.generation).toBe(5);
    expect(() => verified.assertCurrent()).not.toThrow();
  });

  it("fences a stale target after the environment transitions away from connected", () => {
    const { state } = stateAndSource();
    const published = target("connection-1");
    state.publishTarget(environmentId, published);
    state.transition(environmentId, { state: "connected" });
    const verified = state.getVerifiedTarget(environmentId);
    state.transition(environmentId, { state: "disconnected" });
    expect(published.invalidation.signal.aborted).toBe(true);
    expect(notFoundFrom(() => verified.assertCurrent())).toBeInstanceOf(EnvironmentRuntimeError);
    expect(notFoundFrom(() => state.getVerifiedTarget(environmentId))).toBeInstanceOf(
      EnvironmentRuntimeError,
    );
  });

  it("does not serve a target while the state is not connected", () => {
    const { state } = stateAndSource();
    state.publishTarget(environmentId, target("connection-1"));
    state.transition(environmentId, { state: "connecting" });
    expect(notFoundFrom(() => state.getVerifiedTarget(environmentId))).toBeInstanceOf(
      EnvironmentRuntimeError,
    );
  });

  it("aborts and releases the replaced target on a connection change", () => {
    const { state } = stateAndSource();
    const first = target("connection-1");
    state.publishTarget(environmentId, first);
    state.transition(environmentId, { state: "connected" });
    const second = target("connection-2");
    state.publishTarget(environmentId, second);
    state.transition(environmentId, { state: "connected" });
    expect(first.invalidation.signal.aborted).toBe(true);
    expect(second.invalidation.signal.aborted).toBe(false);
    expect(state.owns("connection-1")).toBe(false);
    expect(state.owns("connection-2")).toBe(true);
  });

  it("keeps a republished target object and its invalidation alive", () => {
    const { state } = stateAndSource();
    const current = target("connection-1");
    state.publishTarget(environmentId, current);
    state.transition(environmentId, { state: "connected" });
    state.publishTarget(environmentId, current);
    state.transition(environmentId, { state: "connected" });
    expect(current.invalidation.signal.aborted).toBe(false);
    expect(state.getVerifiedTarget(environmentId).generation).toBe(4);
  });

  it("invalidates a target before dropping it and is a no-op without one", () => {
    const { state } = stateAndSource();
    state.invalidateTarget(environmentId, "nothing to invalidate");
    expect(state.pendingEnvironmentIds()).toEqual([]);

    const published = target("connection-1");
    state.publishTarget(environmentId, published);
    state.invalidateTarget(environmentId, "The environment was disconnected.");
    expect(published.invalidation.signal.aborted).toBe(true);
    expect(state.owns("connection-1")).toBe(true);
  });
});

describe("EnvironmentObservedState failures", () => {
  it("ignores an owned cancellation", () => {
    const { state } = stateAndSource();
    state.transition(environmentId, { state: "connecting" });
    const returned = state.failUnlessCancelled(environmentId, environmentAbortError("stop"));
    expect(returned.code).toBe("environment/cancelled");
    expect(state.requirePublic(environmentId).state).toBe("connecting");
    expect(state.requirePublic(environmentId).lastError).toBeUndefined();
  });

  it("maps a non-cancellation failure through the bounded state category", () => {
    const { state } = stateAndSource();
    const returned = state.failUnlessCancelled(environmentId, new Error("boom"));
    expect(returned.code).toBe("environment/transport-error");
    expect(state.requirePublic(environmentId).state).toBe("error");
  });

  it("classifies cancellations consistently for the service call sites", () => {
    expect(isEnvironmentCancellation(environmentAbortError("stop"))).toBe(true);
    expect(isEnvironmentCancellation(new EnvironmentRuntimeError("environment/cancelled"))).toBe(
      true,
    );
    expect(
      isEnvironmentCancellation(new EnvironmentRuntimeError("environment/not-connected")),
    ).toBe(false);
  });
});

describe("EnvironmentObservedState tunnel exit", () => {
  it("ignores an unowned connection and a stale target on another connection", () => {
    const { state } = stateAndSource();
    state.handleTunnelExit("unknown");
    expect(state.pendingEnvironmentIds()).toEqual([]);

    const published = target("connection-1");
    state.publishTarget(environmentId, published);
    state.transition(environmentId, { state: "connected" });
    state.claim("connection-2", environmentId);
    state.handleTunnelExit("connection-2");
    expect(() => state.getVerifiedTarget(environmentId)).not.toThrow();
    expect(published.invalidation.signal.aborted).toBe(false);
  });

  it("invalidates only the owning entry whose target matches the exited connection", () => {
    const { state } = stateAndSource();
    const published = target("connection-1");
    state.publishTarget(environmentId, published);
    state.transition(environmentId, { state: "connected" });
    state.handleTunnelExit("connection-1");
    expect(published.invalidation.signal.aborted).toBe(true);
    expect(state.requirePublic(environmentId).state).toBe("disconnected");
    expect(notFoundFrom(() => state.getVerifiedTarget(environmentId))).toBeInstanceOf(
      EnvironmentRuntimeError,
    );
    expect(state.owns("connection-1")).toBe(true);
  });
});
