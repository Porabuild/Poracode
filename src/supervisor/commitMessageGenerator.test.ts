import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";

const spawnMock = vi.hoisted(() => vi.fn());
const resolveExecutablePathAsyncMock = vi.hoisted(() => vi.fn());
const getStagedDiffMock = vi.hoisted(() => vi.fn());
const getAllDiffMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("./agents/base", () => ({
  resolveExecutablePathAsync: resolveExecutablePathAsyncMock,
}));

vi.mock("./git", () => ({
  GitService: class MockGitService {
    getStagedDiff = getStagedDiffMock;
    getAllDiff = getAllDiffMock;
  },
}));

import { generateCommitMessage } from "./commitMessageGenerator";

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { end: ReturnType<typeof vi.fn> };
  killed: boolean;
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
  child.killed = false;
  return child;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const windowsProject: ProjectLocation = {
  kind: "windows",
  path: "C:\\Users\\demo\\project",
};

function createAdapter(): AgentAdapter {
  return {
    label: "Codex",
    defaultOneShotModel: "gpt-5.4-mini",
    buildOneShotCommand: (model) => ({
      command: "codex",
      args: ["exec", "-m", model, "-"],
    }),
  } as AgentAdapter;
}

describe("generateCommitMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveExecutablePathAsyncMock.mockResolvedValue("C:\\Users\\demo\\AppData\\Local\\Programs\\codex.exe");
    getStagedDiffMock.mockResolvedValue("diff --git a/file.ts b/file.ts");
    getAllDiffMock.mockResolvedValue("");
  });

  it("pipes the generated prompt over stdin and uses the project cwd on Windows", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "-m", "gpt-5.4-mini", "-"],
      expect.objectContaining({
        cwd: windowsProject.path,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    expect(child.stdin.end).toHaveBeenCalledWith(
      expect.stringContaining("Generate a git commit message for the following diff"),
    );
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(["exec", "-m", "gpt-5.4-mini", "-"]);

    child.stdout.emit("data", Buffer.from("fix(git): restore Windows commit generation"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("fix(git): restore Windows commit generation");
  });

  it("turns a killed child process into a timeout error", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();
    child.killed = true;
    child.emit("close", null);

    await expect(pending).rejects.toThrow("Agent timed out while generating commit message");
  });
});
