import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDirectory, ensureDirectorySync } from "./ensureDirectory";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdir: vi.fn<typeof actual.mkdir>(actual.mkdir) };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, mkdirSync: vi.fn<typeof actual.mkdirSync>(actual.mkdirSync) };
});

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-ensure-directory-"));
  roots.push(root);
  return root;
}

function eisdir(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`EISDIR: illegal operation on a directory, mkdir '${path}'`), {
    code: "EISDIR",
  });
}

afterEach(() => {
  vi.mocked(fsPromises.mkdir).mockClear();
  vi.mocked(fs.mkdirSync).mockClear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ensureDirectory", () => {
  it("creates nested directories", async () => {
    const target = join(makeRoot(), "a", "b", "c");
    await ensureDirectory(target);
    expect(statSync(target).isDirectory()).toBe(true);
  });

  it("accepts an existing directory that mkdir rejects with EISDIR (Node 26 WSL UNC share)", async () => {
    const target = makeRoot();
    vi.mocked(fsPromises.mkdir).mockRejectedValueOnce(eisdir(target));
    await expect(ensureDirectory(target)).resolves.toBeUndefined();
  });

  it("reports the original error when the path is not a directory", async () => {
    const file = join(makeRoot(), "file");
    writeFileSync(file, "x");
    await expect(ensureDirectory(file)).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("reports the original error when nothing exists at the path", async () => {
    const target = join(makeRoot(), "missing");
    vi.mocked(fsPromises.mkdir).mockRejectedValueOnce(eisdir(target));
    await expect(ensureDirectory(target)).rejects.toMatchObject({ code: "EISDIR" });
  });
});

describe("ensureDirectorySync", () => {
  it("creates nested directories", () => {
    const target = join(makeRoot(), "a", "b");
    ensureDirectorySync(target);
    expect(statSync(target).isDirectory()).toBe(true);
  });

  it("accepts an existing directory that mkdirSync rejects with EISDIR", () => {
    const target = makeRoot();
    vi.mocked(fs.mkdirSync).mockImplementationOnce(() => {
      throw eisdir(target);
    });
    expect(() => ensureDirectorySync(target)).not.toThrow();
  });

  it("reports the original error when the path is not a directory", () => {
    const file = join(makeRoot(), "file");
    writeFileSync(file, "x");
    expect(() => ensureDirectorySync(file)).toThrow(expect.objectContaining({ code: "EEXIST" }));
  });
});
