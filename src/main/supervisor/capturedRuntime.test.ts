import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  SSH_RUNTIME_MANIFEST_VERSION,
  sshRuntimeManifestFileName,
} from "@/shared/sshRuntimeManifest";
import { RUNTIME_MANIFEST_MAX_BYTES } from "@/shared/runtimeCodeManifest";
import {
  capturedRuntimeEnvironment,
  prepareCapturedRuntime,
  type CapturedRuntime,
} from "./capturedRuntime";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, fork: vi.fn<typeof actual.fork>(actual.fork) };
});
const { fork: originalFork } =
  await vi.importActual<typeof import("node:child_process")>("node:child_process");

const sourceHash = "c".repeat(64);
const roots: string[] = [];
const runtimes: CapturedRuntime[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(childProcess.fork).mockImplementation(originalFork);
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "poracode-captured-runtime-"));
  roots.push(root);
  const constructed = join(root, "constructed");
  const code = {
    "supervisor.cjs": `require('node:fs').writeFileSync(${JSON.stringify(constructed)},'constructed');
process.on('message',async message=>{if(message.fixture!=='inspect')return;
try{let refused=false;try{require('./unknown.cjs')}catch(error){refused=String(error).includes('Undeclared')}
let aliasRefused=false;try{await import('./lazy.mjs?another')}catch(error){aliasRefused=String(error).includes('canonical')}
let escapeRefused=false;try{require('./escape/runtime')}catch(error){escapeRefused=String(error).includes('Undeclared')}
process.send({fixture:'result',cjs:require('./lazy.cjs'),esm:(await import('./lazy.mjs')).value,external:require('fixture-dependency'),directory:__dirname,refused,aliasRefused,escapeRefused});
}catch(error){process.send({fixture:'error',message:String(error)})}});`,
    "lazy.cjs": "module.exports='captured cjs';",
    "lazy.mjs": "export const value='captured esm';",
  };
  await Promise.all(
    Object.entries(code).map(([path, source]) => writeFile(join(root, path), source)),
  );
  const dependency = join(
    root,
    ".runtime-dependencies",
    "fixture",
    "node_modules",
    "fixture-dependency",
  );
  await mkdir(dependency, { recursive: true });
  await writeFile(join(dependency, "package.json"), JSON.stringify({ main: "index.cjs" }));
  await writeFile(join(dependency, "index.cjs"), "module.exports='external resolution';");
  const modules = join(root, "node_modules");
  await mkdir(modules);
  await symlink(
    process.platform === "win32" ? dependency : relative(modules, dependency),
    join(modules, "fixture-dependency"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const escapingRoot = await mkdtemp(join(tmpdir(), "poracode-runtime-escape-"));
  roots.push(escapingRoot);
  await writeFile(join(escapingRoot, "runtime.js"), "module.exports='uncaptured relative code';");
  await symlink(
    escapingRoot,
    join(root, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(join(root, "unknown.cjs"), "throw Error('uncaptured code executed');");
  const manifest = {
    version: SSH_RUNTIME_MANIFEST_VERSION,
    entry: "supervisor",
    sourceHash,
    captureProtocolVersion: 1,
    settingsServiceVersion: 1,
    files: Object.entries(code).map(([path, source]) => ({
      path,
      format: path.endsWith(".mjs") ? "module" : "commonjs",
      bytes: Buffer.byteLength(source),
      sha256: createHash("sha256").update(source).digest("hex"),
    })),
    dependencies: [],
    resources: [],
  };
  await writeFile(join(root, sshRuntimeManifestFileName("supervisor")), JSON.stringify(manifest));
  return {
    root,
    code,
    constructed,
    options: { root, entry: "supervisor", sourceHash, settingsServiceVersion: 1 } as const,
  };
}

function response(child: childProcess.ChildProcess): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const listener = (input: unknown) => {
      if (input && typeof input === "object" && "fixture" in input) {
        child.off("message", listener);
        resolve(input as Record<string, unknown>);
      }
    };
    child.on("message", listener);
  });
}

it("loads captured entry/lazy CJS/ESM after deletion and preserves external logical resolution", async () => {
  const fixture = await createFixture();
  const runtime = await prepareCapturedRuntime(fixture.options);
  runtimes.push(runtime);
  expect(existsSync(fixture.constructed)).toBe(false);
  await Promise.all(Object.keys(fixture.code).map((path) => rm(join(fixture.root, path))));
  await runtime.activate();
  const result = response(runtime.child);
  runtime.child.send({ fixture: "inspect" });
  expect(await result).toEqual({
    fixture: "result",
    cjs: "captured cjs",
    esm: "captured esm",
    external: "external resolution",
    directory: fixture.root,
    refused: true,
    aliasRefused: true,
    escapeRefused: true,
  });
  const closing = runtime.dispose();
  expect(runtime.dispose()).toBe(closing);
  await closing;
  expect(runtime.child.connected).toBe(false);
});

it("does not inherit Node preload arguments or alternate environment key casing", async () => {
  const fixture = await createFixture();
  const preload = join(fixture.root, "preload.cjs");
  const marker = join(fixture.root, "preload-ran");
  await writeFile(
    preload,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected');`,
  );
  const original = [...process.execArgv];
  try {
    process.execArgv.push("--require", preload);
    const runtime = await prepareCapturedRuntime({
      ...fixture.options,
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${JSON.stringify(preload)}`,
        Node_Options: `--require ${JSON.stringify(preload)}`,
      },
    });
    runtimes.push(runtime);
    await runtime.activate();
    expect(existsSync(marker)).toBe(false);
  } finally {
    process.execArgv.splice(0, process.execArgv.length, ...original);
  }
  expect(
    capturedRuntimeEnvironment({
      Node_Options: "unsafe",
      electron_run_as_node: "0",
      PRESERVED_FIXTURE: "yes",
    }),
  ).toEqual({ NODE_OPTIONS: "", ELECTRON_RUN_AS_NODE: "1", PRESERVED_FIXTURE: "yes" });
});

it("rehashes replaced bytes in the child and joins it without constructing the runtime", async () => {
  const fixture = await createFixture();
  let child: childProcess.ChildProcess | undefined;
  vi.mocked(childProcess.fork).mockImplementation((...args) => {
    writeFileSync(join(fixture.root, "supervisor.cjs"), "throw Error('replacement');");
    child = originalFork(...args);
    return child;
  });
  await expect(prepareCapturedRuntime(fixture.options)).rejects.toThrow(/size|digest/i);
  expect(existsSync(fixture.constructed)).toBe(false);
  expect(child?.connected).toBe(false);
  expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
});

it.skipIf(process.platform === "win32")(
  "refuses a FIFO replacement after preflight and joins the unactivated child",
  async () => {
    const fixture = await createFixture();
    let child: childProcess.ChildProcess | undefined;
    vi.mocked(childProcess.fork).mockImplementation((...args) => {
      const path = join(fixture.root, "supervisor.cjs");
      rmSync(path);
      childProcess.execFileSync("mkfifo", [path]);
      child = originalFork(...args);
      return child;
    });
    await expect(
      prepareCapturedRuntime({ ...fixture.options, captureTimeoutMs: 500 }),
    ).rejects.toThrow(/regular file/);
    expect(existsSync(fixture.constructed)).toBe(false);
    expect(child?.connected).toBe(false);
    expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
  },
);

it("cancels an admitted capture before activation and joins the owned child", async () => {
  const fixture = await createFixture();
  const cancellation = new AbortController();
  let child: childProcess.ChildProcess | undefined;
  vi.mocked(childProcess.fork).mockImplementation((...args) => {
    child = originalFork(...args);
    queueMicrotask(() => cancellation.abort(new Error("Synthetic capture cancellation.")));
    return child;
  });
  await expect(
    prepareCapturedRuntime({ ...fixture.options, signal: cancellation.signal }),
  ).rejects.toThrow(/cancellation|stopped/i);
  expect(existsSync(fixture.constructed)).toBe(false);
  expect(child?.connected).toBe(false);
  expect(child?.exitCode !== null || child?.signalCode !== null).toBe(true);
});

it("does not fork after cancellation during asynchronous resource preflight", async () => {
  const fixture = await createFixture();
  const path = join(fixture.root, sshRuntimeManifestFileName("supervisor"));
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeFile(
    path,
    JSON.stringify({ ...manifest, resources: [{ kind: "agent-plugins", sha256: sourceHash }] }),
  );
  const cancellation = new AbortController();
  const entered = Promise.withResolvers<void>();
  const resources = Promise.withResolvers<void>();
  vi.mocked(childProcess.fork).mockClear();
  const starting = prepareCapturedRuntime({
    ...fixture.options,
    signal: cancellation.signal,
    verifyResources: () => {
      entered.resolve();
      return resources.promise;
    },
  });
  await entered.promise;
  cancellation.abort(new Error("Synthetic preflight cancellation."));
  resources.resolve();
  await expect(starting).rejects.toThrow(/cancellation/);
  expect(childProcess.fork).not.toHaveBeenCalled();
  expect(existsSync(fixture.constructed)).toBe(false);
});

it("rejects an oversized manifest before fork and leaves its bytes untouched", async () => {
  const fixture = await createFixture();
  const path = join(fixture.root, sshRuntimeManifestFileName("supervisor"));
  const oversized = " ".repeat(RUNTIME_MANIFEST_MAX_BYTES + 1);
  await writeFile(path, oversized);
  vi.mocked(childProcess.fork).mockClear();
  await expect(prepareCapturedRuntime(fixture.options)).rejects.toThrow(/byte limit/);
  expect(childProcess.fork).not.toHaveBeenCalled();
  expect(await readFile(path, "utf8")).toBe(oversized);
  expect(existsSync(fixture.constructed)).toBe(false);
});

it("expires a prepared but unactivated child without constructing a runtime", async () => {
  const fixture = await createFixture();
  const runtime = await prepareCapturedRuntime({ ...fixture.options, captureTimeoutMs: 500 });
  runtimes.push(runtime);
  await once(runtime.child, "close");
  await expect(runtime.activate()).rejects.toThrow(/stopped/i);
  expect(existsSync(fixture.constructed)).toBe(false);
});
