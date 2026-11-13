import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

  it.skipIf(process.platform !== "win32").each(["timeout", "abort", "output limit"] as const)(
    "terminates Windows shim descendants on %s",
    async (reason) => {
      setGitExecWorkerPathForTests(workerBundlePath);
      const fixture = mkdtempSync(join(artifactsDir, "shim-"));
      const pidFile = join(fixture, "pids.json");
      const wrapperFile = join(fixture, "wrapper.cmd");
      writeFileSync(wrapperFile, `@"${process.execPath}" "%~dp0leaf.cjs"\r\n`);
      writeFileSync(
        join(fixture, "leaf.cjs"),
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ parent: process.ppid, child: process.pid }));
${reason === "output limit" ? "process.stdout.write('x'.repeat(4096));" : ""}
setInterval(() => {}, 1000);`,
      );
      const controller = new AbortController();
      let pids: { parent: number; child: number } | undefined;
      const alive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      try {
        const pending = execGitOnWorkerThread({
          command: process.env.ComSpec!,
          args: ["/d", "/c", wrapperFile],
          cwd: fixture,
          env: process.env,
          timeout: reason === "timeout" ? 2_000 : 10_000,
          maxBuffer: 1024,
          signal: controller.signal,
        });
        expect(pending).not.toBeNull();
        const outcome = pending!.catch((error: unknown) => error);
        await vi.waitFor(() => expect(existsSync(pidFile)).toBe(true), { timeout: 2_000 });
        pids = JSON.parse(readFileSync(pidFile, "utf8")) as typeof pids;
        if (reason === "abort") controller.abort();
        expect(await outcome).toMatchObject(
          reason === "abort"
            ? { name: "AbortError" }
            : reason === "output limit"
              ? { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }
              : { killed: true },
        );
        await vi.waitFor(
          () => {
            expect(alive(pids!.parent)).toBe(false);
            expect(alive(pids!.child)).toBe(false);
          },
          { timeout: 2_000 },
        );
      } finally {
        controller.abort();
        if (!pids && existsSync(pidFile)) {
          pids = JSON.parse(readFileSync(pidFile, "utf8")) as typeof pids;
        }
        for (const pid of pids ? [pids.child, pids.parent] : []) {
          if (alive(pid)) process.kill(pid);
        }
      }
    },
  );
});
