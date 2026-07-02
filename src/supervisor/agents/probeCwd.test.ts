import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const mkdirSyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => string | undefined>());

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    mkdirSync: mkdirSyncMock,
  };
});

import { getAgentProbeCwd, resolveProbeSpawnCwd } from "./probeCwd";

const probeDir = join(homedir(), ".poracode", "agent-probe");

beforeEach(() => {
  mkdirSyncMock.mockReset();
  mkdirSyncMock.mockReturnValue(undefined);
});

afterEach(() => {
  // The module caches the probe dir on the first successful mkdir. Vitest
  // module isolation gives each test fresh state, but if that changes the
  // afterEach keeps disk side-effect-free anyway.
  try {
    rmSync(probeDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("getAgentProbeCwd", () => {
  it("returns the contained probe dir for posix locations", () => {
    const cwd = getAgentProbeCwd({ kind: "posix", path: "/Users/demo/project" });
    expect(cwd).toBe(probeDir);
    expect(mkdirSyncMock).toHaveBeenCalledWith(probeDir, { recursive: true });
  });

  it("re-mkdirs on every call so the cache survives external deletion", () => {
    getAgentProbeCwd({ kind: "posix", path: "/Users/demo/project" });
    getAgentProbeCwd({ kind: "posix", path: "/Users/demo/project" });
    getAgentProbeCwd({ kind: "posix", path: "/Users/demo/project" });
    expect(mkdirSyncMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to the project posix path when mkdir fails", () => {
    mkdirSyncMock.mockImplementationOnce(() => {
      throw new Error("EACCES");
    });
    const cwd = getAgentProbeCwd({ kind: "posix", path: "/Users/demo/project" });
    expect(cwd).toBe("/Users/demo/project");
  });

  it("returns the linux path for WSL locations without touching mkdir", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/project",
      uncPath: "\\\\wsl$\\Ubuntu\\home\\demo\\project",
    };
    expect(getAgentProbeCwd(location)).toBe("/home/demo/project");
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  it("returns the native path for Windows locations without touching mkdir", () => {
    const cwd = getAgentProbeCwd({ kind: "windows", path: "C:\\Users\\demo\\project" });
    expect(cwd).toBe("C:\\Users\\demo\\project");
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });
});

describe("resolveProbeSpawnCwd", () => {
  it("redirects posix spawns into the probe dir, ignoring spec.cwd", () => {
    expect(
      resolveProbeSpawnCwd({ kind: "posix", path: "/Users/demo/project" }, "/something/else"),
    ).toBe(probeDir);
  });

  it("passes spec.cwd through unchanged for WSL", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/project",
      uncPath: "\\\\wsl$\\Ubuntu\\home\\demo\\project",
    };
    expect(resolveProbeSpawnCwd(location, "/tmp")).toBe("/tmp");
    expect(resolveProbeSpawnCwd(location, undefined)).toBeUndefined();
  });

  it("passes spec.cwd through unchanged for Windows", () => {
    const location: ProjectLocation = { kind: "windows", path: "C:\\proj" };
    expect(resolveProbeSpawnCwd(location, "C:\\elsewhere")).toBe("C:\\elsewhere");
    expect(resolveProbeSpawnCwd(location, undefined)).toBeUndefined();
  });
});
