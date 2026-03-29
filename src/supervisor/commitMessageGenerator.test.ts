import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";

const spawnMock = vi.hoisted(() => vi.fn());
const resolveExecutablePathAsyncMock = vi.hoisted(() => vi.fn());
const wrapWslCommandMock = vi.hoisted(() => vi.fn());
const getStagedDiffMock = vi.hoisted(() => vi.fn());
const getAllDiffMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("./agents/base", () => ({
  resolveExecutablePathAsync: resolveExecutablePathAsyncMock,
  wrapWslCommand: wrapWslCommandMock,
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

const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
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
    resolveExecutablePathAsyncMock.mockResolvedValue(
      "C:\\Users\\demo\\AppData\\Local\\Programs\\codex.cmd",
    );
    wrapWslCommandMock.mockImplementation((_location, command, args) => ({
      command: "C:\\Windows\\System32\\wsl.exe",
      args: ["-d", "Ubuntu", "--cd", "/home/demo/project", "--", command, ...args],
    }));
    getStagedDiffMock.mockResolvedValue("diff --git a/file.ts b/file.ts");
    getAllDiffMock.mockResolvedValue("");
  });

  it("pipes the generated prompt over stdin and uses the project cwd on Windows", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    expect(spawnMock).toHaveBeenCalledWith(
      "C:\\Users\\demo\\AppData\\Local\\Programs\\codex.cmd",
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

  it("wraps WSL one-shot commands instead of spawning the Windows host directly", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(wslProject, createAdapter());
    await flushPromises();

    expect(resolveExecutablePathAsyncMock).not.toHaveBeenCalled();
    expect(wrapWslCommandMock).toHaveBeenCalledWith(wslProject, "codex", [
      "exec",
      "-m",
      "gpt-5.4-mini",
      "-",
    ]);
    expect(spawnMock).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\wsl.exe",
      [
        "-d",
        "Ubuntu",
        "--cd",
        "/home/demo/project",
        "--",
        "codex",
        "exec",
        "-m",
        "gpt-5.4-mini",
        "-",
      ],
      expect.objectContaining({
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );

    child.stdout.emit("data", Buffer.from("fix(wsl): route commit generation through WSL"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("fix(wsl): route commit generation through WSL");
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
