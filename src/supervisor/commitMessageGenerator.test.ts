import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";

const spawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      command: string,
      args: string[],
    ) => {
      command: string;
      args: string[];
      cwd?: string;
    }
  >(),
);
const getStagedDiffMock = vi.hoisted(() => vi.fn<() => Promise<string>>());
const getAllDiffMock = vi.hoisted(() => vi.fn<() => Promise<string>>());
const getStatusMock = vi.hoisted(() => vi.fn<() => Promise<GitStatusResult>>());
const getDiffMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      filePath?: string,
      staged?: boolean,
    ) => Promise<{
      diff: string;
    }>
  >(),
);

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("./agents/base", () => ({
  buildAgentCommand: buildAgentCommandMock,
}));

vi.mock("./git", () => ({
  GitService: class MockGitService {
    getStatus = getStatusMock;
    getStagedDiff = getStagedDiffMock;
    getAllDiff = getAllDiffMock;
    getDiff = getDiffMock;
  },
}));

import { cleanCommitMessage, generateCommitMessage } from "./commitMessageGenerator";

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

const wslProject: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/demo/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
};

const cleanStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "",
  hasRemote: false,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
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
      (location: ProjectLocation, command: string, args: string[]) =>
        location.kind === "wsl" ? { command, args } : { command, args, cwd: location.path },
    );
    getStagedDiffMock.mockResolvedValue("diff --git a/file.ts b/file.ts");
    getAllDiffMock.mockResolvedValue("");
    getStatusMock.mockResolvedValue({
      ...cleanStatus,
      staged: [
        {
          path: "file.ts",
          status: "M",
          staged: true,
          insertions: 1,
          deletions: 0,
        },
      ],
      totalInsertions: 1,
    });
    getDiffMock.mockResolvedValue({ diff: "" });
  });

  it("pipes the generated prompt over stdin and uses the project cwd on Windows", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    expect(buildAgentCommandMock).toHaveBeenCalledWith(
      windowsProject,
      "codex",
      ["exec", "-m", "gpt-5.4-mini", "-"],
      undefined,
      undefined,
    );
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

  it("injects a language directive when a language is requested", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(
      windowsProject,
      createAdapter(),
      undefined,
      undefined,
      "German",
    );
    await flushPromises();

    const stdin = child.stdin.end.mock.calls[0]?.[0];
    expect(stdin).toContain("Write the commit message subject and body in German");
    // The Conventional Commits prefix must stay English so cleanCommitMessage's
    // feat|fix|… detection still works.
    expect(stdin).toContain("keep the Conventional Commits type prefix (feat, fix, …) in English");

    child.stdout.emit("data", Buffer.from("feat(ui): Seitenleiste hinzufügen"));
    child.emit("close", 0);
    await expect(pending).resolves.toBe("feat(ui): Seitenleiste hinzufügen");
  });

  it("omits the language directive by default", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    const stdin = child.stdin.end.mock.calls[0]?.[0];
    expect(stdin).not.toContain("Write the commit message subject and body in");

    child.stdout.emit("data", Buffer.from("feat(ui): add sidebar"));
    child.emit("close", 0);
    await expect(pending).resolves.toBe("feat(ui): add sidebar");
  });

  it("delegates to buildAgentCommand for WSL projects", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generateCommitMessage(wslProject, createAdapter());
    await flushPromises();

    expect(buildAgentCommandMock).toHaveBeenCalledWith(
      wslProject,
      "codex",
      ["exec", "-m", "gpt-5.4-mini", "-"],
      undefined,
      undefined,
    );

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

  it("lists all changed files and keeps later-file diff excerpts when the first file is large", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    getStatusMock.mockResolvedValue({
      ...cleanStatus,
      staged: [
        {
          path: "src/large.ts",
          status: "M",
          staged: true,
          insertions: 500,
          deletions: 12,
        },
        {
          path: "src/settings file.ts",
          status: "M",
          staged: true,
          insertions: 8,
          deletions: 2,
        },
      ],
      totalInsertions: 508,
      totalDeletions: 14,
    });
    getStagedDiffMock.mockResolvedValue(
      [
        "diff --git a/src/large.ts b/src/large.ts",
        "@@ -1,1 +1,500 @@",
        " existing",
        ...Array.from({ length: 700 }, (_, index) => `+large generated line ${index}`),
        'diff --git "a/src/settings file.ts" "b/src/settings file.ts"',
        "@@ -1,3 +1,4 @@",
        "-oldSetting: false",
        "+newSetting: true",
      ].join("\n"),
    );

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("Changed files (2):"));
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("M src/large.ts"));
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("M src/settings file.ts"));
    expect(child.stdin.end).toHaveBeenCalledWith(
      expect.stringContaining("--- src/settings file.ts (2/2) ---"),
    );
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("+newSetting: true"));

    child.stdout.emit("data", Buffer.from("feat(settings): update generated settings"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("feat(settings): update generated settings");
  });

  it("includes untracked file diffs when generating for unstaged add-all changes", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    getStatusMock.mockResolvedValue({
      ...cleanStatus,
      unstaged: [
        {
          path: "src/tracked.ts",
          status: "M",
          staged: false,
          insertions: 2,
          deletions: 1,
        },
        {
          path: "src/newFeature.ts",
          status: "?",
          staged: false,
          insertions: 20,
          deletions: 0,
        },
      ],
      totalInsertions: 22,
      totalDeletions: 1,
    });
    getStagedDiffMock.mockResolvedValue("");
    getAllDiffMock.mockResolvedValue(
      "diff --git a/src/tracked.ts b/src/tracked.ts\n@@ -1 +1 @@\n-old\n+new",
    );
    getDiffMock.mockResolvedValue({
      diff: [
        "diff --git a/src/newFeature.ts b/src/newFeature.ts",
        "new file mode 100644",
        "@@ -0,0 +1,2 @@",
        "+export function newFeature() {}",
      ].join("\n"),
    });

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    expect(getDiffMock).toHaveBeenCalledWith(windowsProject, "src/newFeature.ts", false);
    expect(child.stdin.end).toHaveBeenCalledWith(
      expect.stringContaining("Change source: unstaged"),
    );
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("? src/newFeature.ts"));
    expect(child.stdin.end).toHaveBeenCalledWith(
      expect.stringContaining("+export function newFeature() {}"),
    );

    child.stdout.emit("data", Buffer.from("feat: add tracked and new feature changes"));
    child.emit("close", 0);

    await expect(pending).resolves.toBe("feat: add tracked and new feature changes");
  });

  it("rejects when no staged or unstaged changes exist", async () => {
    getStatusMock.mockResolvedValue(cleanStatus);
    getStagedDiffMock.mockResolvedValue("");
    getAllDiffMock.mockResolvedValue("");

    await expect(generateCommitMessage(windowsProject, createAdapter())).rejects.toThrow(
      "No changes to describe",
    );
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

  it("retries with a files-only prompt when the first spawn fails with ENAMETOOLONG", async () => {
    const first = createMockChildProcess();
    const second = createMockChildProcess();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    const argvErr = Object.assign(new Error("spawn ENAMETOOLONG"), { code: "ENAMETOOLONG" });
    first.emit("error", argvErr);
    await flushPromises();

    second.stdout.emit("data", Buffer.from("fix(commit-gen): shrink argv"));
    second.emit("close", 0);

    await expect(pending).resolves.toBe("fix(commit-gen): shrink argv");
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const fullStdin = first.stdin.end.mock.calls[0]?.[0];
    expect(fullStdin).toContain("diff --git");

    const slimStdin = second.stdin.end.mock.calls[0]?.[0];
    expect(slimStdin).toEqual(expect.any(String));
    expect(slimStdin).toContain("Changed files (1):");
    expect(slimStdin).toContain("[No textual diff available for these files]");
    expect(slimStdin).not.toContain("diff --git");
  });

  it("retries on Linux E2BIG too", async () => {
    const first = createMockChildProcess();
    const second = createMockChildProcess();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    first.emit("error", Object.assign(new Error("spawn E2BIG"), { code: "E2BIG" }));
    await flushPromises();

    second.stdout.emit("data", Buffer.from("fix: handle linux argv cap"));
    second.emit("close", 0);

    await expect(pending).resolves.toBe("fix: handle linux argv cap");
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it("propagates non-argv spawn errors without retrying", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValueOnce(child);

    const pending = generateCommitMessage(windowsProject, createAdapter());
    await flushPromises();

    const otherErr = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    child.emit("error", otherErr);

    await expect(pending).rejects.toThrow("spawn ENOENT");
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
