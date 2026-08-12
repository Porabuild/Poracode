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
    expect(isBackendHostRequest({ ...request, version: 0 })).toBe(false);
    expect(
      isBackendHostRequest({
        ...request,
        payload: { name: "delete-everything", payload: {} },
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
});
