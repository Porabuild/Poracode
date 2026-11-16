import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base/types";
import { primeWslLaunchEnvironment } from "../base";
import { createKimiAdapter } from "./index";
import { resolveKimiAcpMode } from "./argv";

const mocks = vi.hoisted(() => {
  const createAcpStructuredSession = vi.fn<(...args: unknown[]) => unknown>(() => undefined);
  // The shared factory's fourth argument is the adapter overrides; delegate
  // to the dedicated mock so existing call-shape assertions keep working
  // while the shared mock records scope/prepare/unaddressedRequests itself.
  const createSharedAcpStructuredSession = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async (command: unknown, input: unknown, _shared: unknown, overrides: unknown) =>
      createAcpStructuredSession(command, input, overrides),
  );
  const backgroundBridgeDispose = vi.fn<() => void>();
  return {
    createAcpStructuredSession,
    createSharedAcpStructuredSession,
    shutdownSharedAcpProcesses: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    ensureKimiWorkspaceTrust: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    createKimiBackgroundBridge: vi.fn<(...args: unknown[]) => unknown>(() => ({
      onBackgroundLaunch: vi.fn<(...args: unknown[]) => void>(),
      dispose: backgroundBridgeDispose,
    })),
    backgroundBridgeDispose,
  };
});

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  createAcpStructuredSession: mocks.createAcpStructuredSession,
  createSharedAcpStructuredSession: mocks.createSharedAcpStructuredSession,
  shutdownSharedAcpProcesses: mocks.shutdownSharedAcpProcesses,
}));
vi.mock("./kimiTrust", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./kimiTrust")>()),
  ensureKimiWorkspaceTrust: mocks.ensureKimiWorkspaceTrust,
}));
vi.mock("./backgroundBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./backgroundBridge")>()),
  createKimiBackgroundBridge: mocks.createKimiBackgroundBridge,
}));

const guiInput = (config: Partial<ThreadConfig> & { model: string }) =>
  ({
    threadId: "t1",
    projectLocation: { kind: "posix" as const, path: "/project" },
    config: { ...config } as ThreadConfig,
    presentationMode: "gui" as const,
  }) satisfies CreateStructuredSessionInput;

const wslLocation = {
  kind: "wsl" as const,
  distro: "Ubuntu",
  linuxPath: "/home/u/repo",
  uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\repo",
};

describe("createKimiAdapter shared ACP process", () => {
  it("launches native GUI threads on the shared pooled-process factory", async () => {
    await createKimiAdapter().createStructuredSession?.(guiInput({ model: "kimi-for-coding" }));

    expect(mocks.createSharedAcpStructuredSession).toHaveBeenCalledTimes(1);
    const [command, input, shared, overrides] =
      mocks.createSharedAcpStructuredSession.mock.calls[0]!;
    expect(command).toBeDefined();
    expect(input).toMatchObject({
      threadId: "t1",
      acpOptimisticMcpTransports: ["stdio"],
      acpFsTextCapability: false,
      acpEmptyResponseErrorResolver: expect.any(Function),
      acpSessionUpdateTransform: expect.any(Function),
    });
    expect(shared).toMatchObject({ scope: "kimi" });
    expect(overrides).toEqual({
      behavior: { disableSyntheticPermissionAutoApproval: true },
      resolveMode: resolveKimiAcpMode,
    });
  });

  it("keeps WSL launches on the dedicated per-thread factory", async () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/u" });
    await createKimiAdapter().createStructuredSession?.({
      ...guiInput({ model: "kimi-for-coding" }),
      projectLocation: wslLocation,
    });

    expect(mocks.createSharedAcpStructuredSession).not.toHaveBeenCalled();
    expect(mocks.createAcpStructuredSession).toHaveBeenCalledTimes(1);
    expect(mocks.createAcpStructuredSession.mock.calls[0]?.[1]).toMatchObject({
      threadId: "t1",
      acpFsTextCapability: false,
    });
    expect(mocks.createAcpStructuredSession.mock.calls[0]?.[2]).toEqual({
      behavior: { disableSyntheticPermissionAutoApproval: true },
      resolveMode: resolveKimiAcpMode,
    });
  });

  it("disposes the background bridge when the shared factory returns no session", async () => {
    await expect(
      createKimiAdapter().createStructuredSession?.(guiInput({ model: "kimi-for-coding" })),
    ).resolves.toBeUndefined();
    expect(mocks.backgroundBridgeDispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the background bridge when the shared factory throws", async () => {
    mocks.createSharedAcpStructuredSession.mockRejectedValueOnce(new Error("pool exhausted"));
    await expect(
      createKimiAdapter().createStructuredSession?.(guiInput({ model: "kimi-for-coding" })),
    ).rejects.toThrow("pool exhausted");
    expect(mocks.backgroundBridgeDispose).toHaveBeenCalledTimes(1);
  });

  it("shuts down the shared pool scoped to its own kind", async () => {
    await createKimiAdapter().shutdown?.();
    expect(mocks.shutdownSharedAcpProcesses).toHaveBeenCalledExactlyOnceWith("kimi");
  });
});
