import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { lock } from "proper-lockfile";
import { watchRuntime } from "./dev-runtime-watch.mjs";
import {
  runtimeConfigurationFiles,
  runtimeSourceRoots,
} from "../src/build/runtimeSourceDeclaration.ts";
import { RUNTIME_BUILD_SOURCE_HASH } from "../src/shared/runtimeBuildIdentity.ts";
import { SSH_RUNTIME_ENTRY_CONFIG } from "../src/shared/sshRuntimeManifest.ts";

const taskRequire = createRequire(import.meta.url);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "poracode-dev-runtime-"));
  for (const path of [
    ...runtimeSourceRoots,
    "src/supervisor/agents/plugin/forward-runtime",
    "resources/plugins",
    "scripts",
    ".tmp",
  ])
    await mkdir(join(root, path), { recursive: true });
  for (const path of runtimeConfigurationFiles) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), "");
  }
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(root, "tsconfig.json"), "{}");
  await writeFile(
    join(root, "src/supervisor/agents/plugin/forward-runtime/poracode-hook-runtime.mjs"),
    "export {};",
  );
  await writeFile(
    join(root, "src/shared/runtimeBuildIdentity.ts"),
    `export const RUNTIME_BUILD_SOURCE_HASH=${JSON.stringify(RUNTIME_BUILD_SOURCE_HASH)};`,
  );
  await writeFile(join(root, "src/backend/index.ts"), "export const value='initial';");
  await writeFile(join(root, "src/supervisor/index.ts"), "export const value='supervisor';");
  await writeFile(join(root, "src/main/preload.ts"), "export const value='preload';");
  await writeFile(join(root, "src/shared/asset-name.json"), '"initial"');
  const plugin = pathToFileURL(resolve("src/build/runtimeDeclarationPlugin.ts")).href;
  const dependencies = Object.fromEntries(
    SSH_RUNTIME_ENTRY_CONFIG.supervisor.map((name) => [name, "fixture"]),
  );
  await writeFile(
    join(root, "tsdown.config.ts"),
    `import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {runtimeDeclarationPlugin} from ${JSON.stringify(plugin)};
const root=import.meta.dirname;
const sharedAsset='shared-'+JSON.parse(readFileSync(root+'/src/shared/asset-name.json','utf8'))+'.txt';
export default ['backendHost','supervisor','preload'].map(name=>{
const entryPath=name==='backendHost'?'src/backend/index.ts':name==='supervisor'?'src/supervisor/index.ts':'src/main/preload.ts';
return {entry:{[name]:entryPath},format:'cjs',platform:'node',target:'node24',dts:false,clean:false,
plugins:[{name:'fixture-delay',async buildStart(){if(existsSync(root+'/.tmp/ignore-term')){process.on('SIGTERM',()=>{});writeFileSync(root+'/.tmp/build-started',String(process.pid));await new Promise(()=>setInterval(()=>{},1000));}if(existsSync(root+'/.tmp/delay-build')){writeFileSync(root+'/.tmp/build-started',String(process.pid));await new Promise(done=>setTimeout(done,400));}},generateBundle(){this.emitFile({type:'asset',fileName:sharedAsset,source:'shared by all entries'});}},
...(name==='preload'?[]:[runtimeDeclarationPlugin({root,entryPath,buildOptions:{fixture:true},dependencies:${JSON.stringify(dependencies)},...(name==='supervisor'?{manifestEntry:'supervisor'}:{})})])]};});`,
  );
  return root;
}

async function waitFor(condition) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(20);
  }
  assert.fail("Development runtime did not reach the expected state.");
}

async function compilerPid(root) {
  let pid = 0;
  await waitFor(async () => {
    pid = Number(await readFile(join(root, ".tmp/build-started"), "utf8").catch(() => ""));
    return Number.isSafeInteger(pid) && pid > 0;
  });
  return pid;
}

function output(root, entry) {
  const path = join(root, "dist/main", `${entry}.cjs`);
  delete taskRequire.cache[taskRequire.resolve(path)];
  return taskRequire(path);
}

await test(
  "publishes coherent affected builds, keeps failed outputs, and collapses rapid edits",
  { timeout: 30_000 },
  async (t) => {
    const root = await fixture();
    let runtime;
    t.after(async () => {
      await runtime?.close();
      await rm(root, { recursive: true, force: true });
    });
    const publications = [];
    const before = [];
    const errors = [];
    runtime = await watchRuntime({
      root,
      beforePublish: async () => {
        before.push(publications.length ? output(root, "backendHost").value : undefined);
      },
      onPublished: async ({ entries, isCurrent }) => {
        assert.ok(isCurrent());
        const host = output(root, "backendHost");
        const supervisor = output(root, "supervisor");
        const manifest = JSON.parse(
          await readFile(join(root, "dist/main/supervisor.ssh-runtime-manifest.json"), "utf8"),
        );
        assert.equal(host.__poracodeRuntimeSourceHash, supervisor.__poracodeRuntimeSourceHash);
        assert.equal(host.__poracodeRuntimeSourceHash, manifest.sourceHash);
        publications.push({
          entries,
          value: host.value,
          preload: output(root, "preload").value,
          hash: manifest.sourceHash,
        });
      },
      onError: (error) => errors.push(error),
    });
    await runtime.ready;
    assert.equal(publications[0].entries.length, 3);
    await assert.rejects(watchRuntime({ root }), /already being held/);

    const source = join(root, "src/backend/index.ts");
    await writeFile(source, "export const value='changed';");
    await waitFor(() => publications.at(-1).value === "changed");
    assert.equal(publications.at(-1).entries.length, 2);
    assert.equal(before.at(-1), "initial");
    assert.notEqual(publications[0].hash, publications.at(-1).hash);

    let count = publications.length;
    await writeFile(join(root, "src/main/ignored.test.ts"), "not executable TypeScript");
    await delay(250);
    assert.equal(publications.length, count);

    await writeFile(source, "export const value=;");
    await waitFor(() => errors.length > 0);
    assert.equal(publications.length, count);
    assert.equal(output(root, "backendHost").value, "changed");
    await writeFile(source, "export const value='recovered';");
    await waitFor(() => publications.at(-1).value === "recovered");

    count = publications.length;
    await writeFile(join(root, ".tmp/delay-build"), "");
    await writeFile(source, "export const value='superseded';");
    await waitFor(() => existsSync(join(root, ".tmp/build-started")));
    await writeFile(source, "export const value='latest';");
    await waitFor(() => publications.at(-1).value === "latest");
    assert.equal(publications.length, count + 1);
    assert.equal(before.at(-1), "recovered");
    await rm(join(root, ".tmp/delay-build"));

    const preload = join(root, "src/main/preload.ts");
    await writeFile(`${preload}.new`, "export const value='atomic replacement';");
    await rename(`${preload}.new`, preload);
    await waitFor(() => publications.at(-1).preload === "atomic replacement");
    assert.equal(publications.at(-1).entries.length, 3);

    await writeFile(join(root, "src/backend/added.ts"), "export const value='new import';");
    await writeFile(source, "export {value} from './added';");
    await waitFor(() => publications.at(-1).value === "new import");
    await writeFile(source, "export const value='removed import';");
    await rm(join(root, "src/backend/added.ts"));
    await waitFor(() => publications.at(-1).value === "removed import");

    count = publications.length;
    await writeFile(join(root, "src/shared/asset-name.json"), '"replaced"');
    await writeFile(join(root, "tsconfig.json"), '{"compilerOptions":{}}');
    await waitFor(() => publications.length > count);
    assert.equal(publications.at(-1).entries.length, 3);
    assert.equal(existsSync(join(root, "dist/main/shared-initial.txt")), false);
    assert.equal(existsSync(join(root, "dist/main/shared-replaced.txt")), true);
    await runtime.close();
    const restarted = await watchRuntime({ root });
    await restarted.close();
  },
);

await test(
  "releases ownership when watcher setup fails and joins a canceled compiler",
  { timeout: 15_000 },
  async (t) => {
    const root = await fixture();
    let runtime;
    t.after(async () => {
      await runtime?.close();
      await rm(root, { recursive: true, force: true });
    });
    const setupError = new Error("watcher setup failed");
    const failureDirectory = await realpath(join(root, runtimeSourceRoots[1]));
    const originalWatch = fs.watch;
    let watcherClose;
    const watchMock = t.mock.method(fs, "watch", (directory, options, listener) => {
      if (directory === failureDirectory && options.recursive) throw setupError;
      const watcher = originalWatch(directory, options, listener);
      if (options.recursive) watcherClose = t.mock.method(watcher, "close");
      return watcher;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(watchRuntime({ root }), setupError);
      assert.equal(watcherClose.mock.callCount(), 1);
    } finally {
      watchMock.mock.restore();
      syncBuiltinESMExports();
    }
    await writeFile(join(root, ".tmp/delay-build"), "");
    let published = false;
    runtime = await watchRuntime({
      root,
      onPublished: async () => {
        published = true;
      },
      onError: () => {},
    });
    const childPid = await compilerPid(root);
    await runtime.close();
    await assert.rejects(runtime.ready, /stopped before/);
    assert.equal(published, false);
    assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
  },
);

await test(
  "holds ownership until an in-flight publication has drained",
  { timeout: 15_000 },
  async (t) => {
    const root = await fixture();
    const publishing = Promise.withResolvers();
    const finishPublishing = Promise.withResolvers();
    let runtime;
    let published = false;
    t.after(async () => {
      finishPublishing.resolve();
      await runtime?.close();
      await rm(root, { recursive: true, force: true });
    });
    runtime = await watchRuntime({
      root,
      beforePublish: async () => {
        publishing.resolve();
        await finishPublishing.promise;
      },
      onPublished: async () => {
        published = true;
      },
    });
    await publishing.promise;
    let closed = false;
    const closing = runtime.close().then(() => {
      closed = true;
    });
    await delay(2_200);
    assert.equal(closed, false);
    await assert.rejects(lock(join(root, ".tmp/dev-runtime")), { code: "ELOCKED" });
    finishPublishing.resolve();
    await closing;
    await assert.rejects(runtime.ready, /stopped before/);
    assert.equal(published, false);
    assert.equal(existsSync(join(root, "dist/main/backendHost.cjs")), false);
    const release = await lock(join(root, ".tmp/dev-runtime"));
    await release();
  },
);

await test(
  "kills a compiler that ignores SIGTERM before releasing ownership",
  { timeout: 15_000, skip: process.platform === "win32" },
  async (t) => {
    const root = await fixture();
    let runtime;
    let published = false;
    t.after(async () => {
      await runtime?.close();
      await rm(root, { recursive: true, force: true });
    });
    await writeFile(join(root, ".tmp/ignore-term"), "");
    runtime = await watchRuntime({
      root,
      onPublished: async () => {
        published = true;
      },
      onError: () => {},
    });
    const childPid = await compilerPid(root);
    const closing = runtime.close();
    await delay(100);
    assert.doesNotThrow(() => process.kill(childPid, 0));
    await assert.rejects(lock(join(root, ".tmp/dev-runtime")), { code: "ELOCKED" });
    await closing;
    await assert.rejects(runtime.ready, /stopped before/);
    assert.equal(published, false);
    assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
    const release = await lock(join(root, ".tmp/dev-runtime"));
    await release();
  },
);
