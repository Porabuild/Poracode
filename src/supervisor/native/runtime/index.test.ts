import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectNativeNodeTarget, nodeArchiveDirName } from "../../runtime/pinnedNode";
import {
  installNativeRuntime,
  managedNodePath,
  resetNativeRuntimeCacheForTests,
  resolveNativeNode,
} from "./index";

vi.mock("../../runtime/download", () => ({
  // Write a marker file at destPath so verifySha256 has something to read,
  // then no-op the verify so we don't need real archive bytes per-test.
  downloadToFile: vi.fn<(url: string, destPath: string) => Promise<void>>(
    async (_url, destPath) => {
      writeFileSync(destPath, "stub-archive-bytes");
    },
  ),
  // Test stub — real impl streams the file and compares against the
  // pinned checksum. The hash itself is verified in CI by
  // `scripts/refresh-node-checksums.mjs`.
  verifySha256: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("../../runtime/spawn", () => ({
  // Stand in for `tar` extraction: read the target dir from argv and
  // create the expected `node-v<x>-<target>/<binRelPath>` tree so the
  // post-extract existsSync passes.
  spawnAndAwaitExit: vi.fn<(command: string, args: readonly string[]) => Promise<void>>(
    async (_command, args) => {
      const dashC = args.indexOf("-C");
      const destDir = dashC >= 0 ? args[dashC + 1] : undefined;
      if (!destDir) throw new Error("test stub: missing -C in argv");
      const archiveArg = args.find((a) => a.endsWith(".tar.xz") || a.endsWith(".zip"));
      if (!archiveArg) throw new Error("test stub: cannot find archive arg");
      // Filename shape: node-v<x>-<target>.{tar.xz|zip}
      const base = archiveArg
        .split(/[\\/]/)
        .pop()!
        .replace(/\.(?:tar\.xz|zip)$/, "");
      const isWin = /-win-/.test(base);
      const binDir = isWin ? join(destDir, base) : join(destDir, base, "bin");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, isWin ? "node.exe" : "node"), "stub");
    },
  ),
}));

const tempDirs: string[] = [];

function makeTempDir(prefix = "lightcode-native-runtime-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resetNativeRuntimeCacheForTests();
});

afterEach(() => {
  resetNativeRuntimeCacheForTests();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("managedNodePath", () => {
  it("uses bin/node on POSIX targets", () => {
    const baseDir = "/home/u/.poracode";
    const path = managedNodePath(baseDir, "linux-x64");
    expect(path.replaceAll("\\", "/")).toBe(
      `/home/u/.poracode/runtime/${nodeArchiveDirName("linux-x64")}/bin/node`,
    );
  });

  it("uses node.exe on Windows targets", () => {
    const baseDir = "C:/u/.poracode";
    const path = managedNodePath(baseDir, "win-x64");
    expect(path.replaceAll("\\", "/")).toBe(
      `C:/u/.poracode/runtime/${nodeArchiveDirName("win-x64")}/node.exe`,
    );
  });
});

describe("resolveNativeNode managed-runtime fast path", () => {
  it("returns the managed binary without spawning the probe when present", async () => {
    const baseDir = makeTempDir();
    const target = detectNativeNodeTarget();
    if (!target) {
      // Unsupported test platform — skip without failing.
      return;
    }
    const nodePath = managedNodePath(baseDir, target);
    mkdirSync(join(baseDir, "runtime", nodeArchiveDirName(target)), { recursive: true });
    if (target.startsWith("win-")) {
      writeFileSync(nodePath, "stub");
    } else {
      const dirOfNode = join(baseDir, "runtime", nodeArchiveDirName(target), "bin");
      mkdirSync(dirOfNode, { recursive: true });
      writeFileSync(nodePath, "stub");
    }

    const events: string[] = [];
    const resolved = await resolveNativeNode({
      baseDir,
      skipBackgroundInstall: true,
      onProgress: (e) => events.push(e.kind),
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.source).toBe("lightcode-managed");
    expect(resolved?.nodePath).toBe(nodePath);
    expect(events).toContain("probe-start");
    expect(events).toContain("probe-found-managed");
    // Probe never had to run a shell — managed fast path short-circuited.
    expect(events).not.toContain("probe-found-user");
    expect(events).not.toContain("probe-missing");
  });

  it("memoizes result across calls (probe runs once)", async () => {
    const baseDir = makeTempDir();
    const target = detectNativeNodeTarget();
    if (!target) return;
    const nodePath = managedNodePath(baseDir, target);
    mkdirSync(join(baseDir, "runtime", nodeArchiveDirName(target)), { recursive: true });
    if (!target.startsWith("win-")) {
      mkdirSync(join(baseDir, "runtime", nodeArchiveDirName(target), "bin"), { recursive: true });
    }
    writeFileSync(nodePath, "stub");

    const a = await resolveNativeNode({ baseDir, skipBackgroundInstall: true });
    const b = await resolveNativeNode({ baseDir, skipBackgroundInstall: true });
    // Same in-memory promise → same object (race-free shared probe).
    expect(a).toBe(b);
  });
});

describe("installNativeRuntime", () => {
  it("end-to-end: download → verify → extract → atomic-rename → finalNodePath exists", async () => {
    const baseDir = makeTempDir();
    const target = detectNativeNodeTarget();
    if (!target) return;

    const result = await installNativeRuntime(baseDir, target);

    const expectedNodePath = managedNodePath(baseDir, target);
    expect(result.nodePath).toBe(expectedNodePath);
    expect(existsSync(expectedNodePath)).toBe(true);
    expect(existsSync(join(baseDir, "runtime", nodeArchiveDirName(target)))).toBe(true);

    // Staging dir cleaned up — no `.staging-*` left over after success.
    const runtimeDir = join(baseDir, "runtime");
    const { readdirSync } = await import("node:fs");
    const leftover = readdirSync(runtimeDir).filter((e) => e.startsWith(".staging-"));
    expect(leftover).toEqual([]);
  });

  it("idempotent: returns early when the managed binary is already present", async () => {
    const baseDir = makeTempDir();
    const target = detectNativeNodeTarget();
    if (!target) return;

    const expectedNodePath = managedNodePath(baseDir, target);
    const dir = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
    const archiveDir = join(dir, "runtime", nodeArchiveDirName(target));
    if (target.startsWith("win-")) {
      mkdirSync(archiveDir, { recursive: true });
    } else {
      mkdirSync(join(archiveDir, "bin"), { recursive: true });
    }
    writeFileSync(expectedNodePath, "pre-existing-stub");

    const result = await installNativeRuntime(baseDir, target);
    expect(result.nodePath).toBe(expectedNodePath);

    const { readFileSync } = await import("node:fs");
    expect(readFileSync(expectedNodePath, "utf8")).toBe("pre-existing-stub");

    // No `.staging-*` dir created because we short-circuited.
    const runtimeDir = join(baseDir, "runtime");
    const { readdirSync } = await import("node:fs");
    const leftover = readdirSync(runtimeDir).filter((e) => e.startsWith(".staging-"));
    expect(leftover).toEqual([]);
  });

  it("replaces a partial existing dir if the archive dir already exists", async () => {
    const baseDir = makeTempDir();
    const target = detectNativeNodeTarget();
    if (!target) return;

    // Create a half-finished archive dir with a sentinel file. Install
    // should blow it away and replace it (the runtime dir is owned
    // exclusively by lightcode).
    const finalDir = join(baseDir, "runtime", nodeArchiveDirName(target));
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "leftover-from-previous-attempt"), "x");

    const result = await installNativeRuntime(baseDir, target);
    expect(existsSync(result.nodePath)).toBe(true);
    expect(existsSync(join(finalDir, "leftover-from-previous-attempt"))).toBe(false);
  });
});

describe("resolveNativeNode probe-missing path", () => {
  it("returns null and emits probe-missing when neither managed nor user node exists", async () => {
    const baseDir = makeTempDir();
    const events: string[] = [];

    // Force the user probe to fail by clearing PATH so `where node` /
    // `command -v node` find nothing (use SHELL=/bin/false on POSIX so the
    // login-shell spawn exits non-zero).
    const originalShell = process.env.SHELL;
    const originalPath = process.env.PATH;
    process.env.SHELL = "/bin/false";
    process.env.PATH = "";

    try {
      const resolved = await resolveNativeNode({
        baseDir,
        skipBackgroundInstall: true,
        onProgress: (e) => events.push(e.kind),
      });
      expect(resolved).toBeNull();
      expect(events).toContain("probe-start");
      expect(events).toContain("probe-missing");
    } finally {
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });
});
