import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  rmSync: vi.fn<(...args: unknown[]) => void>(),
  renameSync: vi.fn<(...args: unknown[]) => void>(),
  readdirSync: vi.fn<(...args: unknown[]) => string[]>(),
}));

const rmMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, ...fsMocks };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, rm: rmMock };
});

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn<(ms?: number) => Promise<void>>(async () => undefined),
}));

import {
  acpRegistryAgentInstallDir,
  pruneAcpRegistryPendingDeletes,
  removeAcpRegistryInstallDir,
} from "./acpRegistryInstallDir";

const baseDir = join("/data", "poracode");
const installDir = acpRegistryAgentInstallDir(baseDir, "goose");

beforeEach(() => {
  for (const mock of Object.values(fsMocks)) mock.mockReset();
  rmMock.mockReset().mockResolvedValue(undefined);
  fsMocks.readdirSync.mockReturnValue([]);
});

function epermOnce(): Error {
  return Object.assign(new Error("EPERM, Permission denied"), { code: "EPERM" });
}

describe("removeAcpRegistryInstallDir", () => {
  it("retries a lock that clears while the killed agent finishes exiting", async () => {
    fsMocks.rmSync.mockImplementationOnce(() => {
      throw epermOnce();
    });

    await removeAcpRegistryInstallDir(installDir);

    expect(fsMocks.rmSync).toHaveBeenCalledTimes(2);
    expect(fsMocks.rmSync).toHaveBeenLastCalledWith(installDir, { recursive: true, force: true });
    expect(fsMocks.renameSync).not.toHaveBeenCalled();
  });

  it("parks a permanently locked directory instead of failing the removal", async () => {
    fsMocks.rmSync.mockImplementation((target) => {
      if (target === installDir) throw epermOnce();
    });

    await expect(removeAcpRegistryInstallDir(installDir)).resolves.toBeUndefined();

    expect(fsMocks.renameSync).toHaveBeenCalledTimes(1);
    const [from, to] = fsMocks.renameSync.mock.calls[0] as [string, string];
    expect(from).toBe(installDir);
    expect(to.startsWith(join(baseDir, "acp-registry", ".pending-delete-goose-"))).toBe(true);
    // The parked copy is swept immediately when its handle is already gone.
    expect(fsMocks.rmSync).toHaveBeenLastCalledWith(to, { recursive: true, force: true });
  });

  it("stays silent when even the rename is refused", async () => {
    fsMocks.rmSync.mockImplementation(() => {
      throw epermOnce();
    });
    fsMocks.renameSync.mockImplementation(() => {
      throw epermOnce();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(removeAcpRegistryInstallDir(installDir)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("pruneAcpRegistryPendingDeletes", () => {
  const root = join(baseDir, "acp-registry");

  /** Mimic `readdirSync` over a real install tree keyed by absolute path. */
  function mockTree(tree: Record<string, string[]>) {
    fsMocks.readdirSync.mockImplementation((dir) => {
      const entries = tree[dir as string];
      if (!entries) throw Object.assign(new Error("ENOTDIR"), { code: "ENOTDIR" });
      return entries;
    });
  }

  it("deletes parked leftovers and leaves installed agents alone", async () => {
    mockTree({
      [root]: [".pending-delete-goose-123-0", "goose", "gemini"],
      [join(root, "goose")]: ["1.0.0"],
      [join(root, "goose", "1.0.0")]: ["bin"],
      [join(root, "gemini")]: [],
    });

    await pruneAcpRegistryPendingDeletes(baseDir);

    expect(rmMock).toHaveBeenCalledExactlyOnceWith(join(root, ".pending-delete-goose-123-0"), {
      recursive: true,
      force: true,
    });
  });

  it("sweeps a parked bin dir left by a locked binary reinstall", async () => {
    // `binaryInstance` wipes `<root>/<agentId>/<version>/bin`, so its parked
    // copy lands two levels below the root — a root-only scan would leak it.
    mockTree({
      [root]: ["goose"],
      [join(root, "goose")]: ["1.0.0"],
      [join(root, "goose", "1.0.0")]: [".pending-delete-bin-123-0", "bin"],
      [join(root, "goose", "1.0.0", "bin")]: ["goose.exe"],
    });

    await pruneAcpRegistryPendingDeletes(baseDir);

    expect(rmMock).toHaveBeenCalledExactlyOnceWith(
      join(root, "goose", "1.0.0", ".pending-delete-bin-123-0"),
      { recursive: true, force: true },
    );
  });

  it("no-ops when the registry install root does not exist", async () => {
    fsMocks.readdirSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    await expect(pruneAcpRegistryPendingDeletes(baseDir)).resolves.toBeUndefined();
    expect(rmMock).not.toHaveBeenCalled();
  });
});
