import { createHash } from "node:crypto";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { closeSync, constants, lstatSync, openSync, writeSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "tsdown";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { stageAgentPlugins } from "../../scripts/prepare-agent-plugins.mjs";
import { RUNTIME_BUILD_SOURCE_HASH as SOURCE_HASH_PLACEHOLDER } from "../shared/runtimeBuildIdentity";
import {
  SSH_RUNTIME_ENTRY_NAMES,
  SSH_RUNTIME_MANIFEST_VERSION,
} from "../shared/sshRuntimeManifest";

const sourceHash = "f".repeat(64);
const roots: string[] = [];
let helperRoot: string;
let archiveModule: string;

// A FIFO regression must not block the Vitest worker. Each real entry point
// runs in an owned child; the peer is only a cleanup backstop for a broken reader.
describe.skipIf(process.platform === "win32")("runtime file admission", () => {
  beforeAll(async () => {
    helperRoot = await mkdtemp(join(tmpdir(), "poracode-file-admission-helper-"));
    const bundles = await build({
      config: false,
      cwd: resolve(import.meta.dirname, "../.."),
      entry: { runtimeBundle: "src/main/ssh/runtimeBundle.ts" },
      outDir: helperRoot,
      format: "cjs",
      platform: "node",
      target: "node24",
      noExternal: [/.*/],
      dts: false,
      logLevel: "silent",
      plugins: [
        {
          name: "fixture-runtime-declaration",
          transform(code, id) {
            if (id.endsWith("/runtimeBuildIdentity.ts"))
              return code.replaceAll(SOURCE_HASH_PLACEHOLDER, sourceHash);
            return undefined;
          },
        },
      ],
    });
    for (const bundle of bundles) await bundle[Symbol.asyncDispose]();
    archiveModule = join(helperRoot, "runtimeBundle.cjs");
  });
  afterAll(async () => {
    if (helperRoot) await rm(helperRoot, { recursive: true, force: true });
  });
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it.each([
    "archive-server",
    "archive-marker",
    "archive-cached",
    "source-plugin",
    "source-node",
    "stage-source",
    "stage-destination",
  ])("refuses or replaces a %s FIFO without a peer", async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "poracode-file-admission-"));
    roots.push(root);
    const spec = await fixture(root, kind);
    let fifo = spec.fifo;
    let child: ChildProcess | undefined;
    let completion: Promise<unknown> | undefined;
    let backstop: ReturnType<typeof setTimeout> | undefined;
    let receiver: number | undefined;
    let intervention = false;
    let stderr = "";
    try {
      child = fork(resolve(import.meta.dirname, "testFixtures/runtimeFileAdmissionChild.mjs"), [], {
        execArgv: [],
        env: { ...process.env, NODE_OPTIONS: "" },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      child.stderr?.on("data", (data: Buffer) => {
        stderr = (stderr + data.toString()).slice(-2_000);
      });
      completion = once(child, "close");
      const exitedEarly = completion.then(() => {
        throw new Error(`File admission child exited: ${stderr}`);
      });
      void exitedEarly.catch(() => undefined);
      const readyPromise = Promise.race([once(child, "message"), exitedEarly]);
      child.send(spec);
      const [ready] = (await readyPromise) as [
        { kind: string; archivePath?: string; error?: string },
      ];
      expect(ready).toMatchObject({ kind: "ready" });
      if (kind === "archive-cached") fifo = ready.archivePath!;
      await rm(fifo, { force: true });
      execFileSync("mkfifo", [fifo]);
      const response = Promise.race([once(child, "message"), exitedEarly]);
      backstop = setTimeout(() => {
        intervention = true;
        const peer = openSync(fifo, constants.O_RDWR | constants.O_NONBLOCK);
        try {
          writeSync(peer, kind === "archive-marker" ? "{}" : "export {};");
        } finally {
          closeSync(peer);
        }
        // The old cache-marker writer also opened the same FIFO for output.
        if (kind === "archive-marker")
          receiver = openSync(fifo, constants.O_RDONLY | constants.O_NONBLOCK);
      }, 500);
      child.send("run");
      const [result] = (await response) as [{ kind: string; completed: boolean; error?: string }];
      clearTimeout(backstop);
      await completion;
      expect(intervention).toBe(false);
      expect(child.connected).toBe(false);
      const replacesMarker = kind === "archive-marker";
      const regularFileError = expect.stringMatching(/regular file/);
      expect(result).toMatchObject({
        kind: "result",
        completed: replacesMarker,
        ...(replacesMarker ? {} : { error: regularFileError }),
      });
      expect(replacesMarker ? lstatSync(fifo).isFile() : true).toBe(true);
    } finally {
      clearTimeout(backstop);
      if (receiver !== undefined) closeSync(receiver);
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
    }
  });
});

async function fixture(root: string, kind: string) {
  if (kind.startsWith("archive")) {
    const mainBundleDir = join(root, "main");
    const agentPluginsDir = join(root, "agent-plugins");
    const wslHelpersDir = join(root, "wsl-helpers");
    const cacheDir = join(root, "cache");
    for (const path of [mainBundleDir, agentPluginsDir, wslHelpersDir, cacheDir]) await mkdir(path);
    const bytes = Buffer.from("module.exports = {};");
    for (const entry of SSH_RUNTIME_ENTRY_NAMES) {
      const extension = entry.endsWith("Worker") ? "mjs" : "cjs";
      await writeFile(join(mainBundleDir, `${entry}.${extension}`), bytes);
      await writeFile(
        join(mainBundleDir, `${entry}.ssh-runtime-manifest.json`),
        JSON.stringify({
          version: SSH_RUNTIME_MANIFEST_VERSION,
          entry,
          sourceHash,
          captureProtocolVersion: 1,
          settingsServiceVersion: 0,
          dependencies: [],
          resources: [],
          files: [
            {
              path: `${entry}.${extension}`,
              format: extension === "mjs" ? "module" : "commonjs",
              bytes: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
            },
          ],
        }),
      );
    }
    return {
      kind,
      module: archiveModule,
      fifo:
        kind === "archive-server"
          ? join(mainBundleDir, "server.cjs")
          : join(cacheDir, "bundle-manifest.json"),
      options: { mainBundleDir, agentPluginsDir, wslHelpersDir, cacheDir },
    };
  }
  const sourceAgentsDir = join(root, "src/supervisor/agents");
  const destinationBase = join(root, "stage");
  for (const path of [
    "src/backend",
    "src/build",
    "src/host",
    "src/main",
    "src/server",
    "src/shared",
    "src/supervisor",
    "packages/agents-usage/src",
    "resources/plugins",
    "scripts",
  ])
    await mkdir(join(root, path), { recursive: true });
  for (const path of [
    "tsdown.config.ts",
    "tsconfig.json",
    "package.json",
    "pnpm-lock.yaml",
    "scripts/prepare-agent-plugins.mjs",
  ])
    await writeFile(join(root, path), "{}");
  await mkdir(join(sourceAgentsDir, "plugin/forward-runtime"), { recursive: true });
  await writeFile(
    join(sourceAgentsDir, "plugin/forward-runtime/poracode-hook-runtime.mjs"),
    "export {};",
  );
  await mkdir(join(sourceAgentsDir, "fixture/plugin"), { recursive: true });
  await writeFile(join(sourceAgentsDir, "fixture/plugin/plugin.json"), "{}");
  await writeFile(join(sourceAgentsDir, "fixture/plugin/forward.mjs"), "export {};");
  if (kind.startsWith("source"))
    return {
      kind,
      root,
      module: resolve(import.meta.dirname, "runtimeSourceDeclaration.ts"),
      fifo:
        kind === "source-plugin"
          ? join(sourceAgentsDir, "fixture/plugin/plugin.json")
          : join(root, "src/supervisor/runtime.ts"),
    };
  stageAgentPlugins({ sourceAgentsDir, destinationBase });
  return {
    kind,
    module: resolve(import.meta.dirname, "../../scripts/prepare-agent-plugins.mjs"),
    fifo:
      kind === "stage-source"
        ? join(sourceAgentsDir, "fixture/plugin/forward.mjs")
        : join(destinationBase, "fixture/forward.mjs"),
    options: { sourceAgentsDir, destinationBase },
  };
}
