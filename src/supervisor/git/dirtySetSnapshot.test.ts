import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { readDirtySetSnapshot } from "./dirtySetSnapshot";
import { execGit } from "./exec";

// Pass-through spy: scripted tests queue outputs, the repository test runs git.
vi.mock("./exec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./exec")>();
  return { ...actual, execGit: vi.fn<typeof actual.execGit>(actual.execGit) };
});

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const STATUS = [
  "1 .M N... 100644 100644 100644 aaa aaa src/edited.ts",
  "1 M. N... 100644 100644 100644 aaa bbb src/staged.ts",
  "1 MM N... 100644 100644 100644 aaa bbb src/edited.ts",
  "1 .D N... 100644 100644 000000 aaa aaa src/deleted.ts",
  "? notes/new file.md",
  "",
].join("\n");

describe("readDirtySetSnapshot", () => {
  let root: string;
  let location: ProjectLocation;
  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), "poracode-dirty-set-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "notes"));
    writeFileSync(join(root, "src", "edited.ts"), "edited");
    writeFileSync(join(root, "src", "staged.ts"), "staged!");
    writeFileSync(join(root, "notes", "new file.md"), "# new");
    location =
      process.platform === "win32"
        ? { kind: "windows", path: root }
        : { kind: "posix", path: root };
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("fingerprints every dirty path once with one read-only status", async () => {
    vi.mocked(execGit).mockResolvedValueOnce(STATUS);
    const snapshot = await readDirtySetSnapshot(location, undefined);

    expect(execGit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(execGit).mock.calls[0]![1]).toEqual([
      "status",
      "--porcelain=v2",
      "--untracked-files=all",
      "--",
      ".",
    ]);
    const edited = statSync(join(root, "src", "edited.ts"));
    expect(snapshot).toEqual(
      new Map([
        ["src/staged.ts", `7:${statSync(join(root, "src", "staged.ts")).mtimeMs}`],
        ["src/edited.ts", `${edited.size}:${edited.mtimeMs}`],
        ["src/deleted.ts", "missing"],
        ["notes/new file.md", `5:${statSync(join(root, "notes", "new file.md")).mtimeMs}`],
      ]),
    );
  });

  it("skips a location that is not a git worktree", async () => {
    vi.mocked(execGit).mockRejectedValueOnce(new Error("fatal: not a git repository"));
    expect(await readDirtySetSnapshot(location, undefined)).toBeUndefined();
  });

  it("skips a dirty set too large to stat cheaply", async () => {
    const lines = Array.from({ length: 2_001 }, (_, index) => `? gen/file-${index}.ts`);
    vi.mocked(execGit).mockResolvedValueOnce(lines.join("\n"));
    expect(await readDirtySetSnapshot(location, undefined)).toBeUndefined();
  });

  it("stats WSL paths inside the distro in one batch", async () => {
    const wsl: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/dev/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo",
    };
    const stat = vi.fn<WslBridgeClient["stat"]>(async (_location, paths) => ({
      stats: paths.map((path) =>
        path.endsWith("deleted.ts")
          ? { path, exists: false, code: "ENOENT" }
          : { path, exists: true, size: 3, mtimeMs: 42 },
      ),
    }));
    vi.mocked(execGit).mockResolvedValueOnce(STATUS);

    const snapshot = await readDirtySetSnapshot(wsl, { stat } as unknown as WslBridgeClient);

    expect(stat).toHaveBeenCalledTimes(1);
    expect(stat.mock.calls[0]![1]).toEqual([
      "/home/dev/repo/src/staged.ts",
      "/home/dev/repo/src/edited.ts",
      "/home/dev/repo/src/deleted.ts",
      "/home/dev/repo/notes/new file.md",
    ]);
    expect(snapshot?.get("src/edited.ts")).toBe("3:42");
    expect(snapshot?.get("src/deleted.ts")).toBe("missing");

    // Without the bridge a WSL worktree cannot be statted: skipped, not guessed.
    vi.mocked(execGit).mockResolvedValueOnce(STATUS);
    expect(await readDirtySetSnapshot(wsl, undefined)).toBeUndefined();
    // A clean worktree needs no stat at all.
    vi.mocked(execGit).mockResolvedValueOnce("");
    expect(await readDirtySetSnapshot(wsl, undefined)).toEqual(new Map());
  });

  it.skipIf(!hasGit())(
    "keeps to the project's subtree of a larger repository, relative to the project",
    async () => {
      const git = (...args: string[]) =>
        execFileSync("git", ["-c", "core.autocrlf=false", ...args], { cwd: root, stdio: "pipe" });
      git("init", "--quiet");
      mkdirSync(join(root, "pkg", "app", "src"), { recursive: true });
      mkdirSync(join(root, "pkg", "other"), { recursive: true });
      writeFileSync(join(root, "pkg", "app", "src", "a.ts"), "a\n");
      writeFileSync(join(root, "pkg", "other", "b.ts"), "b\n");
      git("add", "--all");
      git(
        ...["-c", "user.email=t@example.com", "-c", "user.name=T", "-c", "commit.gpgsign=false"],
        ...["commit", "--quiet", "-m", "init"],
      );
      appendFileSync(join(root, "pkg", "app", "src", "a.ts"), "edited\n");
      appendFileSync(join(root, "pkg", "other", "b.ts"), "sibling\n");
      writeFileSync(join(root, "pkg", "app", "new.ts"), "new\n");
      writeFileSync(join(root, "pkg", "other", "new.ts"), "sibling new\n");
      const app = join(root, "pkg", "app");

      const snapshot = await readDirtySetSnapshot(
        { kind: process.platform === "win32" ? "windows" : "posix", path: app },
        undefined,
      );

      const fingerprint = (path: string) => {
        const stat = statSync(join(app, path));
        return `${stat.size}:${stat.mtimeMs}`;
      };
      expect(snapshot).toEqual(
        new Map([
          ["src/a.ts", fingerprint("src/a.ts")],
          ["new.ts", fingerprint("new.ts")],
        ]),
      );
    },
  );
});
