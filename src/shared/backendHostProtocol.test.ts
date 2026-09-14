import { describe, expect, it } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  createBackendDatabaseRequest,
  createBackendServiceRequest,
  isBackendHostRequest,
  isBackendHostOutboundMessage,
  isRendererWindowDeliveryState,
  isRendererStreamOwnershipGrant,
  isRendererStreamOwnershipClaim,
  isRendererStreamRecoveryBarrier,
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

  it("rejects every previous artifact version of the delivery-ownership boundary", () => {
    // Reserved-and-superseded versions (7 shipped, 8-12 reserved, 13 current)
    // must fail the request gate loudly: a stale host child would otherwise
    // silently misroute per-window fallback traffic.
    const request = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "id",
      operation: "set-renderer-stream-ownership",
      payload: { windows: [] },
    };
    expect(isBackendHostRequest(request)).toBe(true);
    for (const version of [3, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(isBackendHostRequest({ ...request, version })).toBe(false);
    }
    const outbound = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "renderer-stream-recovery",
      windowId: 3,
      generation: 1,
      fromSequence: 1,
      toSequence: 2,
    };
    expect(isBackendHostOutboundMessage(outbound)).toBe(true);
    for (const version of [3, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(isBackendHostOutboundMessage({ ...outbound, version })).toBe(false);
    }
  });

  it("validates the per-window delivery table, grants, claims, and recovery barriers", () => {
    const grant = { windowId: 3, generation: 1, binding: "b-3" };
    const interests = { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false };
    const request = (windows: unknown): unknown => ({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "id",
      operation: "set-renderer-stream-ownership",
      payload: { windows },
    });
    expect(
      isBackendHostRequest(
        request([{ windowId: 3, grant, interests, receivesShellRemainder: false }]),
      ),
    ).toBe(true);
    expect(
      isBackendHostRequest(
        request([{ windowId: 3, grant, interests, receivesShellRemainder: true }]),
      ),
    ).toBe(true);
    // Every registered window carries a minted grant: a grant-less sentinel
    // has no supported producer and is rejected with the whole push.
    expect(isBackendHostRequest(request([{ windowId: 3, grant: null, interests }]))).toBe(false);
    expect(isBackendHostRequest(request([{ windowId: 3, grant, interests }]))).toBe(false);
    expect(
      isBackendHostRequest(
        request([{ windowId: 4, grant, interests, receivesShellRemainder: false }]),
      ),
    ).toBe(false);
    expect(
      isBackendHostRequest(
        request([
          {
            windowId: 3,
            grant: { ...grant, binding: "" },
            interests,
            receivesShellRemainder: false,
          },
        ]),
      ),
    ).toBe(false);
    expect(
      isBackendHostRequest(
        request([
          {
            windowId: 3,
            grant: { ...grant, generation: 0 },
            interests,
            receivesShellRemainder: false,
          },
        ]),
      ),
    ).toBe(false);
    expect(
      isBackendHostRequest(
        request([
          {
            windowId: 3,
            grant: null,
            interests: { allRuntimeEvents: false },
            receivesShellRemainder: false,
          },
        ]),
      ),
    ).toBe(false);

    expect(
      isRendererWindowDeliveryState({
        windowId: 3,
        grant,
        interests,
        receivesShellRemainder: true,
      }),
    ).toBe(true);
    expect(isRendererWindowDeliveryState({ windowId: 3, grant, interests })).toBe(false);
    expect(
      isRendererWindowDeliveryState({
        windowId: 3,
        grant,
        interests,
        receivesShellRemainder: "no",
      }),
    ).toBe(false);

    expect(isRendererStreamOwnershipGrant(grant)).toBe(true);
    expect(isRendererStreamOwnershipGrant({ ...grant, windowId: 0 })).toBe(false);
    expect(isRendererStreamOwnershipGrant({ ...grant, binding: "x".repeat(257) })).toBe(false);
    expect(isRendererStreamOwnershipClaim({ windowId: 3, generation: 2 })).toBe(true);
    expect(isRendererStreamOwnershipClaim({ windowId: 3, generation: 0 })).toBe(false);

    const barrier = {
      windowId: 3,
      generation: 1,
      fromSequence: 1,
      toSequence: 4,
      threadIds: ["thread-1"],
    };
    expect(isRendererStreamRecoveryBarrier(barrier)).toBe(true);
    expect(isRendererStreamRecoveryBarrier({ ...barrier, threadIds: [1] })).toBe(false);
    expect(isRendererStreamRecoveryBarrier({ ...barrier, fromSequence: 5 })).toBe(false);
    expect(isRendererStreamRecoveryBarrier({ ...barrier, windowId: -1 })).toBe(false);
    // Targets and barriers always fence to a real minted generation.
    expect(isRendererStreamRecoveryBarrier({ ...barrier, generation: 0 })).toBe(false);

    const targeted = {
      version: BACKEND_HOST_PROTOCOL_VERSION,
      kind: "supervisor-event",
      event: { type: "git-changed", projectId: "p" },
      rendererSequence: 4,
      target: { windowId: 3, generation: 1 },
    };
    expect(isBackendHostOutboundMessage(targeted)).toBe(true);
    expect(
      isBackendHostOutboundMessage({ ...targeted, target: { windowId: 0, generation: 1 } }),
    ).toBe(false);
    expect(
      isBackendHostOutboundMessage({ ...targeted, target: { windowId: 3, generation: 0 } }),
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
