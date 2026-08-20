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
    ) => {
      command: string;
      args: string[];
      cwd?: string;
    }
  >(),
);
const getLogRangeMock = vi.hoisted(() => vi.fn<() => Promise<string>>());
const getDiffRangeMock = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

vi.mock("./agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agents/base")>()),
  buildAgentCommand: buildAgentCommandMock,
}));

vi.mock("./git", () => ({
  GitService: class MockGitService {
    getLogRange = getLogRangeMock;
    getDiffRange = getDiffRangeMock;
  },
}));

import { cleanPrSummary, generatePrSummary } from "./prSummaryGenerator";

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

describe("cleanPrSummary", () => {
  it("extracts title and description from a clean response", () => {
    expect(
      cleanPrSummary("TITLE: Add settings\nDESCRIPTION:\n- Add settings controls\n- Update tests"),
    ).toEqual({
      title: "Add settings",
      description: "- Add settings controls\n- Update tests",
    });
  });

  it("strips thinking tags and code fences", () => {
    expect(
      cleanPrSummary(
        "<think>notes</think>\n```text\nTITLE: Fix checkout\nDESCRIPTION:\n- Handle branch checkout\n```",
      ),
    ).toEqual({
      title: "Fix checkout",
      description: "- Handle branch checkout",
    });
  });
});

describe("generatePrSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAgentCommandMock.mockImplementation(
      (location: ProjectLocation, command: string, args: string[]) =>
        location.kind === "windows" ? { command, args, cwd: location.path } : { command, args },
    );
    getLogRangeMock.mockResolvedValue("abc123 SIT-123 add settings panel");
    getDiffRangeMock.mockResolvedValue("diff --git a/file.ts b/file.ts");
  });

  it("pipes branch, log, file inventory, and balanced diff excerpts over stdin", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    getDiffRangeMock.mockResolvedValue(
      [
        "diff --git a/src/large.ts b/src/large.ts",
        "@@ -1,1 +1,500 @@",
        " existing",
        ...Array.from({ length: 900 }, (_, index) => `+large generated line ${index}`),
        'diff --git "a/src/settings file.ts" "b/src/settings file.ts"',
        "@@ -1,3 +1,4 @@",
        "-oldSetting: false",
        "+newSetting: true",
        "diff --git a/src/newFeature.ts b/src/newFeature.ts",
        "new file mode 100644",
        "@@ -0,0 +1,2 @@",
        "+export function newFeature() {}",
      ].join("\n"),
    );

    const pending = generatePrSummary(
      windowsProject,
      createAdapter(),
      "feature/SIT-123-settings",
      "main",
    );
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
      expect.stringContaining("Branch: feature/SIT-123-settings"),
    );
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("Git log:"));
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("Changed files (3):"));
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("M src/settings file.ts"));
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("A src/newFeature.ts"));
    expect(child.stdin.end).toHaveBeenCalledWith(
      expect.stringContaining("--- src/settings file.ts (2/3) ---"),
    );
    expect(child.stdin.end).toHaveBeenCalledWith(expect.stringContaining("+newSetting: true"));
    expect(child.stdin.end).toHaveBeenCalledWith(
      expect.stringContaining("+export function newFeature() {}"),
    );

    child.stdout.emit(
      "data",
      Buffer.from("TITLE: SIT-123: Add settings\nDESCRIPTION:\n- Add settings UI\n- Add feature"),
    );
    child.emit("close", 0);

    await expect(pending).resolves.toEqual({
      title: "SIT-123: Add settings",
      description: "- Add settings UI\n- Add feature",
    });
  });

  it("rejects when no commits exist between branches", async () => {
    getLogRangeMock.mockResolvedValue("");

    await expect(
      generatePrSummary(windowsProject, createAdapter(), "feature/empty", "main"),
    ).rejects.toThrow("No commits found between branches");
  });

  it("rejects empty generated titles", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = generatePrSummary(windowsProject, createAdapter(), "feature/x", "main");
    await flushPromises();

    child.stdout.emit("data", Buffer.from("DESCRIPTION:\n- Missing title"));
    child.emit("close", 0);

    await expect(pending).rejects.toThrow("PR summary generation returned empty title");
  });

  it("falls back to a files-only prompt when the first spawn fails with ENAMETOOLONG", async () => {
    const first = createMockChildProcess();
    const second = createMockChildProcess();
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    getDiffRangeMock.mockResolvedValue(
      [
        "diff --git a/src/big.ts b/src/big.ts",
        "@@ -1,1 +1,5 @@",
        "-old",
        "+new line 1",
        "+new line 2",
      ].join("\n"),
    );

    const pending = generatePrSummary(windowsProject, createAdapter(), "feature/SIT-123-x", "main");
    await flushPromises();

    first.emit("error", Object.assign(new Error("spawn ENAMETOOLONG"), { code: "ENAMETOOLONG" }));
    await flushPromises();

    second.stdout.emit(
      "data",
      Buffer.from("TITLE: SIT-123: Trim PR summary\nDESCRIPTION:\n- Smaller prompt"),
    );
    second.emit("close", 0);

    await expect(pending).resolves.toEqual({
      title: "SIT-123: Trim PR summary",
      description: "- Smaller prompt",
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const fullStdin = first.stdin.end.mock.calls[0]?.[0];
    expect(fullStdin).toContain("diff --git");

    const slimStdin = second.stdin.end.mock.calls[0]?.[0];
    expect(slimStdin).toContain("Changed files (1):");
    expect(slimStdin).toContain("[No textual diff available for these files]");
    expect(slimStdin).not.toContain("diff --git");
  });
});
