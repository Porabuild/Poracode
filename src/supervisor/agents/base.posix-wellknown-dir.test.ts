import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr?: string }>>(),
);
const statSyncMock = vi.hoisted(() =>
  vi.fn<(path: string) => { isFile: () => boolean; mode: number }>(),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const { promisify } = require("node:util") as typeof import("node:util");
  return {
    ...actual,
    // resolveExecutablePath (sync) goes through spawnSync — pretend `command -v`
    // found nothing so the well-known-dir fallback runs.
    spawnSync: vi.fn<() => { status: number; stdout: string; stderr: string; error: undefined }>(
      () => ({ status: 1, stdout: "", stderr: "", error: undefined }),
    ),
    execFile: Object.assign(vi.fn(), {
      [promisify.custom]: execFileAsyncMock,
    }),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, statSync: statSyncMock };
});

import {
  clearExecutablePathCache,
  findPosixExecutableInWellKnownDirs,
  resolveExecutablePath,
  resolveExecutablePathAsync,
} from "./base";
import { clearAgentBinaryPathCache, resolveAgentBinaryPath } from "./binaryResolver";

const openCodePath = join(homedir(), ".opencode", "bin", "opencode");

// statSync answers "executable regular file" only for the OpenCode well-known
// path; everything else throws ENOENT like the real fs would.
function mockOnlyOpenCodeInstalled() {
  statSyncMock.mockImplementation((p: string) => {
    if (p === openCodePath) return { isFile: () => true, mode: 0o755 };
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

describe.skipIf(process.platform === "win32")("POSIX well-known-dir binary fallback", () => {
  const originalShell = process.env.SHELL;

  beforeEach(() => {
    vi.clearAllMocks();
    clearExecutablePathCache();
    clearAgentBinaryPathCache();
    process.env.SHELL = "/bin/zsh";
  });

  afterAll(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
  });

  it("finds a binary in ~/.<binary>/bin when command -v misses (async)", async () => {
    mockOnlyOpenCodeInstalled();
    // Login-shell `command -v opencode` resolves to nothing (fish-only PATH).
    execFileAsyncMock.mockResolvedValue({ stdout: "", stderr: "" });

    await expect(resolveExecutablePathAsync("opencode")).resolves.toBe(openCodePath);
  });

  it("finds a binary in ~/.<binary>/bin when command -v misses (sync)", () => {
    mockOnlyOpenCodeInstalled();
    expect(resolveExecutablePath("opencode")).toBe(openCodePath);
  });

  it("returns undefined when the binary is in none of the well-known dirs", () => {
    statSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(findPosixExecutableInWellKnownDirs("ghost-agent")).toBeUndefined();
  });

  it("ignores a non-executable match", () => {
    statSyncMock.mockImplementation((p: string) => {
      if (p === openCodePath) return { isFile: () => true, mode: 0o644 };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(findPosixExecutableInWellKnownDirs("opencode")).toBeUndefined();
  });

  it("resolves the launch binary path from well-known dirs on a cold cache", () => {
    mockOnlyOpenCodeInstalled();
    expect(resolveAgentBinaryPath({ kind: "posix", path: "/tmp/project" }, "opencode")).toBe(
      openCodePath,
    );
  });
});
