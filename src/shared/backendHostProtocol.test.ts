import { describe, expect, it } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  createBackendDatabaseRequest,
  createBackendServiceRequest,
  isBackendHostRequest,
  isBackendHostOutboundMessage,
  isSupervisorEventGap,
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
      isBackendHostRequest({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "id",
        operation: "set-event-interests",
        payload: {
          terminalThreadIds: ["thread-1"],
          runtimeThreadIds: [1],
          allRuntimeEvents: false,
        },
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

  it("accepts sequenced renderer fallback events and rejects invalid cursors", () => {
    const event = { type: "git-changed", projectId: "project" };
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event,
        rendererSequence: 42,
      }),
    ).toBe(true);
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event,
        rendererSequence: 1.5,
      }),
    ).toBe(false);
  });

  it("accepts shed-recovery gap signals only at the current protocol version", () => {
    // The gap kind is the desktop-IPC shed recovery contract. A reader that
    // predates it would silently drop the unknown kind and re-open the
    // silent-loss window, so stale-version envelopes are rejected loudly.
    const gap = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event-gap",
      fromSequence: 12,
      toSequence: 40,
    };
    expect(isBackendHostOutboundMessage(gap)).toBe(true);
    expect(
      isBackendHostOutboundMessage({ ...gap, version: BACKEND_HOST_PROTOCOL_VERSION - 1 }),
    ).toBe(false);
    expect(isBackendHostOutboundMessage({ ...gap, fromSequence: 41 })).toBe(false);
    expect(isBackendHostOutboundMessage({ ...gap, toSequence: 12.5 })).toBe(false);
    expect(isBackendHostOutboundMessage({ ...gap, fromSequence: -1 })).toBe(false);
    expect(isBackendHostOutboundMessage({ ...gap, toSequence: "40" })).toBe(false);
    expect(isSupervisorEventGap({ fromSequence: 0, toSequence: 0 })).toBe(true);
    expect(isSupervisorEventGap({ fromSequence: 5 })).toBe(false);
    expect(isSupervisorEventGap(null)).toBe(false);
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

  it("rejects targeted delivery metadata on supervisor-event envelopes", () => {
    // The targeted copy contract was deleted with the stream: an envelope
    // pretending to address one window is no longer a valid message.
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "supervisor-event",
        event: { type: "git-changed", projectId: "project" },
        rendererSequence: 1,
        target: { windowId: 3, generation: 1 },
      }),
    ).toBe(false);
  });

  it("validates the call-supervisor origin window", () => {
    const request = (payload: Record<string, unknown>): unknown => ({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "id",
      operation: "call-supervisor",
      payload,
    });
    expect(isBackendHostRequest(request({ id: "r1", type: "startShell", payload: {} }))).toBe(true);
    expect(
      isBackendHostRequest(
        request({ id: "r1", type: "startShell", payload: {}, originWindowId: 7 }),
      ),
    ).toBe(true);
    expect(
      isBackendHostRequest(
        request({ id: "r1", type: "startShell", payload: {}, originWindowId: 0 }),
      ),
    ).toBe(false);
    expect(
      isBackendHostRequest(
        request({ id: "r1", type: "startShell", payload: {}, originWindowId: -3 }),
      ),
    ).toBe(false);
    expect(
      isBackendHostRequest(
        request({ id: "r1", type: "startShell", payload: {}, originWindowId: "7" }),
      ),
    ).toBe(false);
  });
});
