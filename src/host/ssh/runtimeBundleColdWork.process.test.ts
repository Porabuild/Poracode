import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sshRuntimeManifestFileName,
  SSH_RUNTIME_MANIFEST_VERSION,
  type SshRuntimeEntryName,
} from "@/shared/sshRuntimeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { SSH_ENVIRONMENT_PROTOCOL_VERSION } from "./sshEnvironmentProtocol";

// The fixture child serves the same mocked declaration through
// `sshColdWorkTestRegister.mjs`; both sides must agree on the digest.
vi.mock("@/shared/runtimeBuildIdentity", () => ({ RUNTIME_BUILD_SOURCE_HASH: "d".repeat(64) }));

/**
 * The cold-archive acceptance shape at the process boundary: the real worker
 * service stages a multi-MB runtime in a real child process while the invoking
 * process's event-loop timer keeps advancing. The Electron main-loop-delay
 * trace remains the product gate; this proves the mechanism, not the packaged
 * app.
 */
const tempDirs: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function writeRuntimeManifest(
  mainBundleDir: string,
  entry: SshRuntimeEntryName,
  files: readonly string[],
): void {
  writeFileSync(
    join(mainBundleDir, sshRuntimeManifestFileName(entry)),
    `${JSON.stringify({
      version: SSH_RUNTIME_MANIFEST_VERSION,
      entry,
      sourceHash: RUNTIME_BUILD_SOURCE_HASH,
      captureProtocolVersion: 1,
      settingsServiceVersion: 0,
      resources: [],
      files: files.map((path) => {
        const bytes = readFileSync(join(mainBundleDir, path));
        return {
          path,
          format: path.endsWith(".mjs") ? "module" : "commonjs",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }),
      dependencies: ["better-sqlite3", "node-pty", "ws", "yaml"],
    })}\n`,
    "utf8",
  );
}

function createColdRuntimeFixture() {
  const root = mkdtempSync(join(tmpdir(), "poracode-ssh-cold-"));
  tempDirs.push(root);
  const mainBundleDir = join(root, "main");
  const agentPluginsDir = join(root, "agent-plugins");
  const wslHelpersDir = join(root, "wsl-helpers");
  const cacheDir = join(root, "cache");
  mkdirSync(mainBundleDir, { recursive: true });
  mkdirSync(agentPluginsDir, { recursive: true });
  mkdirSync(wslHelpersDir, { recursive: true });
  writeFileSync(join(mainBundleDir, "server.cjs"), "server", "utf8");
  writeFileSync(join(mainBundleDir, "supervisor.cjs"), "supervisor", "utf8");
  writeFileSync(join(mainBundleDir, "claudeSdkProbeWorker.mjs"), "worker", "utf8");
  writeFileSync(join(mainBundleDir, "cursorSdkWorker.mjs"), "worker", "utf8");
  writeRuntimeManifest(mainBundleDir, "server", ["server.cjs"]);
  writeRuntimeManifest(mainBundleDir, "supervisor", ["supervisor.cjs"]);
  writeRuntimeManifest(mainBundleDir, "claudeSdkProbeWorker", ["claudeSdkProbeWorker.mjs"]);
  writeRuntimeManifest(mainBundleDir, "cursorSdkWorker", ["cursorSdkWorker.mjs"]);
  // A multi-MB resource closure so the child's copy+hash work is measurable.
  const chunk = Buffer.alloc(64 * 1024, 7);
  for (let index = 0; index < 48; index += 1) {
    writeFileSync(join(agentPluginsDir, `plugin-${index}.bin`), chunk);
  }
  for (let index = 0; index < 48; index += 1) {
    writeFileSync(join(wslHelpersDir, `helper-${index}.bin`), chunk);
  }
  return { root, mainBundleDir, agentPluginsDir, wslHelpersDir, cacheDir };
}

interface FixtureMessage {
  readonly v: number;
  readonly kind: string;
  readonly requestId?: string;
  readonly ok?: boolean;
  readonly result?: { hash?: string; source?: string };
  readonly error?: { message?: string };
  readonly message?: string;
}

describe("cold SSH runtime archive work stays off the invoking loop", () => {
  it("advances the parent timer while the worker stages and hashes the archive", async () => {
    const fixture = createColdRuntimeFixture();
    const config = JSON.stringify({
      mainBundleDir: fixture.mainBundleDir,
      agentPluginsDir: fixture.agentPluginsDir,
      wslHelpersDir: fixture.wslHelpersDir,
      cacheDir: fixture.cacheDir,
    });
    const child = fork(resolve("src/host/ssh/runtimeBundleColdWork.processFixture.ts"), [config], {
      execArgv: [
        "--experimental-transform-types",
        "--disable-warning=ExperimentalWarning",
        "--import",
        resolve("scripts/remote-v3-ts-register.mjs"),
        "--import",
        resolve("src/host/ssh/sshColdWorkTestRegister.mjs"),
      ],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.push(child);
    let stderr = "";
    child.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
    });
    let exitInfo = "";
    child.on("exit", (code, signal) => {
      exitInfo = `exit code=${String(code)} signal=${String(signal)}`;
    });
    const messages: FixtureMessage[] = [];
    child.on("message", (message) => messages.push(message as FixtureMessage));

    const waitFor = async (predicate: (message: FixtureMessage) => boolean) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const match = messages.find(predicate);
        if (match) return match;
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
      throw new Error(`Timed out waiting for fixture output: ${stderr} ${exitInfo}`);
    };

    await waitFor(
      (message) => message.kind === "ready" && message.v === SSH_ENVIRONMENT_PROTOCOL_VERSION,
    );

    // The invoking process must keep servicing timers for the whole build.
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 1);
    child.send({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      generation: 1,
      requestId: "prepare-1",
      request: { kind: "prepare-runtime" },
    });
    const result = await waitFor(
      (message) => message.kind === "result" && message.requestId === "prepare-1",
    );
    clearInterval(timer);

    if (!result.ok) throw new Error(`Fixture failed: ${result.error?.message ?? stderr}`);
    expect(result.ok).toBe(true);
    expect(result.result?.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.result?.source).toBe("staged");
    expect(ticks).toBeGreaterThan(1);

    child.send({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      generation: 1,
      requestId: "shutdown-1",
      request: { kind: "shutdown" },
    });
    await once(child, "exit");
    expect(child.exitCode).toBe(0);
  }, 60_000);
});
