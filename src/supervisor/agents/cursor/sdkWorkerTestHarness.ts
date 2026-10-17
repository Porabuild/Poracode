import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { CursorSdkWorkerClient } from "./sdkWorkerClient";

const tempDirectories: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

export interface CursorSdkWorkerHarnessOptions {
  /**
   * Directory under the SDK root that holds the entry, mimicking a bundled
   * `dist/` layout whose installation manifest lives in the ancestor.
   */
  entrySubdirectory?: string;
  /** Spawn the client without a configured package root. Defaults to false. */
  omitPackageRoot?: boolean;
}

export async function createCursorSdkWorkerHarness(
  sdkSource: string,
  options?: CursorSdkWorkerHarnessOptions,
): Promise<{
  directory: string;
  sdkRoot: string;
  entryPath: string;
  client: CursorSdkWorkerClient;
  child: ChildProcess;
}> {
  const directory = mkdtempSync(join(tmpdir(), "poracode-cursor-sdk-worker-"));
  tempDirectories.push(directory);
  const sdkRoot = join(directory, "fake-sdk");
  const entryDirectory = options?.entrySubdirectory
    ? join(sdkRoot, options.entrySubdirectory)
    : sdkRoot;
  mkdirSync(entryDirectory, { recursive: true });
  const entryPath = join(entryDirectory, "index.mjs");
  writeFileSync(entryPath, sdkSource, "utf8");

  const configuredWorkerPath = process.env.PORACODE_CURSOR_SDK_WORKER_TEST_PATH;
  const workerPath = configuredWorkerPath ?? join(directory, "cursor-sdk-worker.mjs");
  if (!configuredWorkerPath) {
    const workerSource = resolve(dirname(fileURLToPath(import.meta.url)), "sdkWorker.ts");
    const esbuildArgs = [
      "exec",
      "esbuild",
      workerSource,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node24",
      `--outfile=${workerPath}`,
    ];
    execFileSync(
      process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
      process.platform === "win32" ? ["/d", "/s", "/c", "pnpm.cmd", ...esbuildArgs] : esbuildArgs,
      { stdio: "pipe" },
    );
  }
  const child = spawn(process.execPath, [workerPath], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."),
    env: { ...process.env, CURSOR_API_KEY: "inherited-test-key" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child);
  const client = new CursorSdkWorkerClient(
    child,
    {
      entryPath,
      ...(options?.omitPackageRoot ? {} : { packageRoot: sdkRoot }),
    },
    directory,
    5_000,
  );
  await client.waitUntilReady(5_000);
  return { directory, sdkRoot, entryPath, client, child };
}
