// Preload-boundary regression for the standalone attach getter.
//
// Exercises the ACTUAL method exposed by src/main/preload.ts through a
// captured contextBridge, not a fake renderer host: explicit null (managed)
// and valid payloads pass through, while undefined/schema-invalid replies
// reject fail-closed (the renderer must refuse, never install managed).
// Thrown IPC rejections are forwarded unchanged.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";

const electron = vi.hoisted(() => {
  let exposed: Record<string, unknown> = {};
  const invokeImpl: { current: (channel: string) => Promise<unknown> } = {
    current: async () => null,
  };
  return {
    exposed: () => exposed,
    setInvoke: (fn: (channel: string) => Promise<unknown>) => {
      invokeImpl.current = fn;
    },
    contextBridge: {
      exposeInMainWorld: vi.fn<(key: string, value: Record<string, unknown>) => void>(
        (key: string, value: Record<string, unknown>) => {
          if (key === "poracodeHost") exposed = value;
        },
      ),
    },
    ipcRenderer: {
      invoke: vi.fn<(channel: string) => Promise<unknown>>((channel: string) =>
        invokeImpl.current(channel),
      ),
      on: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
    },
    webUtils: {
      getPathForFile: vi.fn<(file: { path?: string }) => string>(() => ""),
    },
  };
});
vi.mock("electron", () => ({
  contextBridge: electron.contextBridge,
  ipcRenderer: electron.ipcRenderer,
  webUtils: electron.webUtils,
}));
vi.mock("./testing/smokeNativeControls", () => ({
  installSmokeNativePreload: vi.fn<() => void>(),
}));

function validAttachInfo() {
  return {
    profileNamespace: "/tmp/profile",
    dataRoot: "/tmp/profile.host-v1",
    endpoint: "http://127.0.0.1:49152/",
    ownerGeneration: "11111111-1111-4111-8111-111111111111",
    remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    pairingUrl: "http://127.0.0.1:49152/#token=fixture-pairing-credential",
  };
}

type AttachGetter = () => Promise<unknown>;

async function exposedGetter(): Promise<AttachGetter> {
  // The preload reads document.readyState at import; a complete stub keeps the
  // import side-effect free in the node test environment.
  (globalThis as { document?: unknown }).document ??= { readyState: "complete" };
  await import("./preload");
  const exposed = electron.exposed() as { getStandaloneAttachInfo?: unknown };
  expect(exposed.getStandaloneAttachInfo).toBeTypeOf("function");
  return exposed.getStandaloneAttachInfo as AttachGetter;
}

describe("preload getStandaloneAttachInfo boundary", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("passes explicit null through as managed", async () => {
    electron.setInvoke(async () => null);
    await expect(exposedGetter().then((get) => get())).resolves.toBeNull();
  });

  it("passes a valid payload through", async () => {
    electron.setInvoke(async () => validAttachInfo());
    await expect(exposedGetter().then((get) => get())).resolves.toMatchObject({
      ownerGeneration: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("rejects undefined instead of coercing to managed null", async () => {
    electron.setInvoke(async () => undefined);
    await expect(exposedGetter().then((get) => get())).rejects.toThrow(
      "Invalid standalone attach configuration",
    );
  });

  it("rejects schema-invalid payloads instead of coercing to managed null", async () => {
    electron.setInvoke(async () => ({ ...validAttachInfo(), endpoint: "not-a-url" }));
    await expect(exposedGetter().then((get) => get())).rejects.toThrow(
      "Invalid standalone attach configuration",
    );
  });

  it("forwards thrown IPC rejections unchanged", async () => {
    electron.setInvoke(async () => {
      throw new Error("attach IPC failed");
    });
    await expect(exposedGetter().then((get) => get())).rejects.toThrow("attach IPC failed");
  });
});
