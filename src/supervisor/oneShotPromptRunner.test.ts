import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      command: string,
      args: string[],
    ) => { command: string; args: string[]; cwd?: string }
  >(),
);

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));
vi.mock("./agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agents/base")>()),
  buildAgentCommand: buildAgentCommandMock,
}));

import {
  isArgvLikelyTooLong,
  isArgvTooLongError,
  runOneShotPromptWithFallback,
} from "./oneShotPromptRunner";

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { end: ReturnType<typeof vi.fn<(input?: string) => void>> };
  killed: boolean;
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn<(input?: string) => void>() };
  child.killed = false;
  return child;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setImmediate(resolve));
}

const windowsProject: ProjectLocation = {
  kind: "windows",
  path: "C:\\Users\\demo\\project",
};

// Adapter that embeds the prompt directly in argv (mirrors Claude/Gemini/Copilot).
function argvProneAdapter(): AgentAdapter {
  return {
    label: "ClaudeLike",
    defaultOneShotModel: "haiku",
    buildOneShotCommand: (model, _effort, prompt) => ({
      command: "claude",
      args: ["-p", prompt ?? "", "--model", model],
    }),
  } as AgentAdapter;
}

beforeEach(() => {
  vi.clearAllMocks();
  buildAgentCommandMock.mockImplementation(
    (location: ProjectLocation, command: string, args: string[]) =>
      location.kind === "wsl" ? { command, args } : { command, args, cwd: location.path },
  );
});

describe("isArgvTooLongError", () => {
  it("recognizes ENAMETOOLONG by code", () => {
    expect(isArgvTooLongError({ code: "ENAMETOOLONG" })).toBe(true);
  });

  it("recognizes E2BIG by code", () => {
    expect(isArgvTooLongError({ code: "E2BIG" })).toBe(true);
  });

  it("recognizes ENAMETOOLONG by message substring", () => {
    expect(isArgvTooLongError(new Error("spawn ENAMETOOLONG"))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isArgvTooLongError({ code: "ENOENT" })).toBe(false);
    expect(isArgvTooLongError(new Error("nope"))).toBe(false);
    expect(isArgvTooLongError(null)).toBe(false);
    expect(isArgvTooLongError(undefined)).toBe(false);
  });
});

describe("isArgvLikelyTooLong", () => {
  it("returns false for small specs", () => {
    expect(
      isArgvLikelyTooLong({ command: "claude", args: ["-p", "short", "--model", "haiku"] }),
    ).toBe(false);
  });

  it("returns true when a single argv string exceeds the per-arg budget", () => {
    // 250 KiB single argv string — over all platform per-arg budgets.
    const huge = "x".repeat(250_000);
    expect(isArgvLikelyTooLong({ command: "claude", args: ["-p", huge] })).toBe(true);
  });
});

describe("runOneShotPromptWithFallback", () => {
  it("forwards read-only workspace access to structured one-shot runtimes", async () => {
    const runOneShot = vi.fn<() => Promise<string>>().mockResolvedValue("ok");
    const adapter = {
      label: "Structured",
      runOneShot,
    } as unknown as AgentAdapter;

    await expect(
      runOneShotPromptWithFallback({
        location: windowsProject,
        adapter,
        model: "model",
        effort: undefined,
        timeoutMs: 10_000,
        logTag: "test",
        readOnlyWorkspace: true,
        attempts: [{ level: "artifacts", buildPrompt: () => "read the files" }],
      }),
    ).resolves.toBe("ok");

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        location: windowsProject,
        prompt: "read the files",
        readOnlyWorkspace: true,
      }),
    );
  });

  it("uses the full attempt when within the budget and spawn succeeds", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter: argvProneAdapter(),
      model: "haiku",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => "hello world" },
        { level: "slim", buildPrompt: () => "hi" },
      ],
    });
    await flushPromises();

    child.stdout.emit("data", Buffer.from("ok"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("ok");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(["-p", "hello world", "--model", "haiku"]);
  });

  it("keeps CLI judges in the isolated artifact workspace", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);
    const adapter = {
      label: "IsolatedByDefault",
      buildOneShotCommand: (_model: string, _effort?: string, prompt?: string) => ({
        command: "judge",
        args: ["-p", prompt ?? ""],
        isolateCwd: true,
      }),
    } as AgentAdapter;

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      model: "model",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      readOnlyWorkspace: true,
      attempts: [{ level: "artifacts", buildPrompt: () => "read solution-1.patch" }],
    });
    await flushPromises();
    child.stdout.emit("data", Buffer.from("ok"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("ok");
    expect(buildAgentCommandMock).toHaveBeenCalledWith(
      windowsProject,
      "judge",
      ["-p", "read solution-1.patch"],
      undefined,
      undefined,
    );
  });

  it("applies adapter baseSpawnEnv under the one-shot command env", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);
    const adapter = {
      label: "FactoryLike",
      baseSpawnEnv: { DROID_DISABLE_AUTO_UPDATE: "true" },
      buildOneShotCommand: (_model: string, _effort?: string, prompt?: string) => ({
        command: "droid",
        args: ["exec", prompt ?? ""],
        env: { DROID_DISABLE_AUTO_UPDATE: "false", LANE: "1" },
      }),
    } as unknown as AgentAdapter;

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      model: "model-a",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [{ level: "full", buildPrompt: () => "summarize" }],
    });
    await flushPromises();
    child.stdout.emit("data", Buffer.from("ok"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("ok");
    expect(buildAgentCommandMock).toHaveBeenCalledWith(
      windowsProject,
      "droid",
      ["exec", "summarize"],
      undefined,
      { DROID_DISABLE_AUTO_UPDATE: "false", LANE: "1" },
    );
  });

  it("proactively skips an attempt whose built argv exceeds the platform budget", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);

    // 300 KiB prompt — over per-arg budget on every platform.
    const fullPrompt = "p".repeat(300_000);

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter: argvProneAdapter(),
      model: "haiku",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => fullPrompt },
        { level: "slim", buildPrompt: () => "slim prompt" },
      ],
    });
    await flushPromises();

    child.stdout.emit("data", Buffer.from("trimmed"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("trimmed");
    // Only the slim attempt should have spawned.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(args[1]).toBe("slim prompt");
  });

  it("retries with the next attempt when spawn fails with ENAMETOOLONG", async () => {
    const first = createMockChildProcess();
    const second = createMockChildProcess();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter: argvProneAdapter(),
      model: "haiku",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => "would-be-huge" },
        { level: "slim", buildPrompt: () => "slim" },
      ],
    });
    await flushPromises();

    first.emit("error", Object.assign(new Error("spawn ENAMETOOLONG"), { code: "ENAMETOOLONG" }));
    await flushPromises();

    second.stdout.emit("data", Buffer.from("recovered"));
    second.emit("close", 0);

    await expect(pending).resolves.toBe("recovered");
    expect(spawnMock).toHaveBeenCalledTimes(2);
    const firstArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(firstArgs[1]).toBe("would-be-huge");
    const secondArgs = spawnMock.mock.calls[1]?.[1] as string[];
    expect(secondArgs[1]).toBe("slim");
  });

  it("throws when the final attempt also fails with ENAMETOOLONG", async () => {
    const first = createMockChildProcess();
    const second = createMockChildProcess();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter: argvProneAdapter(),
      model: "haiku",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => "x" },
        { level: "slim", buildPrompt: () => "y" },
      ],
    });
    await flushPromises();

    first.emit("error", Object.assign(new Error("spawn ENAMETOOLONG"), { code: "ENAMETOOLONG" }));
    await flushPromises();
    second.emit("error", Object.assign(new Error("spawn ENAMETOOLONG"), { code: "ENAMETOOLONG" }));

    await expect(pending).rejects.toThrow("ENAMETOOLONG");
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on unrelated spawn errors", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter: argvProneAdapter(),
      model: "haiku",
      effort: undefined,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => "x" },
        { level: "slim", buildPrompt: () => "y" },
      ],
    });
    await flushPromises();

    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(pending).rejects.toThrow("spawn ENOENT");
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the adapter has no buildOneShotCommand", async () => {
    const adapter = { label: "Bare" } as AgentAdapter;
    await expect(
      runOneShotPromptWithFallback({
        location: windowsProject,
        adapter,
        model: "x",
        effort: undefined,
        timeoutMs: 1000,
        logTag: "test",
        attempts: [{ level: "full", buildPrompt: () => "x" }],
      }),
    ).rejects.toThrow("does not support one-shot generation");
  });

  it("throws when the attempts list is empty", async () => {
    await expect(
      runOneShotPromptWithFallback({
        location: windowsProject,
        adapter: argvProneAdapter(),
        model: "haiku",
        effort: undefined,
        timeoutMs: 1000,
        logTag: "test",
        attempts: [],
      }),
    ).rejects.toThrow("no attempts provided");
  });
});
