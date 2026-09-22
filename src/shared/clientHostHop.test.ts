import { describe, expect, it } from "vitest";
import { BACKEND_HOST_PROTOCOL_VERSION, isBackendHostOutboundMessage } from "./backendHostProtocol";
import {
  CLIENT_HOST_HOP_VERSION,
  PREVIOUS_CLIENT_HOST_HOP_VERSION,
  PREVIOUS_IPC_PROCEDURE_MAP_VERSION,
} from "./clientHostHop";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "./clientRuntime";
import { assertIpcProcedureMapVersion, IPC_PROCEDURE_MAP_VERSION } from "./ipc";

describe("CLIENT_HOST_HOP_VERSION (V6 B.5)", () => {
  it("is the single renderer→host stamp for runtime, IPC map, and backend-host protocol", () => {
    expect(PORACODE_CLIENT_RUNTIME_VERSION).toBe(CLIENT_HOST_HOP_VERSION);
    expect(IPC_PROCEDURE_MAP_VERSION).toBe(CLIENT_HOST_HOP_VERSION);
    expect(BACKEND_HOST_PROTOCOL_VERSION).toBe(CLIENT_HOST_HOP_VERSION);
  });

  it("keeps the previously published IPC map version as an old reader", () => {
    expect(PREVIOUS_IPC_PROCEDURE_MAP_VERSION).toBe(1);
    expect(PREVIOUS_IPC_PROCEDURE_MAP_VERSION).not.toBe(CLIENT_HOST_HOP_VERSION);
  });

  it("rejects a hop-15 pre-upgrade peer at the exchange gates, typed", () => {
    // Pre-upgrade regression (hop 16 removed `dbPersistExperimentState`): a
    // stale hop-15 bundle still dispatches the removed procedure name, so
    // every version gate must refuse that pairing instead of half-serving it.
    expect(PREVIOUS_CLIENT_HOST_HOP_VERSION).toBe(15);
    expect(PREVIOUS_CLIENT_HOST_HOP_VERSION).not.toBe(CLIENT_HOST_HOP_VERSION);
    expect(() => assertIpcProcedureMapVersion(PREVIOUS_CLIENT_HOST_HOP_VERSION)).toThrow(
      /IPC procedure map version mismatch/,
    );
    // Control: the same frame is valid with the current version, so the old
    // frame below is rejected for its version rather than its payload shape.
    expect(
      isBackendHostOutboundMessage({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        kind: "native-thread-activity",
        changes: [],
      }),
    ).toBe(true);
    // Backend⇄main leg: a hop-15 activity declaration is stale.
    expect(
      isBackendHostOutboundMessage({
        version: PREVIOUS_CLIENT_HOST_HOP_VERSION,
        kind: "native-thread-activity",
        changes: [],
      }),
    ).toBe(false);
  });
});
