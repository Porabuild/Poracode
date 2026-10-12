import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import {
  ACP_ADDITIONAL_ROOT_LIMITS,
  acpAdditionalDirectoriesParams,
  snapshotAcpAdditionalDirectories,
  validateAcpAdditionalDirectories,
} from "./sessionWorkspaceRoots";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn<typeof actual.stat>(actual.stat) };
});

const primary: ProjectLocation = { kind: "posix", path: "/owned/primary" };
const extra: ProjectLocation = { kind: "posix", path: "/owned/extra" };
const wsl = (linuxPath: string, distro = "TestDistro"): ProjectLocation => ({
  kind: "wsl",
  distro,
  linuxPath,
  uncPath: toWslUncPath(distro, linuxPath),
});
afterEach(() => vi.restoreAllMocks());

describe("approved ACP workspace root snapshot", () => {
  it("normalizes, stably deduplicates, excludes primary, and detaches/freeze all grants", () => {
    const mutable = { ...extra };
    const input = [
      mutable,
      { ...primary },
      { ...extra, path: "/owned/extra/./" },
      { ...extra, path: "/owned/second" },
    ];
    const roots = snapshotAcpAdditionalDirectories(primary, input);
    mutable.path = "/owned/unapproved";
    input.pop();
    expect(roots).toEqual([extra, { ...extra, path: "/owned/second" }]);
    expect(Object.isFrozen(roots)).toBe(true);
    expect(roots.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    { kind: "posix", path: "relative" },
    { kind: "posix", path: "/owned/\0bad" },
    { kind: "posix", path: "" },
    { kind: "posix", path: 7 },
    { kind: "windows", path: "C:\\owned" },
    { kind: "posix", path: "/owned/extra", remoteServerId: "other-host" },
  ])("rejects malformed/cross-environment input %j", (entry) => {
    expect(() => snapshotAcpAdditionalDirectories(primary, [entry as ProjectLocation])).toThrow(
      /./,
    );
  });

  it("rejects a local root for a remote primary and accepts the identical execution host", () => {
    const remotePrimary = { ...primary, remoteServerId: "host-a" };
    expect(() => snapshotAcpAdditionalDirectories(remotePrimary, [extra])).toThrow(
      "execution host",
    );
    expect(
      snapshotAcpAdditionalDirectories(remotePrimary, [{ ...extra, remoteServerId: "host-a" }]),
    ).toHaveLength(1);
  });

  it("bounds count before dedup, individual paths, and total input", () => {
    expect(() =>
      snapshotAcpAdditionalDirectories(
        primary,
        Array.from({ length: 17 }, () => extra),
      ),
    ).toThrow("Too many");
    expect(() =>
      snapshotAcpAdditionalDirectories(primary, [{ ...extra, path: "/".repeat(4097) }]),
    ).toThrow("Invalid");
    expect(() =>
      snapshotAcpAdditionalDirectories(
        primary,
        Array.from({ length: 16 }, (_, i) => ({ ...extra, path: `/${i}/${"a".repeat(2200)}` })),
      ),
    ).toThrow("too large");
    expect(ACP_ADDITIONAL_ROOT_LIMITS).toEqual({ count: 16, path: 4096, total: 32768 });
  });

  it("requires one WSL distro and a matching host mapping", () => {
    expect(() =>
      snapshotAcpAdditionalDirectories(wsl("/work/primary"), [wsl("/work/extra", "OtherDistro")]),
    ).toThrow("environment");
    expect(() =>
      snapshotAcpAdditionalDirectories(wsl("/work/primary"), [
        { ...wsl("/work/extra"), uncPath: "\\\\other-host\\share" } as ProjectLocation,
      ]),
    ).toThrow("mapping");
    const roots = snapshotAcpAdditionalDirectories(wsl("/work/primary"), [wsl("/work/extra")]);
    expect(acpAdditionalDirectoriesParams(roots, { additionalDirectories: {} })).toEqual({
      additionalDirectories: ["/work/extra"],
    });
  });

  it("normalizes Windows case/dedup and rejects drive-relative, device and WSL paths", () => {
    const windows: ProjectLocation = { kind: "windows", path: "C:\\Primary" };
    expect(
      snapshotAcpAdditionalDirectories(windows, [
        { kind: "windows", path: "c:/primary/" },
        { kind: "windows", path: "C:/Extra/" },
        { kind: "windows", path: "c:/extra" },
      ]),
    ).toEqual([{ kind: "windows", path: "C:\\Extra" }]);
    for (const path of [
      "C:extra",
      "\\extra",
      "\\\\?\\C:\\extra",
      toWslUncPath("TestDistro", "/extra"),
    ]) {
      expect(() => snapshotAcpAdditionalDirectories(windows, [{ kind: "windows", path }])).toThrow(
        /./,
      );
    }
  });

  it("fails closed without standard capability, leaving old empty-root inputs compatible", () => {
    for (const capability of [undefined, {}, { additionalDirectories: null }]) {
      expect(() => acpAdditionalDirectoriesParams([extra], capability)).toThrow("does not support");
      expect(acpAdditionalDirectoriesParams([], capability)).toEqual({});
    }
  });

  it("checks actual directories and rejects missing paths and regular files", async () => {
    const base = await mkdtemp(join(tmpdir(), "acp-roots-"));
    try {
      await mkdir(join(base, "extra"));
      await writeFile(join(base, "file"), "fixture");
      const root = (name: string): ProjectLocation => ({
        kind: process.platform === "win32" ? "windows" : "posix",
        path: join(base, name),
      });
      await expect(validateAcpAdditionalDirectories([root("extra")])).resolves.toBeUndefined();
      await expect(validateAcpAdditionalDirectories([root("missing")])).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(validateAcpAdditionalDirectories([root("file")])).rejects.toThrow(
        "not a directory",
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("validates WSL paths through the established owning-distro/DrvFs host mappings", async () => {
    const stat = vi.mocked(fs.stat);
    stat.mockClear();
    stat.mockResolvedValueOnce({ isDirectory: () => true } as Awaited<ReturnType<typeof fs.stat>>);
    stat.mockResolvedValueOnce({ isDirectory: () => true } as Awaited<ReturnType<typeof fs.stat>>);
    await validateAcpAdditionalDirectories([wsl("/work/extra"), wsl("/mnt/c/work/extra")]);
    expect(stat.mock.calls.map(([path]) => path)).toEqual([
      toWslUncPath("TestDistro", "/work/extra"),
      "C:\\work\\extra",
    ]);
  });
});
