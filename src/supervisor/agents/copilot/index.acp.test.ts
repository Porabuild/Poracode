import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base/types";
import { primeWslLaunchEnvironment } from "../base";
import { createCopilotAdapter } from "./index";

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

describe("createCopilotAdapter shared ACP process", () => {
  it("launches native GUI threads on the shared pooled-process factory", async () => {
    await createCopilotAdapter().createStructuredSession?.(guiInput({ model: "gpt-5.4" }));

    expect(mocks.createSharedAcpStructuredSession).toHaveBeenCalledTimes(1);
    const [command, input, shared, overrides] =
      mocks.createSharedAcpStructuredSession.mock.calls[0]!;
    expect(command).toMatchObject({
      args: expect.arrayContaining(["--acp", "--stdio"]),
    });
    expect((command as { args: string[] }).args).not.toContain("--yolo");
    expect(input).toMatchObject({ threadId: "t1" });
    expect(shared).toMatchObject({ scope: "copilot" });
    expect(overrides).toBeUndefined();
  });

  it("keeps the approval-policy --yolo flag on the pooled launch command", async () => {
    await createCopilotAdapter().createStructuredSession?.({
      ...guiInput({ model: "gpt-5.4" }),
      config: { model: "gpt-5.4", approvalPolicy: "never" } as ThreadConfig,
    });

    const [command] = mocks.createSharedAcpStructuredSession.mock.calls[0]!;
    expect((command as { args: string[] }).args).toContain("--yolo");
  });

  it("keeps WSL launches on the dedicated per-thread factory", async () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/u" });
    await createCopilotAdapter().createStructuredSession?.({
      ...guiInput({ model: "gpt-5.4" }),
      projectLocation: wslLocation,
    });

    expect(mocks.createSharedAcpStructuredSession).not.toHaveBeenCalled();
    expect(mocks.createAcpStructuredSession).toHaveBeenCalledTimes(1);
    expect(mocks.createAcpStructuredSession.mock.calls[0]?.[1]).toMatchObject({
      threadId: "t1",
    });
  });

  it("shuts down the shared pool scoped to its own kind", async () => {
    await createCopilotAdapter().shutdown?.();
    expect(mocks.shutdownSharedAcpProcesses).toHaveBeenCalledExactlyOnceWith("copilot");
  });
});
