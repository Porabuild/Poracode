import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import config from "../../tsdown.config";
import { ProjectWatcherClient } from "./projectWatcherClient";
import { ProjectWatcher } from "./projectWatcher";
import type { ProjectWatchScope } from "./projectWatcherProtocol";

let artifacts: string;
let workerPath: string;
const fixtures: string[] = [];
const clients: ProjectWatcherClient[] = [];
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

beforeAll(async () => {
  mkdirSync(resolve("tmp"), { recursive: true });
  artifacts = mkdtempSync(resolve("tmp/project-watcher-worker-"));
  workerPath = join(artifacts, "projectWatcherWorker.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("./projectWatcherWorker.ts", import.meta.url))],
    outfile: workerPath,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((instance) => instance.dispose()));
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});
afterAll(() => {
  rmSync(artifacts, { recursive: true, force: true });
});

function fixture() {
  const path = mkdtempSync(join(artifacts, "fixture-"));
  fixtures.push(path);
  return path;
}
function client() {
  const instance = new ProjectWatcherClient({ nativeBinaryPath: false, workerPath });
  clients.push(instance);
  return instance;
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!check() && Date.now() < deadline) await delay(20);
  expect(check()).toBe(true);
}

describe("bundled filesystem worker", () => {
  it("ships in the supervisor code closure used by desktop, standalone and SSH", () => {
    const configs = config as Array<{ entry?: Record<string, string> }>;
    const supervisor = configs.find((entry) => entry.entry?.supervisor);
    expect(supervisor?.entry?.projectWatcherWorker).toBe("src/supervisor/projectWatcherWorker.ts");
  });

  it("starts the source fallback on Node without a compiled worker or native helper", async () => {
    const root = fixture();
    const changes: ProjectWatchScope[] = [];
    const instance = new ProjectWatcherClient({ nativeBinaryPath: false });
    clients.push(instance);
    const subscription = instance.watch(root, (scope) => changes.push(scope));
    await subscription.ready;
    writeFileSync(join(root, "immediate.ts"), "export {}\n");
    await until(() => changes.length > 0);
    expect(changes).toEqual(["worktree"]);
  });

  it("captures edits immediately after awaited public project and worktree registration", async () => {
    const root = fixture(),
      worktree = fixture();
    const changes: Array<[string, string | undefined]> = [];
    const watcher = new ProjectWatcher({
      onGitChanged: () => {},
      onTreeChanged: (id, path) => changes.push([id, path]),
    });
    try {
      await watcher.watch("project", {
        kind: process.platform === "win32" ? "windows" : "posix",
        path: root,
      });
      writeFileSync(join(root, "immediate.ts"), "export {}\n");
      await watcher.watchWorktrees("project", [worktree]);
      writeFileSync(join(worktree, "immediate.ts"), "export {}\n");
      await until(() => changes.length === 2);
      expect(changes).toEqual(
        expect.arrayContaining([
          ["project", undefined],
          ["project", worktree],
        ]),
      );
    } finally {
      await watcher.dispose();
    }
  });

  it("coalesces real changes in both scopes and isolates subscriptions and unwatch", async () => {
    const root = fixture(),
      other = fixture();
    for (const path of [
      "src",
      ".git/objects/aa",
      "node_modules/a",
      ".poracode/worktrees/topic/src",
    ])
      mkdirSync(join(root, path), { recursive: true });
    const instance = client();
    const changes: ProjectWatchScope[] = [],
      unrelated: ProjectWatchScope[] = [];
    const subscription = instance.watch(root, (scope) => changes.push(scope));
    const second = instance.watch(other, (scope) => unrelated.push(scope));
    await Promise.all([subscription.ready, second.ready]);
    for (let i = 0; i < 80; i++) {
      writeFileSync(join(root, "src", `file-${i}.ts`), "export {}\n");
      writeFileSync(join(root, ".git/index.lock"), String(i));
      writeFileSync(join(root, "node_modules/a", `file-${i}.js`), "noise");
      writeFileSync(join(root, ".poracode/worktrees/topic/src", `file-${i}.ts`), "noise");
    }
    writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/changed\n");
    await until(() => changes.length === 2);
    await delay(400);
    expect([...changes].sort()).toEqual(["git", "worktree"]);
    expect(unrelated).toEqual([]);
    subscription.unsubscribe();
    writeFileSync(join(root, "src/late.ts"), "late");
    await delay(450);
    expect([...changes].sort()).toEqual(["git", "worktree"]);
    writeFileSync(join(other, "active.ts"), "active");
    await until(() => unrelated.length > 0);
    expect(unrelated).toEqual(["worktree"]);
  });

  it("retains every Git scope when a real worker receives an ignored-tree flood", async () => {
    const parent = fixture();
    const roots = Array.from({ length: 8 }, (_, index) => join(parent, `repo-${index}`));
    for (const root of roots) {
      for (const path of [
        "src",
        "node_modules/a",
        "native/a/target/debug",
        ".poracode/worktrees/topic/src",
        ".git",
      ]) {
        mkdirSync(join(root, path), { recursive: true });
      }
      for (let slot = 0; slot < 128; slot++) {
        for (const [path, extension] of [
          ["src", "ts"],
          ["node_modules/a", "js"],
          ["native/a/target/debug", "rmeta"],
          [".poracode/worktrees/topic/src", "ts"],
        ]) {
          writeFileSync(join(root, path!, `${slot}.${extension}`), "base\n");
        }
      }
      writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
      writeFileSync(join(root, ".git/index.lock"), "");
    }
    const instance = client();
    const changes = roots.map(() => new Set<ProjectWatchScope>());
    await Promise.all(
      roots.map((root, index) => instance.watch(root, (scope) => changes[index]!.add(scope)).ready),
    );
    await new Promise<void>((done, reject) => {
      execFile(
        process.execPath,
        [
          "-e",
          `
        const { appendFileSync, writeFileSync } = require('node:fs');
        const { join } = require('node:path');
        const roots = Array.from({length:8}, (_, index) => join(process.argv[1], 'repo-' + index));
        for (let iteration=0; iteration<600; iteration++) for (const root of roots) {
          const slot=iteration%128;
          for (const [path, ext] of [['src','ts'],['node_modules/a','js'],['native/a/target/debug','rmeta'],['.poracode/worktrees/topic/src','ts']]) appendFileSync(join(root,path,slot+'.'+ext),'x\\n');
          writeFileSync(join(root,'.git/index.lock'),String(iteration));
        }
        for(const root of roots) writeFileSync(join(root,'.git/HEAD'),'ref: refs/heads/changed\\n');
      `,
          parent,
        ],
        { windowsHide: true },
        (error) => (error ? reject(error) : done()),
      );
    });
    await expect
      .poll(() => changes.map((scopes) => [...scopes].sort()))
      .toEqual(roots.map(() => ["git", "worktree"]));
  });

  it("discovers late .git and follows linked worktree metadata and common refs", async () => {
    const root = fixture(),
      linked = fixture();
    const instance = client();
    const rootChanges: ProjectWatchScope[] = [];
    const main = instance.watch(root, (scope) => rootChanges.push(scope));
    await main.ready;
    mkdirSync(join(root, ".git/refs/heads"), { recursive: true });
    writeFileSync(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
    await until(() => rootChanges.includes("git"));
    rootChanges.length = 0;
    const metadata = join(root, ".git/worktrees/topic");
    mkdirSync(metadata, { recursive: true });
    writeFileSync(join(metadata, "commondir"), "../..\n");
    writeFileSync(join(metadata, "HEAD"), "ref: refs/heads/topic\n");
    writeFileSync(join(linked, ".git"), `gitdir: ${metadata}\n`);
    const changes: ProjectWatchScope[] = [];
    const subscription = instance.watch(linked, (scope) => changes.push(scope));
    await subscription.ready;
    writeFileSync(join(metadata, "HEAD"), "ref: refs/heads/replacement\n");
    await until(() => changes.length > 0);
    expect(changes).toEqual(["git"]);
    changes.length = 0;
    writeFileSync(join(root, ".git/refs/heads/main"), "new-ref\n");
    await until(() => changes.length > 0);
    expect(changes).toEqual(["git"]);
    changes.length = 0;
    writeFileSync(join(metadata, "index.lock"), "noise");
    await delay(450);
    expect(changes).toEqual([]);
  });
});
