import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "tsdown";
import { afterEach, expect, it } from "vitest";
import { runtimeDeclarationPlugin } from "./runtimeDeclarationPlugin";
import {
  SSH_RUNTIME_ENTRY_CONFIG,
  sshRuntimeBuildManifestSchema,
} from "../shared/sshRuntimeManifest";
import { verifyRuntimeResources } from "../shared/runtimeResourceInventory";
import { RUNTIME_BUILD_SOURCE_HASH as SOURCE_HASH_PLACEHOLDER } from "../shared/runtimeBuildIdentity";

const taskRequire = createRequire(import.meta.url);
const roots: string[] = [];
const fixtureDependencies = Object.fromEntries(
  SSH_RUNTIME_ENTRY_CONFIG.supervisor.map((name) => [name, "fixture"]),
);
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "poracode-build-declaration-"));
  roots.push(root);
  for (const path of [
    "src/backend",
    "src/build",
    "src/host",
    "src/main",
    "src/server",
    "src/shared",
    "src/supervisor/agents/plugin/forward-runtime",
    "packages/agents-usage/src",
    "resources/plugins",
    "scripts",
    "out",
  ])
    await mkdir(join(root, path), { recursive: true });
  for (const path of [
    "tsdown.config.ts",
    "pnpm-lock.yaml",
    "scripts/prepare-agent-plugins.mjs",
    "scripts/server-native-overlay.mjs",
  ])
    await writeFile(join(root, path), "");
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await writeFile(join(root, "tsconfig.json"), "{}");
  await writeFile(
    join(root, "src/shared/runtimeBuildIdentity.ts"),
    `export const RUNTIME_BUILD_SOURCE_HASH=${JSON.stringify(SOURCE_HASH_PLACEHOLDER)};`,
  );
  await writeFile(join(root, "src/backend/index.ts"), "export const value='host';");
  await writeFile(join(root, "src/supervisor/index.ts"), "export {value} from './runtime';");
  await writeFile(join(root, "src/supervisor/runtime.ts"), "export const value='initial';");
  await writeFile(
    join(root, "src/supervisor/agents/plugin/forward-runtime/poracode-hook-runtime.mjs"),
    "export {};",
  );
  return root;
}

function options(root: string, entryPath: string) {
  return { root, entryPath, buildOptions: { fixture: true }, dependencies: fixtureDependencies };
}

async function manifest(root: string) {
  return sshRuntimeBuildManifestSchema.parse(
    JSON.parse(
      await readFile(join(root, "out/supervisor.ssh-runtime-manifest.json"), "utf8"),
    ) as unknown,
  );
}

async function hostHash(root: string): Promise<string> {
  const path = join(root, "out/backendHost.cjs");
  delete taskRequire.cache[taskRequire.resolve(path)];
  const output = taskRequire(path) as { __poracodeRuntimeSourceHash: string };
  return output.__poracodeRuntimeSourceHash;
}

it("refuses a bundled application module outside the declared source roots", async () => {
  const root = await fixture();
  await writeFile(join(root, "src/undeclared.ts"), "export const value='must declare';");
  await writeFile(join(root, "src/supervisor/index.ts"), "export {value} from '../undeclared';");
  await expect(
    build({
      config: false,
      cwd: root,
      entry: { supervisor: "src/supervisor/index.ts" },
      format: "cjs",
      platform: "node",
      target: "node24",
      dts: false,
      outDir: "out",
      logLevel: "silent",
      plugins: [
        runtimeDeclarationPlugin({
          ...options(root, "src/supervisor/index.ts"),
          manifestEntry: "supervisor",
        }),
      ],
    }),
  ).rejects.toThrow(/outside the runtime declaration/);
});

it("refreshes both actual watch builds and refuses stale resource inventories", async () => {
  const root = await fixture();
  const plugin = resolve(import.meta.dirname, "runtimeDeclarationPlugin.ts");
  await writeFile(
    join(root, "tsdown.config.ts"),
    `import {createRequire} from "node:module"; import {resolve} from "node:path"; const readyRequire=createRequire(import.meta.url);
import {runtimeDeclarationPlugin} from ${JSON.stringify(plugin)};
export default ['backendHost','supervisor'].map(name=>{const entryPath=name==='backendHost'?'src/backend/index.ts':'src/supervisor/index.ts';return {onSuccess(){const file=resolve('out',name+'.cjs');delete readyRequire.cache[readyRequire.resolve(file)];const hash=readyRequire(file).__poracodeRuntimeSourceHash;console.log('[fixture-ready]',JSON.stringify({name,hash}));},entry:{[name]:entryPath},outDir:'out',format:'cjs',platform:'node',target:'node24',dts:false,clean:false,sourcemap:false,plugins:[runtimeDeclarationPlugin({root:${JSON.stringify(root)},entryPath,buildOptions:{fixture:true},dependencies:${JSON.stringify(fixtureDependencies)},...(name==='supervisor'?{manifestEntry:'supervisor'}:{})})]}});`,
  );
  const packagePath = taskRequire.resolve("tsdown/package.json");
  const metadata = taskRequire(packagePath) as { bin: { tsdown: string } };
  let child: ChildProcess | undefined;
  let completion: Promise<unknown> | undefined;
  let log = "";
  let lastError: string | null = null;
  let observed: { manifestHash: string; hostHash: string | null } | null = null;
  const stopWatcher = async () => {
    if (
      child &&
      typeof child.pid === "number" &&
      child.pid > 0 &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      child.kill("SIGTERM");
      await Promise.race([completion, delay(2_000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await completion;
      }
    }
  };
  const waitFor = async <T>(operation: () => Promise<T | undefined>): Promise<T> => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (child && (child.exitCode !== null || child.signalCode !== null))
        throw new Error(`Runtime watcher exited: ${log}`);
      try {
        const value = await operation();
        lastError = null;
        if (value !== undefined) return value;
      } catch (error) {
        lastError = String(error).slice(0, 2_000);
      }
      await delay(20);
    }
    throw new Error(
      `Runtime watcher did not produce a matching declaration: ${JSON.stringify({ observed, lastError })}\n${log}`,
    );
  };
  try {
    child = spawn(
      process.execPath,
      [
        resolve(dirname(packagePath), metadata.bin.tsdown),
        "--config",
        join(root, "tsdown.config.ts"),
        "--watch",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_OPTIONS: "" } },
    );
    completion = once(child, "close");
    const collect = (data: Buffer) => {
      log = (log + data.toString()).slice(-64 * 1024);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    const current = async () => {
      const value = await manifest(root);
      const host = await hostHash(root);
      observed = { manifestHash: value.sourceHash, hostHash: host ?? null };
      // Output files can exist before BUNDLE_END has closed the build. Only
      // edit watched inputs after both actual tsdown onSuccess callbacks have
      // loaded this completed cohort; bytes alone are not a watch-cycle barrier.
      const ready = new Map<string, string>();
      for (const match of log.matchAll(/\[fixture-ready\] (\{[^\n]+\})/g)) {
        const item = JSON.parse(match[1]!) as { name: string; hash: string };
        ready.set(item.name, item.hash);
      }
      return value.sourceHash === host &&
        ready.get("backendHost") === host &&
        ready.get("supervisor") === host
        ? value
        : undefined;
    };
    const first = await waitFor(current);
    await writeFile(join(root, "src/supervisor/runtime.ts"), "export const value='changed';");
    const second = await waitFor(async () => {
      const value = await current();
      return value?.sourceHash !== first.sourceHash ? value : undefined;
    });
    expect(second.sourceHash).not.toBe(first.sourceHash);
    // A new real import refreshes the whole declaration and its watch inputs.
    await writeFile(join(root, "src/supervisor/added.ts"), "export const value='added';");
    await writeFile(join(root, "src/supervisor/runtime.ts"), "export {value} from './added';");
    const third = await waitFor(async () => {
      const value = await current();
      return value?.sourceHash !== second.sourceHash ? value : undefined;
    });
    expect(third.sourceHash).not.toBe(second.sourceHash);
    await writeFile(join(root, "src/supervisor/runtime.ts"), "export const value='changed';");
    await rm(join(root, "src/supervisor/added.ts"));
    const restored = await waitFor(async () => {
      const value = await current();
      return value?.sourceHash === second.sourceHash ? value : undefined;
    });
    const pendingProvider = join(root, "pending-provider");
    await mkdir(join(pendingProvider, "plugin"), { recursive: true });
    await writeFile(join(pendingProvider, "plugin", "plugin.json"), "{}");
    await writeFile(join(pendingProvider, "plugin", "forward.mjs"), "export {};");
    await rename(pendingProvider, join(root, "src/supervisor/agents/fixture"));
    expect(() =>
      verifyRuntimeResources(restored.resources, {
        agentPlugins: { path: join(root, "src/supervisor/agents"), layout: "source" },
        bundledPlugins: join(root, "resources/plugins"),
      }),
    ).toThrow(/declaration differs/);
    // Filesystem additions require an explicit complete rebuild; do not claim
    // that an unobserved directory addition automatically wakes every entry.
    await stopWatcher();
    for (const name of ["backendHost", "supervisor"] as const) {
      const entryPath = name === "backendHost" ? "src/backend/index.ts" : "src/supervisor/index.ts";
      const bundles = await build({
        config: false,
        cwd: root,
        entry: { [name]: entryPath },
        format: "cjs",
        platform: "node",
        target: "node24",
        dts: false,
        outDir: "out",
        clean: false,
        logLevel: "silent",
        plugins: [
          runtimeDeclarationPlugin({
            ...options(root, entryPath),
            ...(name === "supervisor" ? { manifestEntry: "supervisor" as const } : {}),
          }),
        ],
      });
      for (const bundle of bundles) await bundle[Symbol.asyncDispose]();
    }
    const rebuilt = await manifest(root);
    expect(rebuilt.sourceHash).not.toBe(restored.sourceHash);
    expect(rebuilt.sourceHash).toBe(await hostHash(root));
    verifyRuntimeResources(rebuilt.resources, {
      agentPlugins: { path: join(root, "src/supervisor/agents"), layout: "source" },
      bundledPlugins: join(root, "resources/plugins"),
    });
  } catch (error) {
    const evidence = resolve("tmp/v4-settings-owner/runtime-watch-failures", basename(root));
    await mkdir(evidence, { recursive: true });
    await writeFile(
      join(evidence, "observations.json"),
      JSON.stringify({ observed, lastError, error: String(error).slice(0, 4_000) }, null, 2),
    );
    await writeFile(join(evidence, "watcher.log"), log);
    for (const path of [
      "out/backendHost.cjs",
      "out/supervisor.cjs",
      "out/supervisor.ssh-runtime-manifest.json",
      "tsdown.config.ts",
      "src/shared/runtimeBuildIdentity.ts",
    ]) {
      try {
        await writeFile(
          join(evidence, basename(path)),
          (await readFile(join(root, path))).subarray(0, 64 * 1024),
        );
      } catch {}
    }
    throw error;
  } finally {
    await stopWatcher();
  }
}, 20_000);
