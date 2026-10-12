import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import {
  assertAcpCanonicalHostFsPath,
  resolveAcpReadableHostFsPath,
  resolveAcpWritableHostFsPath,
} from "./sessionPaths";

const canonicalPaths = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    realpath: vi.fn<(path: string) => Promise<string>>(
      async (path) => canonicalPaths.get(path) ?? path,
    ),
  };
});

function wslHome(): ProjectLocation {
  return {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/u",
    uncPath: toWslUncPath("Ubuntu", "/home/u"),
  };
}

describe("resolveAcpReadableHostFsPath outside a WSL project", () => {
  it("maps DrvFs automount paths to the native drive path, not the refused UNC loop", () => {
    expect(resolveAcpReadableHostFsPath(wslHome(), "/mnt/c/Users/me/shot.png")).toBe(
      "C:\\Users\\me\\shot.png",
    );
  });

  it("keeps the UNC path for native distro paths", () => {
    expect(resolveAcpReadableHostFsPath(wslHome(), "/opt/tool/file.txt")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\opt\\tool\\file.txt",
    );
  });
});

describe("approved sibling host path mappings", () => {
  it("maps WSL sibling Linux and DrvFs roots without changing the primary relative base", () => {
    const primary: ProjectLocation = {
      kind: "wsl",
      distro: "TestDistro",
      linuxPath: "/work/primary",
      uncPath: toWslUncPath("TestDistro", "/work/primary"),
    };
    const roots: ProjectLocation[] = ["/work/extra", "/mnt/c/extra"].map((linuxPath) => ({
      kind: "wsl",
      distro: "TestDistro",
      linuxPath,
      uncPath: toWslUncPath("TestDistro", linuxPath),
    }));
    expect(resolveAcpReadableHostFsPath(primary, "/work/extra/file", [], roots)).toBe(
      toWslUncPath("TestDistro", "/work/extra/file"),
    );
    expect(resolveAcpWritableHostFsPath(primary, "/mnt/c/extra/file", [], roots)).toBe(
      "C:\\extra\\file",
    );
    expect(resolveAcpReadableHostFsPath(primary, "file", [], roots)).toBe(
      toWslUncPath("TestDistro", "/work/primary/file"),
    );
    expect(() =>
      resolveAcpReadableHostFsPath(primary, "/work/extra-prefix/file", [], roots),
    ).toThrow("Invalid params");
  });
  it("uses Windows segment membership and permits ordinary names beginning with dots", () => {
    const primary: ProjectLocation = { kind: "windows", path: "C:\\primary" };
    const roots: ProjectLocation[] = [{ kind: "windows", path: "C:\\extra" }];
    expect(resolveAcpReadableHostFsPath(primary, "c:/extra/..ordinary", [], roots)).toBe(
      "c:\\extra\\..ordinary",
    );
    expect(() => resolveAcpWritableHostFsPath(primary, "C:/extra-prefix/file", [], roots)).toThrow(
      "Invalid params",
    );
  });
});

it("preserves linked global skill entries as explicit read-only grants, containing nested links", async () => {
  const primary: ProjectLocation = { kind: "posix", path: "/work/primary" };
  const skill = "/home/u/.agents/skills/approved";
  canonicalPaths.set(skill, "/managed/approved");
  canonicalPaths.set(`${skill}/SKILL.md`, "/managed/approved/SKILL.md");
  canonicalPaths.set(`${skill}/escape`, "/unapproved/secret");
  await expect(
    assertAcpCanonicalHostFsPath(primary, `${skill}/SKILL.md`, "read"),
  ).resolves.toBeUndefined();
  await expect(
    assertAcpCanonicalHostFsPath(primary, `${skill}/escape`, "read"),
  ).rejects.toMatchObject({ code: -32602 });
  await expect(
    assertAcpCanonicalHostFsPath(primary, `${skill}/SKILL.md`, "write"),
  ).rejects.toMatchObject({ code: -32602 });
  await expect(assertAcpCanonicalHostFsPath(primary, skill, "terminal")).rejects.toMatchObject({
    code: -32602,
  });
  canonicalPaths.clear();
});

it("preserves declared home-state read/write roots without extending terminal cwd scope", async () => {
  const primary: ProjectLocation = { kind: "posix", path: "/work/primary" };
  const state = "/home/u/.test-state/file";
  for (const access of ["read", "write"] as const) {
    await expect(
      assertAcpCanonicalHostFsPath(primary, state, access, [".test-state"]),
    ).resolves.toBeUndefined();
  }
  await expect(
    assertAcpCanonicalHostFsPath(primary, state, "terminal", [".test-state"]),
  ).rejects.toMatchObject({ code: -32602 });
});
