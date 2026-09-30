import { describe, expect, it } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  createBackendDatabaseRequest,
  createBackendServiceRequest,
  isBackendHostRequest,
  isBackendHostOutboundMessage,
} from "./backendHostProtocol";

describe("backendHostProtocol", () => {
  it("accepts current database requests and rejects unknown names or versions", () => {
    const request = createBackendDatabaseRequest("id", "dbGetProjects", {});

    expect(isBackendHostRequest(request)).toBe(true);
    // The previous host generation still leaves durable routing writes to main.
    expect(isBackendHostRequest({ ...request, version: 6 })).toBe(false);
    // Older V2 hosts also cannot interpret authoritative replacements.
    expect(isBackendHostRequest({ ...request, version: 5 })).toBe(false);
    expect(isBackendHostRequest({ ...request, version: 0 })).toBe(false);
    expect(
      isBackendHostRequest({
        ...request,
        payload: { name: "delete-everything", payload: {} },
      }),
    ).toBe(false);
  });

  it("rejects replacement events from the previous host generation", () => {
    expect(
      isBackendHostOutboundMessage({
        version: 5,
        kind: "supervisor-event",
        event: {
          type: "thread-runtime-event",
          threadId: "thread-1",
          event: {
            type: "content.delta",
            itemId: "item-1",
            stream: "text",
            delta: "replacement",
            replace: true,
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts known backend services and rejects unknown privileged calls", () => {
    expect(
      isBackendHostRequest(createBackendServiceRequest("id", "getRemoteAccessPairing", {})),
    ).toBe(true);
    expect(
      isBackendHostRequest({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "id",
        operation: "call-service",
        payload: { name: "run-arbitrary-main-code", payload: {} },
      }),
    ).toBe(false);
  });

  it("fences settings commands and notifications from the previous ownership generation", () => {
    const request = createBackendServiceRequest("settings", "setAgentSecretSetting", {
      agentKind: "fixture-agent",
      key: "fixture-key",
      value: "fixture-secret",
    });
    const notification = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "native-event",
      event: { type: "shared-settings-changed", settings: {} },
    };
    expect(isBackendHostRequest(request)).toBe(true);
    expect(isBackendHostOutboundMessage(notification)).toBe(true);
    expect(isBackendHostRequest({ ...request, version: 6 })).toBe(false);
    expect(isBackendHostOutboundMessage({ ...notification, version: 6 })).toBe(false);
  });

  it("rejects malformed lifecycle env and outbound envelopes", () => {
    expect(
      isBackendHostRequest({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "id",
        operation: "start-supervisor",
        payload: { extraEnv: { VALID: 1 } },
      }),
    ).toBe(false);
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "reply",
        replyTo: "id",
        ok: false,
      }),
    ).toBe(false);
  });

  it("accepts bounded native thread-activity batches and rejects malformed changes", () => {
    const batch = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "native-thread-activity",
      changes: [
        { threadId: "thread-1", active: true },
        { threadId: "thread-2", active: false },
      ],
    };
    expect(isBackendHostOutboundMessage(batch)).toBe(true);
    expect(isBackendHostOutboundMessage({ ...batch, changes: [] })).toBe(true);
    expect(isBackendHostOutboundMessage({ ...batch, changes: [{ threadId: "thread-1" }] })).toBe(
      false,
    );
    expect(
      isBackendHostOutboundMessage({ ...batch, changes: [{ threadId: 1, active: true }] }),
    ).toBe(false);
    expect(
      isBackendHostOutboundMessage({ ...batch, changes: [{ threadId: "t", active: "yes" }] }),
    ).toBe(false);
    expect(isBackendHostOutboundMessage({ ...batch, changes: "thread-1" })).toBe(false);
    expect(
      isBackendHostOutboundMessage({ ...batch, version: BACKEND_HOST_PROTOCOL_VERSION - 1 }),
    ).toBe(false);
  });

  it("rejects the removed bulk relay vocabulary at every version (A2)", () => {
    // The relay, its renderer sequence, and its shed-gap recovery kind are
    // gone. A stale backend child still emitting them is rejected by the
    // version gate instead of having its bulk half-decoded and dropped.
    const relayed = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event: { type: "thread-state", threadId: "t1", status: "working" },
      rendererSequence: 42,
    };
    expect(isBackendHostOutboundMessage(relayed)).toBe(false);
    const gap = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event-gap",
      fromSequence: 12,
      toSequence: 40,
    };
    expect(isBackendHostOutboundMessage(gap)).toBe(false);
    const interests = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "id",
      operation: "set-event-interests",
      payload: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
    };
    expect(isBackendHostRequest(interests)).toBe(false);
    // The project mirror relay's native event is removed with the same
    // correction: full `Project[]` no longer crosses this hop, and a stale
    // child still emitting it is rejected rather than half-relayed to main.
    const projectsChanged = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "native-event",
      event: { type: "projects-changed", projects: [] },
    };
    expect(isBackendHostOutboundMessage(projectsChanged)).toBe(false);
    // The bounded tray refresh stays valid.
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "native-event",
        event: { type: "database-projection-changed" },
      }),
    ).toBe(true);
    for (const version of [5, 13, 14]) {
      expect(isBackendHostOutboundMessage({ ...relayed, version })).toBe(false);
      expect(isBackendHostOutboundMessage({ ...gap, version })).toBe(false);
      expect(isBackendHostRequest({ ...interests, version })).toBe(false);
    }
  });

  it("rejects the deleted renderer-stream leg at the current protocol version", () => {
    // V5 plan 2.5: the per-window delivery table and the recovery barrier
    // kind are GONE. A stale backend child that still speaks the deleted
    // operation (or any pre-14 version) fails the gates loudly instead of
    // half-serving a deleted transport.
    const request = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "id",
      operation: "set-renderer-stream-ownership",
      payload: { windows: [] },
    };
    expect(isBackendHostRequest(request)).toBe(false);
    for (const version of [3, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(isBackendHostRequest({ ...request, version })).toBe(false);
    }
    const recovery = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "renderer-stream-recovery",
      windowId: 3,
      generation: 1,
      fromSequence: 1,
      toSequence: 2,
    };
    expect(isBackendHostOutboundMessage(recovery)).toBe(false);
    for (const version of [3, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(isBackendHostOutboundMessage({ ...recovery, version })).toBe(false);
    }
  });

  it("validates the call-supervisor request shape", () => {
    const request = (payload: Record<string, unknown>): unknown => ({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "id",
      operation: "call-supervisor",
      payload,
    });
    expect(isBackendHostRequest(request({ id: "r1", type: "startShell", payload: {} }))).toBe(true);
    expect(isBackendHostRequest(request({ id: "r1", payload: {} }))).toBe(false);
    expect(isBackendHostRequest(request({ type: "startShell", payload: {} }))).toBe(false);
    expect(isBackendHostRequest(request({ id: "r1", type: "startShell" }))).toBe(false);
  });
});
