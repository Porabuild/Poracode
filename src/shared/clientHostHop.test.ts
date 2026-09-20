import { describe, expect, it } from "vitest";
import { BACKEND_HOST_PROTOCOL_VERSION } from "./backendHostProtocol";
import { CLIENT_HOST_HOP_VERSION, PREVIOUS_IPC_PROCEDURE_MAP_VERSION } from "./clientHostHop";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "./clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "./ipc";

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
});
