import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: vi.fn<() => unknown>() },
}));
vi.mock("@/renderer/state/useThread", () => ({
  getThreadMap: (threads: Array<{ id: string }>) => new Map(threads.map((t) => [t.id, t])),
  getProjectMap: (projects: Array<{ id: string }>) => new Map(projects.map((p) => [p.id, p])),
}));
vi.mock("@/renderer/utils/gitHelpers", () => ({
  openFileInEditor: vi.fn<() => void>(),
}));

import { useAppStore } from "@/renderer/state/appStore";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import {
  createTerminalFileLinkSource,
  findProjectFileRefs,
  type ProjectRoot,
} from "./terminalProjectFileLinks";

const posix = (path: string): ProjectRoot[] => [{ path, caseInsensitive: false }];
const windows = (path: string): ProjectRoot[] => [{ path, caseInsensitive: true }];

function setStore(threads: unknown[], projects: unknown[]) {
  vi.mocked(useAppStore.getState).mockReturnValue({ threads, projects } as never);
}

function makeProject(id: string, path = "/repo") {
  return { id, location: { kind: "posix", path } };
}

beforeEach(() => {
  vi.clearAllMocks();
  setStore([], []);
});

describe("findProjectFileRefs (parser + scoping)", () => {
  it("links a safe relative JS/POSIX path:line", () => {
    expect(findProjectFileRefs("error in src/foo.ts:12", posix("/repo"))).toEqual([
      { start: 9, text: "src/foo.ts:12", path: "src/foo.ts", line: 12 },
    ]);
  });

  it("accepts file:line:column with a positive bounded column", () => {
    expect(findProjectFileRefs("src/foo.ts:12:5", posix("/repo"))).toEqual([
      { start: 0, text: "src/foo.ts:12:5", path: "src/foo.ts", line: 12, column: 5 },
    ]);
  });

  it("accepts a bare basename and strips a leading ./", () => {
    expect(findProjectFileRefs("./main.ts:3", posix("/repo"))).toEqual([
      { start: 0, text: "./main.ts:3", path: "main.ts", line: 3 },
    ]);
  });

  it("keeps a trailing GCC-style colon out of the link text", () => {
    expect(findProjectFileRefs("src/foo.c:12:5: error", posix("/repo"))).toEqual([
      { start: 0, text: "src/foo.c:12:5", path: "src/foo.c", line: 12, column: 5 },
    ]);
  });

  it("relativizes a POSIX absolute path inside the permitted root", () => {
    expect(findProjectFileRefs("/repo/src/foo.ts:12", posix("/repo"))).toEqual([
      { start: 0, text: "/repo/src/foo.ts:12", path: "src/foo.ts", line: 12 },
    ]);
  });

  it("accepts supported Windows drive-absolute and backslash cases", () => {
    expect(findProjectFileRefs("C:\\repo\\src\\foo.ts:12:5", windows("C:\\repo"))).toEqual([
      { start: 0, text: "C:\\repo\\src\\foo.ts:12:5", path: "src/foo.ts", line: 12, column: 5 },
    ]);
    expect(findProjectFileRefs("C:/repo/src/a.ts:7", windows("C:\\repo"))).toEqual([
      { start: 0, text: "C:/repo/src/a.ts:7", path: "src/a.ts", line: 7 },
    ]);
    expect(findProjectFileRefs("src\\foo.ts:9", windows("C:\\repo"))).toEqual([
      { start: 0, text: "src\\foo.ts:9", path: "src/foo.ts", line: 9 },
    ]);
  });

  it("rejects an absolute path outside the permitted root", () => {
    expect(findProjectFileRefs("/etc/passwd.ts:12", posix("/repo"))).toEqual([]);
  });

  it("rejects .. traversal (leading and embedded)", () => {
    expect(findProjectFileRefs("../secret.ts:12", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("src/../../etc/passwd.ts:12", posix("/repo"))).toEqual([]);
  });

  it("rejects protocol-looking text and non-file schemes", () => {
    expect(findProjectFileRefs("https://example.com/src/foo.ts:12", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("file:///repo/src/foo.ts:12", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("node:internal/foo.ts:12", posix("/repo"))).toEqual([]);
  });

  it("requires a positive bounded line number", () => {
    expect(findProjectFileRefs("src/foo.ts:0", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("src/foo.ts:1000000", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("src/foo.ts:999999", posix("/repo"))[0]?.line).toBe(999999);
  });

  it("does not link a bare path with no line or a numeric-looking extension", () => {
    expect(findProjectFileRefs("src/foo.ts", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("v1.2.3:12", posix("/repo"))).toEqual([]);
  });

  it("guards non-Latin token boundaries (no link from a split path fragment)", () => {
    // TOKEN_CHARS is ASCII-only; `src/文件.ts:12` splits into `src/` + `.ts:12`.
    // The `.ts:12` fragment (empty stem + a CJK char glued on the left) must
    // never become a bogus file link.
    expect(findProjectFileRefs("src/文件.ts:12", posix("/repo"))).toEqual([]);
    expect(findProjectFileRefs("错误.ts:3:14", posix("/repo"))).toEqual([]);
    // A non-ASCII char immediately after the token is also an unclean boundary.
    expect(findProjectFileRefs("src/foo.ts:12错误", posix("/repo"))).toEqual([]);
  });

  it("still links an ASCII path surrounded by non-Latin prose with whitespace", () => {
    expect(findProjectFileRefs("编译错误 src/foo.ts:12 发生", posix("/repo"))).toEqual([
      { start: 5, text: "src/foo.ts:12", path: "src/foo.ts", line: 12 },
    ]);
  });

  it("rejects a dotfile-only fragment with an empty stem", () => {
    expect(findProjectFileRefs(".ts:12", posix("/repo"))).toEqual([]);
  });
});

describe("createTerminalFileLinkSource (project/worktree resolution)", () => {
  it("resolves a safe path from the PTY's own worktree, not the selected project", () => {
    setStore(
      [
        {
          id: "t1",
          projectId: "p1",
          worktreePath: "/repo/.poracode/worktrees/a",
          worktreeBranch: "a",
        },
      ],
      [makeProject("p1"), makeProject("other", "/elsewhere")],
    );
    const source = createTerminalFileLinkSource("t1");
    const found = source.findRefs("error at src/foo.ts:12:5");
    expect(found).toHaveLength(1);
    source.activate(found[0]!);
    expect(openFileInEditor).toHaveBeenCalledExactlyOnceWith(
      makeProject("p1"),
      "/repo/.poracode/worktrees/a",
      "a",
      "src/foo.ts",
      12,
    );
  });

  it("resolves the same filename in two worktree contexts to distinct worktrees", () => {
    setStore(
      [
        { id: "t1", projectId: "p1", worktreePath: "/repo/.poracode/worktrees/a" },
        { id: "t2", projectId: "p1", worktreePath: "/repo/.poracode/worktrees/b" },
      ],
      [makeProject("p1")],
    );
    const a = createTerminalFileLinkSource("t1");
    const b = createTerminalFileLinkSource("t2");
    const text = "src/foo.ts:12";
    const refA = a.findRefs(text);
    const refB = b.findRefs(text);
    expect(refA).toHaveLength(1);
    expect(refB).toHaveLength(1);
    a.activate(refA[0]!);
    b.activate(refB[0]!);
    expect(vi.mocked(openFileInEditor).mock.calls.map((call) => [call[1], call[3]])).toEqual([
      ["/repo/.poracode/worktrees/a", "src/foo.ts"],
      ["/repo/.poracode/worktrees/b", "src/foo.ts"],
    ]);
  });

  it("rejects an absolute path belonging to a different worktree", () => {
    setStore(
      [{ id: "t1", projectId: "p1", worktreePath: "/repo/.poracode/worktrees/a" }],
      [makeProject("p1")],
    );
    expect(
      createTerminalFileLinkSource("t1").findRefs("/repo/.poracode/worktrees/b/src/foo.ts:12"),
    ).toEqual([]);
  });

  it("keeps URL-only behavior for an unscoped terminal and for Home", () => {
    setStore(
      [
        { id: "unknown", projectId: "missing" },
        { id: "home", projectId: "__lightcode_home__" },
      ],
      [makeProject("p1")],
    );
    for (const id of ["unknown", "home"]) {
      const source = createTerminalFileLinkSource(id);
      const found = source.findRefs("src/foo.ts:12 https://example.com");
      expect(found).toEqual([]);
      expect(source.findRefs("src/foo.ts:12")).toEqual([]);
    }
    expect(openFileInEditor).not.toHaveBeenCalled();
  });

  it("resolves a DevTerminal tab shell from its explicit immutable scope", () => {
    // No Thread row for this `shell:<uuid>` id. A different project is also
    // present (and a `selectedProjectId` that must be ignored): resolution must
    // use the tab's own projectId, never the selected project.
    vi.mocked(useAppStore.getState).mockReturnValue({
      threads: [],
      projects: [makeProject("p1"), makeProject("other", "/elsewhere")],
      selectedProjectId: "other",
    } as never);
    const scope = { projectId: "p1", worktreePath: "/repo/.poracode/worktrees/feature" };
    const source = createTerminalFileLinkSource("shell:tab-1", scope);
    const found = source.findRefs("review-demo.ts:3:14");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: "review-demo.ts", line: 3, column: 14 });
    source.activate(found[0]!);
    expect(openFileInEditor).toHaveBeenCalledExactlyOnceWith(
      makeProject("p1"),
      "/repo/.poracode/worktrees/feature",
      undefined,
      "review-demo.ts",
      3,
    );
  });

  it("keeps plain/global and login shells URL-only (no explicit scope, no thread)", () => {
    setStore([], [makeProject("p1")]);
    const globalShell = createTerminalFileLinkSource("shell:global");
    expect(globalShell.findRefs("review-demo.ts:3:14 https://example.com")).toEqual([]);
    // An explicit Home scope is rejected too.
    const homeShell = createTerminalFileLinkSource("shell:home", {
      projectId: "__lightcode_home__",
    });
    expect(homeShell.findRefs("review-demo.ts:3:14")).toEqual([]);
    expect(openFileInEditor).not.toHaveBeenCalled();
  });
});
