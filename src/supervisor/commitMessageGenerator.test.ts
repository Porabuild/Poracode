import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "../shared/contracts";
import type { AgentAdapter } from "./agents/base";

const spawnMock = vi.hoisted(() => vi.fn());
const buildAgentCommandMock = vi.hoisted(() => vi.fn());
const getStagedDiffMock = vi.hoisted(() => vi.fn());
const getAllDiffMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("./agents/base", () => ({
  buildAgentCommand: buildAgentCommandMock,
}));

vi.mock("./git", () => ({
  GitService: class MockGitService {
    getStagedDiff = getStagedDiffMock;
    getAllDiff = getAllDiffMock;
  },
}));

import { cleanCommitMessage, generateCommitMessage } from "./commitMessageGenerator";

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

describe("cleanCommitMessage", () => {
  it("returns a clean message unchanged", () => {
    expect(cleanCommitMessage("feat(ui): add sidebar")).toBe("feat(ui): add sidebar");
  });

  it("strips markdown code fences", () => {
    expect(cleanCommitMessage("```\nfix(git): restore commit\n```")).toBe(
      "fix(git): restore commit",
    );
  });

  it("strips thinking tags", () => {
    expect(cleanCommitMessage("<think>reasoning here</think>\nfeat: new feature")).toBe(
      "feat: new feature",
    );
  });

  it("strips antThinking tags", () => {
    expect(cleanCommitMessage("<antThinking>analyzing</antThinking>\nfix: a bug")).toBe(
      "fix: a bug",
    );
  });

  it("drops preamble before the commit message", () => {
    expect(
      cleanCommitMessage("Here is your commit message:\n\nfeat(cli): add --verbose flag"),
    ).toBe("feat(cli): add --verbose flag");
  });

  it("handles breaking changes with ! syntax", () => {
    expect(cleanCommitMessage("feat(api)!: remove v1 endpoint")).toBe(
      "feat(api)!: remove v1 endpoint",
    );
  });

  it("returns preamble-only text when no conventional prefix found", () => {
    expect(cleanCommitMessage("Update the code")).toBe("Update the code");
  });

  it("handles empty input", () => {
    expect(cleanCommitMessage("")).toBe("");
  });

  it("handles fences with a language tag", () => {
    expect(cleanCommitMessage("```text\nfix: typo\n```")).toBe("fix: typo");
  });

  it("preserves multi-line bodies after the subject", () => {
    expect(
      cleanCommitMessage(
        "preamble\n\nrefactor(core): split runtime\n\n- Extract module\n- Update imports",
      ),
    ).toBe("refactor(core): split runtime\n\n- Extract module\n- Update imports");
  });

  it("strips both thinking and preamble together", () => {
    expect(
      cleanCommitMessage(
        "<think>deep thought</think>\nSure:\n\nfix(platform): handle Windows paths",
      ),
    ).toBe("fix(platform): handle Windows paths");
  });
});

describe("generateCommitMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAgentCommandMock.mockImplementation(
      (location: ProjectLocation, command: string, args: string[]) => ({
        command,
        args,
        cwd: location.kind === "wsl" ? undefined : location.path,
      }),
    );
    getStagedDiffMock.mockResolvedValue("diff --git a/file.ts b/file.ts");
    getAllDiffMock.mockResolvedValue("");
  });

  it("pipes the generated prompt over stdin and uses the project cwd on Windows", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    expect(buildAgentCommandMock).toHaveBeenCalledWith(windowsProject, "codex", [
      "exec",
      "-m",
      "gpt-5.4-mini",
      "-",
    ]);
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

    child.stdout.emit("data", Buffer.from("fix(git): restore Windows commit generation"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("fix(git): restore Windows commit generation");
  });

  it("delegates to buildAgentCommand for WSL projects", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(wslProject, createAdapter());
    await flushPromises();

    expect(buildAgentCommandMock).toHaveBeenCalledWith(wslProject, "codex", [
      "exec",
      "-m",
      "gpt-5.4-mini",
      "-",
    ]);

    child.stdout.emit("data", Buffer.from("fix(wsl): route commit generation through WSL"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("fix(wsl): route commit generation through WSL");
  });

  it("strips code fences and preamble from LLM output", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    child.stdout.emit(
      "data",
      Buffer.from(
        "Here's the commit message:\n\n```\nfeat(worktree): add worktree deletion\n\n- Add delete dialog\n- Handle force removal\n```\n",
      ),
    );
    child.emit("close", 0);

    await expect(pending).resolves.toBe(
      "feat(worktree): add worktree deletion\n\n- Add delete dialog\n- Handle force removal",
    );
  });

  it("strips thinking tags from LLM output", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    child.stdout.emit(
      "data",
      Buffer.from(
        "<think>This is a multi-concern changeset...</think>\nfix(platform): use bridge.platform for detection",
      ),
    );
    child.emit("close", 0);

    await expect(pending).resolves.toBe("fix(platform): use bridge.platform for detection");
  });

  it("extracts the result field from Cursor JSON output", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ result: "fix(cursor): add cursor-agent adapter" })),
    );
    child.emit("close", 0);

    await expect(pending).resolves.toBe("fix(cursor): add cursor-agent adapter");
  });

  it("turns a killed child process into a timeout error", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();
    child.killed = true;
    child.emit("close", null);

    await expect(pending).rejects.toThrow("Agent timed out");
  });
});
