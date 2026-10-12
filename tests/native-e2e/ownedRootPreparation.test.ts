import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { closeDatabase, dbGetThreads, initDatabase } from "@/host/db";
import { seedLoadWorkload } from "./helpers/loadWorkloadSeed";
import {
  prepareRealHostFixture,
  REAL_HOST_FIXTURE_KEY,
  trackRealHostPaths,
} from "./harness/realHostRoot";
import { ProcessCleanup } from "./harness/processCleanup";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("production host fixture root preparation", () => {
  it("seeds the mapped owned database and leaves the namespace available for server startup", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-owned-load-fixture-")));
    roots.push(root);
    const namespace = join(root, "profile");
    const paths = resolveHostRootPaths(namespace);
    const seeded = await seedLoadWorkload(namespace);
    expect(existsSync(namespace) ? readdirSync(namespace) : []).toEqual([]);
    expect(existsSync(join(paths.dataRoot, "state.sqlite"))).toBe(true);
    const owner = HostOwnerController.acquire(namespace, "headless");
    try {
      const runtime = await owner.initialize({
        mode: "headless",
        environmentKey: REAL_HOST_FIXTURE_KEY,
      });
      initDatabase(runtime.paths.dbPath);
      try {
        expect(dbGetThreads()).toHaveLength(seeded.threadCount);
        expect(seeded.threadCount).toBe(60);
        expect(seeded.longThreads).toHaveLength(10);
        expect(seeded.longThreads.every((thread) => thread.itemCount === 40)).toBe(true);
      } finally {
        closeDatabase();
      }
    } finally {
      await owner.close();
    }
  });

  it("prepares the Git fixture under the owned root and tracks all sibling state for cleanup", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-owned-git-fixture-")));
    roots.push(root);
    const namespace = join(root, "profile");
    const paths = resolveHostRootPaths(namespace);
    const cleanup = new ProcessCleanup();
    trackRealHostPaths(namespace, cleanup);
    const project = await prepareRealHostFixture(namespace);
    expect(project).toBe(join(paths.dataRoot, "fixture-repo"));
    expect(existsSync(join(project, ".git"))).toBe(true);
    expect(existsSync(namespace) ? readdirSync(namespace) : []).toEqual([]);
    const owner = HostOwnerController.acquire(namespace, "headless");
    try {
      await expect(
        owner.initialize({ mode: "headless", environmentKey: REAL_HOST_FIXTURE_KEY }),
      ).resolves.toMatchObject({
        paths: { baseDir: paths.dataRoot },
      });
    } finally {
      await owner.close();
    }
    await cleanup.shutdown();
    expect(readdirSync(root)).toEqual([]);
  });

  it("refuses a legacy fixture candidate instead of adding an implicit upgrade", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-legacy-git-fixture-")));
    roots.push(root);
    const namespace = join(root, "profile");
    mkdirSync(namespace);
    writeFileSync(join(namespace, "settings.json"), "{}");
    await expect(prepareRealHostFixture(namespace)).rejects.toThrow("offline backup import");
    expect(readdirSync(namespace)).toEqual(["settings.json"]);
    expect(existsSync(resolveHostRootPaths(namespace).dataRoot)).toBe(false);
  });
});
