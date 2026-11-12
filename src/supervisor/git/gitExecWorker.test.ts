import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { execGit } from "./exec";
import {
  disposeGitExecWorker,
  execGitOnWorkerThread,
  setGitExecWorkerPathForTests,
} from "./gitExecWorkerClient";

const location: ProjectLocation = { kind: "posix", path: process.cwd() };

let artifactsDir: string;
let workerBundlePath: string;

beforeAll(async () => {
  mkdirSync(resolvePath("tmp"), { recursive: true });
  artifactsDir = mkdtempSync(resolvePath("tmp/git-exec-worker-"));
  workerBundlePath = join(artifactsDir, "gitExecWorker.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("./gitExecWorker.ts", import.meta.url))],
    outfile: workerBundlePath,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
});

afterEach(async () => {
  await disposeGitExecWorker();
  setGitExecWorkerPathForTests(undefined);
});

afterAll(() => {
  rmSync(artifactsDir, { recursive: true, force: true });
});

describe("gitExecWorkerClient", () => {
  it("runs git status and stdin plumbing on the dedicated worker thread without blocking supervisor", async () => {
    setGitExecWorkerPathForTests(workerBundlePath);

    const insideWorkTree = await execGit(location, ["rev-parse", "--is-inside-work-tree"]);
    expect(insideWorkTree.trim()).toBe("true");

    const hashed = await execGit(location, ["hash-object", "--stdin"], {
      input: "poracode-worker-git-check\n",
    });
    expect(hashed.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it("preserves stderr details and acceptedExitCodes across the worker boundary", async () => {
    setGitExecWorkerPathForTests(workerBundlePath);

    await expect(execGit(location, ["poracode-invalid-subcommand"])).rejects.toThrow(
      /git command/i,
    );

    const diffCheck = await execGit(location, ["diff", "--quiet", "HEAD", "HEAD"], {
      acceptedExitCodes: [0, 1],
    });
    expect(diffCheck).toBe("");
  });

  it("isolates synchronous spawn errors from concurrent results and timeouts", async () => {
    setGitExecWorkerPathForTests(workerBundlePath);
    const options = {
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024,
    };
    const completing = execGitOnWorkerThread({
      ...options,
      args: ["-e", "setTimeout(() => process.stdout.write('done'), 200)"],
      timeout: 2_000,
    });
    const timingOut = execGitOnWorkerThread({
      ...options,
      args: ["-e", "setTimeout(() => {}, 2000)"],
      timeout: 300,
    });
    const malformed = execGitOnWorkerThread({
      ...options,
      args: ["-e", "bad\0argument"],
      timeout: 2_000,
    });

    await Promise.all([
      expect(completing).resolves.toEqual({ stdout: "done", stderr: "" }),
      expect(timingOut).rejects.toMatchObject({ killed: true }),
      expect(malformed).rejects.toMatchObject({
        name: "TypeError",
        code: "ERR_INVALID_ARG_VALUE",
        stdout: "",
        stderr: "",
      }),
    ]);
  });

  it("cancels an in-flight worker git command when its AbortSignal aborts", async () => {
    setGitExecWorkerPathForTests(workerBundlePath);
    const controller = new AbortController();
    const pending = execGitOnWorkerThread({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 5000)"],
      cwd: process.cwd(),
      env: process.env,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      signal: controller.signal,
    });
    expect(pending).not.toBeNull();
    controller.abort();

    await expect(pending!).rejects.toMatchObject({ name: "AbortError" });
  });
});
