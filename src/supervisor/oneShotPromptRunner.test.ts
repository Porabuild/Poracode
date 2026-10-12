import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
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
const resolveAgentProjectLocationMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      _environment?: unknown,
      signal?: AbortSignal,
    ) => Promise<ProjectLocation>
  >(),
);

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));
vi.mock("./agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agents/base")>()),
  buildAgentCommand: buildAgentCommandMock,
  resolveAgentProjectLocation: resolveAgentProjectLocationMock,
}));

import {
  isArgvLikelyTooLong,
  isArgvTooLongError,
  runOneShotPromptWithFallback,
  runTextOnlyOneShotPromptWithFallback,
} from "./oneShotPromptRunner";
import { UnsupportedOneShotControlError } from "./agents/base";

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

function selection(overrides: Partial<ModelSelection> = {}): ModelSelection {
  return { model: "haiku", ...overrides };
}

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
  resolveAgentProjectLocationMock.mockImplementation(async (location) => location);
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
  it("resolves the provider execution location and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    const wslProject: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\repo",
    };
    const runOneShot = vi.fn<NonNullable<AgentAdapter["runOneShot"]>>().mockResolvedValue("ok");
    const adapter = { label: "WSL-backed", runOneShot } as unknown as AgentAdapter;
    resolveAgentProjectLocationMock.mockResolvedValue(wslProject);

    await runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      selection: selection({ model: "model" }),
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [{ level: "full", buildPrompt: () => "hello" }],
      signal,
    });

    expect(resolveAgentProjectLocationMock).toHaveBeenCalledWith(windowsProject, undefined, signal);
    expect(runOneShot).toHaveBeenCalledWith(expect.objectContaining({ location: wslProject }));
  });

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
        selection: selection({ model: "model" }),
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
      selection: selection(),
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
      selection: selection({ model: "model" }),
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
      selection: selection({ model: "model-a" }),
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
      selection: selection(),
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
      selection: selection(),
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
      selection: selection(),
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
      selection: selection(),
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
        selection: selection({ model: "x" }),
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
        selection: selection(),
        timeoutMs: 1000,
        logTag: "test",
        attempts: [],
      }),
    ).rejects.toThrow("no attempts provided");
  });
});

describe("runOneShotPromptWithFallback selection transport", () => {
  it("passes the complete tuple to the SDK path with carriers and binding intact", async () => {
    const runOneShot = vi.fn<NonNullable<AgentAdapter["runOneShot"]>>().mockResolvedValue("ok");
    const adapter = { label: "Structured", runOneShot } as unknown as AgentAdapter;
    const fullSelection = selection({
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "devin:acme", presentationMode: "terminal" },
        model: "haiku",
        inertValues: { effort: "" },
      },
    });

    await runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      selection: fullSelection,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [{ level: "full", buildPrompt: () => "hello" }],
    });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        location: windowsProject,
        selection: fullSelection,
        prompt: "hello",
      }),
    );
  });

  it.each([
    ["general", runOneShotPromptWithFallback],
    ["text-only", runTextOnlyOneShotPromptWithFallback],
  ] as const)("treats unsupported controls as terminal on the %s SDK lane", async (_lane, run) => {
    const frozenSelection = Object.freeze(selection({ thinking: true }));
    const seen: ModelSelection[] = [];
    const runOneShot = vi
      .fn<NonNullable<AgentAdapter["runOneShot"]>>()
      .mockImplementation(async (input) => {
        seen.push(input.selection);
        expect(input.selection).toBe(frozenSelection);
        throw new UnsupportedOneShotControlError(["thinking"]);
      });
    const adapter = {
      label: "Structured",
      runOneShot,
      runTextOnlyOneShot: runOneShot,
    } as unknown as AgentAdapter;

    const laterPrompt = vi.fn<() => string>(() => "slim");
    await expect(
      run({
        location: windowsProject,
        adapter,
        selection: frozenSelection,
        timeoutMs: 10_000,
        logTag: "test",
        attempts: [
          { level: "full", buildPrompt: () => "big prompt" },
          { level: "slim", buildPrompt: laterPrompt },
          { level: "tiny", buildPrompt: laterPrompt },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsupportedOneShotControlError);

    // Real counter: exactly one SDK call for three attempts — the deterministic
    // refusal stops the identical-prompt retries with zero further effects.
    expect(runOneShot).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([frozenSelection]);
    expect(laterPrompt).not.toHaveBeenCalled();
  });

  it("keeps explicit SDK aborts terminal on both utility lanes", async () => {
    for (const run of [runOneShotPromptWithFallback, runTextOnlyOneShotPromptWithFallback]) {
      const error = new Error("cancelled");
      error.name = "AbortError";
      const sdk = vi.fn<NonNullable<AgentAdapter["runOneShot"]>>().mockRejectedValue(error);
      const adapter = {
        label: "Structured",
        runOneShot: sdk,
        runTextOnlyOneShot: sdk,
      } as unknown as AgentAdapter;
      await expect(
        run({
          location: windowsProject,
          adapter,
          selection: selection(),
          timeoutMs: 10_000,
          logTag: "test",
          attempts: [
            { level: "full", buildPrompt: () => "full" },
            { level: "slim", buildPrompt: () => "slim" },
          ],
        }),
      ).rejects.toBe(error);
      expect(sdk).toHaveBeenCalledOnce();
    }
  });

  it("keeps retrying recoverable SDK failures after a non-terminal error", async () => {
    const runOneShot = vi
      .fn<NonNullable<AgentAdapter["runOneShot"]>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("recovered");
    const adapter = { label: "Structured", runOneShot } as unknown as AgentAdapter;

    await expect(
      runOneShotPromptWithFallback({
        location: windowsProject,
        adapter,
        selection: selection(),
        timeoutMs: 10_000,
        logTag: "test",
        attempts: [
          { level: "full", buildPrompt: () => "big prompt" },
          { level: "slim", buildPrompt: () => "slim" },
        ],
      }),
    ).resolves.toBe("recovered");
    expect(runOneShot).toHaveBeenCalledTimes(2);
  });

  it("derives the legacy positionals once and passes the full selection as argument 6 on every retry", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);
    const buildOneShotCommand = vi
      .fn<NonNullable<AgentAdapter["buildOneShotCommand"]>>()
      .mockResolvedValue({ command: "cli", args: ["-p", "x"], stdin: "" });
    const adapter = { label: "Cli", buildOneShotCommand } as unknown as AgentAdapter;
    // Empty effort / false Fast are present carriers: they must reach the
    // builder positionals exactly, not be collapsed to omitted values.
    const tuple = selection({ effort: "", fast: false });

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      selection: tuple,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => "big prompt" },
        { level: "slim", buildPrompt: () => "slim" },
      ],
    });
    await flushPromises();
    child.stdout.emit("data", Buffer.from("ok"));
    child.emit("close", 0);
    await expect(pending).resolves.toBe("ok");

    expect(buildOneShotCommand).toHaveBeenCalledTimes(1);
    const [model, effort, prompt, , fast, options] = buildOneShotCommand.mock.calls[0]!;
    expect(model).toBe("haiku");
    expect(effort).toBe("");
    expect(fast).toBe(false);
    expect(prompt).toBe("big prompt");
    expect(options).toEqual({ readOnlyWorkspace: undefined, selection: tuple });
  });

  it("keeps the full selection and read-only flag reaching a WSL provider", async () => {
    const wslProject: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/project",
      uncPath: "\\wsl.localhost\\Ubuntu\\home\\demo\\project",
    };
    resolveAgentProjectLocationMock.mockResolvedValue(wslProject);
    const runOneShot = vi.fn<NonNullable<AgentAdapter["runOneShot"]>>().mockResolvedValue("ok");
    const adapter = { label: "WslStructured", runOneShot } as unknown as AgentAdapter;
    const tuple = selection({ effort: "high", fast: true });

    await runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      selection: tuple,
      readOnlyWorkspace: true,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [{ level: "full", buildPrompt: () => "wsl prompt" }],
    });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        location: wslProject,
        selection: tuple,
        readOnlyWorkspace: true,
        prompt: "wsl prompt",
      }),
    );
  });

  it("reuses the identical selection object across prompt-size retries", async () => {
    const first = createMockChildProcess();
    // Only the slim attempt spawns (the oversized one is skipped
    // proactively), so exactly one queued child is consumed.
    spawnMock.mockReturnValueOnce(first);
    // The prompt rides argv so the oversized first attempt is skipped
    // proactively and the slim attempt actually spawns.
    const buildOneShotCommand = vi.fn<NonNullable<AgentAdapter["buildOneShotCommand"]>>(
      (_model: string, _effort?: string, prompt?: string) => ({
        command: "cli",
        args: ["-p", prompt ?? ""],
        stdin: "",
      }),
    );
    const adapter = { label: "Cli", buildOneShotCommand } as unknown as AgentAdapter;
    const tuple = selection({ effort: "low", thinking: true });

    const pending = runOneShotPromptWithFallback({
      location: windowsProject,
      adapter,
      selection: tuple,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [
        { level: "full", buildPrompt: () => "x".repeat(300_000) },
        { level: "slim", buildPrompt: () => "slim" },
      ],
    });
    await flushPromises();
    first.stdout.emit("data", Buffer.from("ok"));
    first.emit("close", 0);
    await expect(pending).resolves.toBe("ok");

    // The oversized attempt was skipped before spawning; the slim attempt
    // spawned with the identical selection in argument 6.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(buildOneShotCommand).toHaveBeenCalledTimes(2);
    const optionArgs = buildOneShotCommand.mock.calls.map((call) => call[5]);
    for (const options of optionArgs) {
      expect(options?.selection).toBe(tuple);
    }
  });
});

describe("runTextOnlyOneShotPromptWithFallback selection transport", () => {
  it("passes the full selection into the text-only SDK and builder lanes with argument 6", async () => {
    const tuple = selection({ effort: "", fast: false, contextSize: "" });

    // SDK lane: runTextOnlyOneShot receives the complete selection.
    const runTextOnlyOneShot = vi
      .fn<NonNullable<AgentAdapter["runTextOnlyOneShot"]>>()
      .mockResolvedValue("ok");
    const sdkAdapter = { label: "Sdk", runTextOnlyOneShot } as unknown as AgentAdapter;
    await runTextOnlyOneShotPromptWithFallback({
      location: windowsProject,
      adapter: sdkAdapter,
      selection: tuple,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [{ level: "full", buildPrompt: () => "hello" }],
    });
    expect(runTextOnlyOneShot).toHaveBeenCalledWith(
      expect.objectContaining({ selection: tuple, prompt: "hello" }),
    );
  });

  it("passes the full selection into the text-only builder lane with argument 6", async () => {
    const tuple = selection({ effort: "", fast: false, contextSize: "" });
    // Builder lane: buildTextOnlyOneShotCommand takes the SAME argument 6.
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);
    const buildTextOnlyOneShotCommand = vi
      .fn<NonNullable<AgentAdapter["buildTextOnlyOneShotCommand"]>>()
      .mockResolvedValue({ command: "cli", args: ["-p", "x"], stdin: "" });
    const cliAdapter = { label: "Cli", buildTextOnlyOneShotCommand } as unknown as AgentAdapter;
    const pending = runTextOnlyOneShotPromptWithFallback({
      location: windowsProject,
      adapter: cliAdapter,
      selection: tuple,
      timeoutMs: 10_000,
      logTag: "test",
      attempts: [{ level: "full", buildPrompt: () => "hello" }],
    });
    await flushPromises();
    child.stdout.emit("data", Buffer.from("ok"));
    child.emit("close", 0);
    await expect(pending).resolves.toBe("ok");

    const [model, effort, , , fast, options] = buildTextOnlyOneShotCommand.mock.calls[0]!;
    expect([model, effort, fast]).toEqual(["haiku", "", false]);
    expect(options).toEqual({ readOnlyWorkspace: undefined, selection: tuple });
  });
});
