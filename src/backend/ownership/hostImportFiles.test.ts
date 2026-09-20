import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyImportFiles, inventoryImportFiles } from "./hostImportFiles";

const roots: string[] = [];

function scratch(): string {
  const created = mkdtempSync(join(tmpdir(), "poracode-host-import-files-"));
  roots.push(created);
  return realpathSync.native(created);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A promotion-shaped source: desktop namespace root with a direct userData child. */
function seedPromotionSource(): string {
  const root = scratch();
  const source = join(root, "namespace");
  mkdirSync(join(source, "userData", "Cache"), { recursive: true });
  writeFileSync(join(source, "userData", "Cache", "data_0"), "cached");
  mkdirSync(join(source, "userData", "Code Cache"), { recursive: true });
  writeFileSync(join(source, "userData", "Code Cache", "js"), "code-cache");
  mkdirSync(join(source, "userData", "GPUCache"), { recursive: true });
  writeFileSync(join(source, "userData", "GPUCache", "data_1"), "gpu");
  mkdirSync(join(source, "userData", "Service Worker", "ScriptCache"), { recursive: true });
  writeFileSync(join(source, "userData", "Service Worker", "ScriptCache", "index"), "sw");
  mkdirSync(join(source, "userData", "Partitions", "p1", "Cache"), { recursive: true });
  writeFileSync(join(source, "userData", "Partitions", "p1", "Cache", "x"), "part");
  mkdirSync(join(source, "userData", "Partitions", "p1", "Session Storage"), { recursive: true });
  writeFileSync(join(source, "userData", "Partitions", "p1", "Session Storage", "s"), "session");
  // A user project nested well away from the Chromium root, legitimately
  // named like a cache — and even like the Electron userData itself.
  mkdirSync(join(source, "projects", "demo", "Cache"), { recursive: true });
  writeFileSync(join(source, "projects", "demo", "Cache", "keep-me"), "project-cache");
  mkdirSync(join(source, "projects", "demo", "userData", "Cache"), { recursive: true });
  writeFileSync(join(source, "projects", "demo", "userData", "Cache", "mine"), "user-data-dir");
  mkdirSync(join(source, "projects", "demo", "userData", "Partitions", "p9", "Cache"), {
    recursive: true,
  });
  writeFileSync(
    join(source, "projects", "demo", "userData", "Partitions", "p9", "Cache", "also-mine"),
    "user-partition",
  );
  writeFileSync(join(source, "state.sqlite"), "database");
  return source;
}

describe("inventoryImportFiles excludeChromiumCaches", () => {
  it("excludes caches at the userData root and Partitions/*/Cache, and copies everything else", () => {
    const source = seedPromotionSource();
    const full = inventoryImportFiles(source);
    const scoped = inventoryImportFiles(source, { excludeChromiumCaches: true });

    // The full (offline-backup) inventory keeps everything…
    expect(full.entries.map((entry) => entry.path)).toContain("userData/Cache/data_0");
    expect(full.entries.map((entry) => entry.path)).toContain("userData/Partitions/p1/Cache/x");

    // …while the promotion inventory drops exactly the Chromium-owned caches.
    const paths = scoped.entries.map((entry) => entry.path);
    expect(paths).not.toContain("userData/Cache");
    expect(paths).not.toContain("userData/Cache/data_0");
    expect(paths).not.toContain("userData/Code Cache/js");
    expect(paths).not.toContain("userData/GPUCache/data_1");
    expect(paths).not.toContain("userData/Service Worker/ScriptCache/index");
    expect(paths).not.toContain("userData/Partitions/p1/Cache");
    expect(paths).not.toContain("userData/Partitions/p1/Cache/x");
    // Non-cache userData content at the same depths survives…
    expect(paths).toContain("userData/Partitions/p1/Session Storage/s");
    // …and same-named user directories at other depths are copied, not
    // treated as Chromium roots (the exclusion is scoped to the userData
    // ROOT of the source).
    expect(paths).toContain("projects/demo/Cache");
    expect(paths).toContain("projects/demo/Cache/keep-me");
    expect(paths).toContain("projects/demo/userData/Cache/mine");
    expect(paths).toContain("projects/demo/userData/Partitions/p9/Cache/also-mine");
    expect(scoped.bytes).toBeLessThan(full.bytes);
  });

  it("skips the runtime singleton symlinks only at the userData root", () => {
    const source = seedPromotionSource();
    symlinkSync("poracode-1000.sock", join(source, "userData", "SingletonLock"));
    // A nested regular file that shares the name stays in the inventory.
    writeFileSync(join(source, "projects", "demo", "userData", "SingletonLock"), "user-lock");

    const scoped = inventoryImportFiles(source, {
      skipRuntimeSingletonSymlinks: true,
      excludeChromiumCaches: true,
    });
    const paths = scoped.entries.map((entry) => entry.path);
    expect(paths).not.toContain("userData/SingletonLock");
    expect(paths).toContain("projects/demo/userData/SingletonLock");
    // With the skip off, the root singleton is refused like any symlink.
    expect(() =>
      inventoryImportFiles(source, {
        skipRuntimeSingletonSymlinks: false,
        excludeChromiumCaches: true,
      }),
    ).toThrow(/symbolic link/u);
  });
});

describe("copyImportFiles", () => {
  it("copies exactly the scoped inventory and the copy re-inventories identically", () => {
    const source = seedPromotionSource();
    const options = { excludeChromiumCaches: true } as const;
    const inventory = inventoryImportFiles(source, options);
    const destination = join(scratch(), "staged");

    const progress: Array<[number, number]> = [];
    copyImportFiles(source, destination, inventory, {
      ...options,
      onCopyProgress: (copied, total) => progress.push([copied, total]),
    });

    // The receipt (staged inventory) reflects exactly the exclusion shape.
    const paths = inventory.entries.map((entry) => entry.path);
    expect(paths).not.toContain("userData/Cache");
    expect(paths).toContain("projects/demo/Cache/keep-me");
    expect(existsSync(join(destination, "userData", "Cache"))).toBe(false);
    expect(existsSync(join(destination, "userData", "Partitions", "p1", "Cache"))).toBe(false);
    expect(readFileSync(join(destination, "projects", "demo", "Cache", "keep-me"), "utf8")).toBe(
      "project-cache",
    );
    expect(
      readFileSync(
        join(destination, "projects", "demo", "userData", "Partitions", "p9", "Cache", "also-mine"),
        "utf8",
      ),
    ).toBe("user-partition");
    expect(progress.at(-1)?.[0]).toBe(inventory.bytes);
    expect(progress.at(-1)?.[1]).toBe(inventory.bytes);
    // Root bookkeeping entries never enter the inventory (the database
    // migrates through the SQLite backup API instead).
    expect(paths).not.toContain("state.sqlite");
    expect(existsSync(join(destination, "state.sqlite"))).toBe(false);
  });
});
