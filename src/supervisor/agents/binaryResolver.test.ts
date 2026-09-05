import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveExecutablePath = vi.fn<(command: string) => string | undefined>();

vi.mock("./base", () => ({
  findPosixExecutableInWellKnownDirs: vi.fn<() => string | undefined>(() => undefined),
  getCachedExecutablePath: vi.fn<() => string | undefined>(() => undefined),
  isExecutableRegularFile: vi.fn<() => boolean>(() => false),
  resolveExecutablePath: (command: string) => resolveExecutablePath(command),
}));

import { clearAgentBinaryPathCache, resolveAgentBinaryPath } from "./binaryResolver";

const windowsLocation = { kind: "windows", path: "C:\\proj" } as const;

describe("resolveAgentBinaryPath (windows)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poracode-binres-"));
    clearAgentBinaryPathCache();
    resolveExecutablePath.mockReset();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("caches a resolved path while it still exists", () => {
    const shim = join(dir, "codex.cmd");
    writeFileSync(shim, "@echo off");
    resolveExecutablePath.mockReturnValue(shim);

    expect(resolveAgentBinaryPath(windowsLocation, "codex")).toBe(shim);
    expect(resolveAgentBinaryPath(windowsLocation, "codex")).toBe(shim);
    expect(resolveExecutablePath).toHaveBeenCalledTimes(1);
  });

  it("re-resolves when the cached path no longer exists", () => {
    const stale = join(dir, "old", "codex.cmd");
    const fresh = join(dir, "codex.cmd");
    writeFileSync(fresh, "@echo off");
    resolveExecutablePath.mockReturnValueOnce(stale).mockReturnValueOnce(fresh);

    expect(resolveAgentBinaryPath(windowsLocation, "codex")).toBe(stale);
    expect(resolveAgentBinaryPath(windowsLocation, "codex")).toBe(fresh);
    expect(resolveExecutablePath).toHaveBeenCalledTimes(2);
  });

  it("caches a negative lookup", () => {
    resolveExecutablePath.mockReturnValue(undefined);

    expect(resolveAgentBinaryPath(windowsLocation, "codex")).toBeUndefined();
    expect(resolveAgentBinaryPath(windowsLocation, "codex")).toBeUndefined();
    expect(resolveExecutablePath).toHaveBeenCalledTimes(1);
  });
});
