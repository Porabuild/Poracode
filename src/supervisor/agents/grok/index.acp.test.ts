import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base/types";
import { primeWslLaunchEnvironment } from "../base";
import { createGrokAdapter } from "./index";

const mocks = vi.hoisted(() => {
  const createAcpStructuredSession = vi.fn<(...args: unknown[]) => unknown>(() => undefined);
  // The shared factory's fourth argument is the adapter overrides; delegate
  // to the dedicated mock so existing call-shape assertions keep working
  // while the shared mock records scope/prepare/unaddressedRequests itself.
  const createSharedAcpStructuredSession = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async (command: unknown, input: unknown, _shared: unknown, overrides: unknown) =>
      createAcpStructuredSession(command, input, overrides),
  );
  return {
    createAcpStructuredSession,
    createSharedAcpStructuredSession,
    shutdownSharedAcpProcesses: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  };
});

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  createAcpStructuredSession: mocks.createAcpStructuredSession,
  createSharedAcpStructuredSession: mocks.createSharedAcpStructuredSession,
  shutdownSharedAcpProcesses: mocks.shutdownSharedAcpProcesses,
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

describe("createGrokAdapter shared ACP process", () => {
  it("launches native GUI threads on the shared pooled-process factory", async () => {
    await createGrokAdapter().createStructuredSession?.(guiInput({ model: "grok-code-fast-1" }));

    expect(mocks.createSharedAcpStructuredSession).toHaveBeenCalledTimes(1);
    const [command, input, shared, overrides] =
      mocks.createSharedAcpStructuredSession.mock.calls[0]!;
    expect(command).toBeDefined();
    expect(input).toMatchObject({
      threadId: "t1",
      acpFsAgentHomeDirs: [".grok"],
      acpSessionUpdateTransform: expect.any(Function),
    });
    expect(shared).toMatchObject({ scope: "grok" });
    expect(overrides).toMatchObject({ resolveModelConfig: expect.any(Function) });
  });

  it("keeps WSL launches on the dedicated per-thread factory", async () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/u" });
    await createGrokAdapter().createStructuredSession?.({
      ...guiInput({ model: "grok-code-fast-1" }),
      projectLocation: wslLocation,
    });

    expect(mocks.createSharedAcpStructuredSession).not.toHaveBeenCalled();
    expect(mocks.createAcpStructuredSession).toHaveBeenCalledTimes(1);
    expect(mocks.createAcpStructuredSession.mock.calls[0]?.[1]).toMatchObject({
      threadId: "t1",
      acpFsAgentHomeDirs: [".grok"],
    });
    expect(mocks.createAcpStructuredSession.mock.calls[0]?.[2]).toMatchObject({
      resolveModelConfig: expect.any(Function),
    });
  });

  it("shuts down the shared pool scoped to its own kind", async () => {
    await createGrokAdapter().shutdown?.();
    expect(mocks.shutdownSharedAcpProcesses).toHaveBeenCalledExactlyOnceWith("grok");
  });
});
