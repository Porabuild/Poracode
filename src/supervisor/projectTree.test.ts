import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { ProjectTreeService } from "./projectTree";
import type { WslBridgeClient } from "./wsl/bridge/client";

describe("ProjectTreeService", () => {
  let tempDir: string;
  let location: ProjectLocation;
  let service: ProjectTreeService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lightcode-project-tree-"));
    location =
      process.platform === "win32"
        ? { kind: "windows", path: tempDir }
        : { kind: "posix", path: tempDir };
    service = new ProjectTreeService();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists visible entries and excludes .git", async () => {
    mkdirSync(join(tempDir, ".git"), { recursive: true });
    mkdirSync(join(tempDir, "src"), { recursive: true });
    mkdirSync(join(tempDir, "empty-dir"), { recursive: true });
    writeFileSync(join(tempDir, "README.md"), "# readme\n", "utf8");
    writeFileSync(join(tempDir, "src", "index.ts"), "export {};\n", "utf8");

    const result = await service.listProjectTree({
      projectLocation: location,
      directoryPath: "",
    });

    expect(result.entries).toEqual([
      { path: "empty-dir", name: "empty-dir", type: "directory", hasChildren: false },
      { path: "src", name: "src", type: "directory", hasChildren: true },
      { path: "README.md", name: "README.md", type: "file" },
    ]);
  });

  it("reads utf-8 text files and preserves CRLF on write", async () => {
    writeFileSync(join(tempDir, "note.txt"), "a\r\nb\r\n", "utf8");

    const readResult = await service.readProjectFile({
      projectLocation: location,
      path: "note.txt",
    });
    expect(readResult).toMatchObject({
      path: "note.txt",
      status: "ready",
      content: "a\r\nb\r\n",
      lineEnding: "crlf",
    });

    const saveResult = await service.writeProjectFile({
      projectLocation: location,
      path: "note.txt",
      content: "x\ny\n",
      baseModifiedAtMs: readResult.modifiedAtMs,
    });
    expect(saveResult.modifiedAtMs).toBeGreaterThanOrEqual(readResult.modifiedAtMs);
    expect(readFileSync(join(tempDir, "note.txt"), "utf8")).toBe("x\r\ny\r\n");
  });

  it("marks binary files as non-editable", async () => {
    writeFileSync(join(tempDir, "image.bin"), Buffer.from([0x61, 0x00, 0x62]));

    const result = await service.readProjectFile({
      projectLocation: location,
      path: "image.bin",
    });

    expect(result.status).toBe("binary");
  });

  it("reads absolute file paths inside and outside the project root", async () => {
    const insidePath = join(tempDir, "inside.txt");
    writeFileSync(insidePath, "inside\n", "utf8");
    const externalDir = mkdtempSync(join(tmpdir(), "lightcode-abs-external-"));
    const outsidePath = join(externalDir, "outside.txt");
    writeFileSync(outsidePath, "outside\n", "utf8");

    try {
      await expect(
        service.readAbsoluteFile({
          projectLocation: location,
          absolutePath: insidePath,
        }),
      ).resolves.toMatchObject({ status: "ready", content: "inside\n" });

      // Files outside the project root are allowed — the editor must be able to
      // open any absolute path the user or agent references.
      await expect(
        service.readAbsoluteFile({
          projectLocation: location,
          absolutePath: outsidePath,
        }),
      ).resolves.toMatchObject({ status: "ready", content: "outside\n" });
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("resolves relative readAbsoluteFile paths against the project root", async () => {
    writeFileSync(join(tempDir, "relative.txt"), "relative\n", "utf8");

    await expect(
      service.readAbsoluteFile({
        projectLocation: location,
        absolutePath: "relative.txt",
      }),
    ).resolves.toMatchObject({ status: "ready", content: "relative\n" });
  });

  it("readExternalFile reads files outside the project root", async () => {
    const externalDir = mkdtempSync(join(tmpdir(), "lightcode-external-"));
    const outsidePath = join(externalDir, "outside.txt");
    writeFileSync(outsidePath, "outside\n", "utf8");

    try {
      await expect(
        service.readExternalFile({
          projectLocation: location,
          absolutePath: outsidePath,
        }),
      ).resolves.toMatchObject({ status: "ready", content: "outside\n" });
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("readExternalFile returns 'missing' for nonexistent files", async () => {
    await expect(
      service.readExternalFile({
        projectLocation: location,
        absolutePath: join(tmpdir(), "lightcode-does-not-exist-xyz.txt"),
      }),
    ).resolves.toMatchObject({ status: "missing" });
  });

  it("writeExternalFile saves a file outside the project root", async () => {
    const externalDir = mkdtempSync(join(tmpdir(), "lightcode-external-"));
    const outsidePath = join(externalDir, "writable.txt");
    writeFileSync(outsidePath, "before\n", "utf8");

    try {
      const read = await service.readExternalFile({
        projectLocation: location,
        absolutePath: outsidePath,
      });
      expect(read.status).toBe("ready");

      const result = await service.writeExternalFile({
        projectLocation: location,
        absolutePath: outsidePath,
        content: "after\n",
        baseModifiedAtMs: read.modifiedAtMs,
      });
      expect(result.modifiedAtMs).toBeGreaterThanOrEqual(read.modifiedAtMs);
      expect(readFileSync(outsidePath, "utf8")).toBe("after\n");
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("creates, renames, moves, and deletes entries", async () => {
    mkdirSync(join(tempDir, "src"), { recursive: true });

    await service.createProjectEntry({
      projectLocation: location,
      path: "src/example.ts",
      type: "file",
    });
    expect(existsSync(join(tempDir, "src", "example.ts"))).toBe(true);

    await service.renameProjectEntry({
      projectLocation: location,
      path: "src/example.ts",
      nextName: "renamed.ts",
    });
    expect(existsSync(join(tempDir, "src", "renamed.ts"))).toBe(true);

    await service.createProjectEntry({
      projectLocation: location,
      path: "dest",
      type: "directory",
    });
    await service.moveProjectEntry({
      projectLocation: location,
      path: "src/renamed.ts",
      nextParentPath: "dest",
    });
    expect(existsSync(join(tempDir, "dest", "renamed.ts"))).toBe(true);

    await service.deleteProjectEntry({
      projectLocation: location,
      path: "dest/renamed.ts",
    });
    expect(existsSync(join(tempDir, "dest", "renamed.ts"))).toBe(false);
  });
});

/**
 * Faithful stand-in for the WSL bridge: it applies the SAME project-root
 * containment check as the in-distro `resolveSafePath` (bridge.mjs), so a
 * request whose target escapes the declared `projectRoot` fails with `ESCAPE`
 * exactly as the real bridge would. The supervisor never confines external
 * reads/writes to the project root, so anchoring the bridge's `projectRoot`
 * to `location.linuxPath` for an out-of-root path is what throws
 * "path escapes projectRoot" on WSL.
 */
class ContainmentBridgeClient {
  files = new Map<string, { content: Buffer; mtimeMs: number }>();
  reads: { projectRoot: string; path: string }[] = [];
  writes: { projectRoot: string; path: string }[] = [];

  private resolveOrEscape(projectRoot: string, target: string): string {
    const normRoot = posix.normalize(projectRoot);
    const normTarget = posix.normalize(target);
    const contained =
      posix.isAbsolute(projectRoot) &&
      posix.isAbsolute(target) &&
      (normTarget === normRoot || normTarget.startsWith(`${normRoot}/`));
    if (!contained) {
      throw Object.assign(new Error("path escapes projectRoot"), { code: "ESCAPE" });
    }
    return normTarget;
  }

  async readFile(
    location: { linuxPath: string },
    absolutePath: string,
    options?: { maxBytes?: number },
  ) {
    this.reads.push({ projectRoot: location.linuxPath, path: absolutePath });
    const target = this.resolveOrEscape(location.linuxPath, absolutePath);
    const file = this.files.get(target);
    if (!file) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    if (options?.maxBytes && file.content.length > options.maxBytes) {
      return { tooLarge: true as const, size: file.content.length, mtimeMs: file.mtimeMs };
    }
    return {
      size: file.content.length,
      mtimeMs: file.mtimeMs,
      contentBase64: file.content.toString("base64"),
    };
  }

  async writeFile(
    location: { linuxPath: string },
    absolutePath: string,
    content: Buffer,
    options?: { expectedMtimeMs?: number },
  ) {
    this.writes.push({ projectRoot: location.linuxPath, path: absolutePath });
    const target = this.resolveOrEscape(location.linuxPath, absolutePath);
    const file = this.files.get(target);
    if (!file) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    if (
      options?.expectedMtimeMs !== undefined &&
      Math.abs(file.mtimeMs - options.expectedMtimeMs) > 1
    ) {
      throw Object.assign(new Error("file changed on disk"), { code: "EMTIME" });
    }
    const mtimeMs = file.mtimeMs + 1000;
    this.files.set(target, { content, mtimeMs });
    return { mtimeMs, size: content.length };
  }
}

describe("ProjectTreeService WSL external files", () => {
  function makeWslLocation(linuxPath: string): ProjectLocation {
    return {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath,
      uncPath: `\\\\wsl.localhost\\Ubuntu${linuxPath.replace(/\//g, "\\")}`,
    };
  }

  let service: ProjectTreeService;
  let bridge: ContainmentBridgeClient;

  beforeEach(() => {
    service = new ProjectTreeService();
    bridge = new ContainmentBridgeClient();
    service.setWslClient(bridge as unknown as WslBridgeClient);
  });

  it("readExternalFile reads a path outside the project root on WSL", async () => {
    // A plan produced in a git worktree lives under ~/.lightcode/worktrees,
    // outside the project root.
    const projectRoot = "/home/user/work/repo";
    const planPath = "/home/user/.lightcode/worktrees/repo/branch/PLAN.md";
    bridge.files.set(planPath, { content: Buffer.from("# Plan\n"), mtimeMs: 1000 });

    const result = await service.readExternalFile({
      projectLocation: makeWslLocation(projectRoot),
      absolutePath: planPath,
    });

    expect(result).toMatchObject({ status: "ready", content: "# Plan\n" });
    // The bridge must be anchored at the file's own directory, not the project
    // root — otherwise its containment check rejects the path.
    expect(bridge.reads.at(-1)?.projectRoot).toBe("/home/user/.lightcode/worktrees/repo/branch");
  });

  it("writeExternalFile saves a path outside the project root on WSL", async () => {
    const projectRoot = "/home/user/work/repo";
    const notePath = "/home/user/notes/scratch.md";
    bridge.files.set(notePath, { content: Buffer.from("before\n"), mtimeMs: 5000 });
    const location = makeWslLocation(projectRoot);

    const read = await service.readExternalFile({
      projectLocation: location,
      absolutePath: notePath,
    });
    expect(read.status).toBe("ready");

    const result = await service.writeExternalFile({
      projectLocation: location,
      absolutePath: notePath,
      content: "after\n",
      baseModifiedAtMs: read.modifiedAtMs,
    });

    expect(result.modifiedAtMs).toBeGreaterThan(read.modifiedAtMs);
    expect(bridge.files.get(notePath)?.content.toString("utf8")).toBe("after\n");
    // Both the pre-read and the write anchor the bridge at the file's directory.
    for (const call of [...bridge.reads, ...bridge.writes]) {
      expect(call.projectRoot).toBe("/home/user/notes");
    }
  });

  it("readExternalFile returns 'missing' when the WSL bridge reports ENOENT", async () => {
    const result = await service.readExternalFile({
      projectLocation: makeWslLocation("/home/user/work/repo"),
      absolutePath: "/home/user/does-not-exist.md",
    });
    expect(result.status).toBe("missing");
  });

  it("readAbsoluteFile reads a path outside the project root on WSL", async () => {
    const projectRoot = "/home/user/work/repo";
    const externalPath = "/home/user/.lightcode/worktrees/repo/branch/PLAN.md";
    bridge.files.set(externalPath, { content: Buffer.from("# Plan\n"), mtimeMs: 2000 });

    const result = await service.readAbsoluteFile({
      projectLocation: makeWslLocation(projectRoot),
      absolutePath: externalPath,
    });

    expect(result).toMatchObject({ status: "ready", content: "# Plan\n" });
    expect(bridge.reads.at(-1)?.projectRoot).toBe("/home/user/.lightcode/worktrees/repo/branch");
  });

  it("readAbsoluteFile resolves relative paths against the project root on WSL", async () => {
    const projectRoot = "/home/user/work/repo";
    bridge.files.set(`${projectRoot}/src/index.ts`, {
      content: Buffer.from("export {};\n"),
      mtimeMs: 3000,
    });

    const result = await service.readAbsoluteFile({
      projectLocation: makeWslLocation(projectRoot),
      absolutePath: "src/index.ts",
    });

    expect(result).toMatchObject({ status: "ready", content: "export {};\n" });
  });
});
