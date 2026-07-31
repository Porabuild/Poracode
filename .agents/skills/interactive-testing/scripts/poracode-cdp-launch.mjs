import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  assertSessionRootOutsideRepo,
  readDebugSession,
  resolveSessionFile,
  resolveSmokeRoot,
} from "./poracode-debug-session.mjs";

export async function launchDetachedSession({ flags, repoRoot, scriptDir }) {
  if (flags.new !== true) {
    throw new Error(
      "detached launch requires --new and a unique root so parallel agents cannot attach to or stop another session",
    );
  }
  const mode = String(flags.mode ?? "mock");
  if (mode !== "mock" && mode !== "real") {
    throw new Error(`--mode must be mock or real, got: ${mode}`);
  }
  const root = resolve(
    String(flags.root ?? join(resolveSmokeRoot(), `debug-${Date.now()}-${process.pid}`)),
  );
  assertSessionRootOutsideRepo(root, repoRoot);
  const sessionFile = resolveSessionFile(root);
  try {
    await access(sessionFile);
    throw new Error(`detached launch requires a fresh root without session.json: ${root}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(root, { recursive: true });
  const stdoutFile = join(root, "owner.stdout.log");
  const stderrFile = join(root, "owner.stderr.log");
  const stdout = openSync(stdoutFile, "w");
  const stderr = openSync(stderrFile, "w");
  let owner;
  try {
    owner = spawn(
      process.execPath,
      [
        join(scriptDir, "run-poracode-smoke.mjs"),
        "--launch-only",
        "--new",
        "--mode",
        mode,
        "--root",
        root,
      ],
      {
        cwd: repoRoot,
        detached: true,
        windowsHide: process.platform === "win32",
        stdio: ["ignore", stdout, stderr],
      },
    );
    owner.unref();
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }

  const started = Date.now();
  const timeoutMs = Number(flags.timeout ?? 180) * 1000;
  while (true) {
    try {
      const session = await readDebugSession(sessionFile);
      if (session.state === "ready") {
        console.log(
          JSON.stringify(
            {
              sessionFile,
              root,
              launchMs: Date.now() - started,
              ownerPid: session.ownerPid,
              appPid: session.appPid,
              cdpPort: session.cdpPort,
              devServerPort: session.devServerPort,
              appUrl: session.appUrl,
              mode: session.mode,
            },
            null,
            2,
          ),
        );
        return;
      }
      if (session.state === "failed" || session.state === "stopped") {
        throw new Error(
          `managed launch entered ${session.state}: ${session.error ?? `inspect ${stderrFile}`}`,
        );
      }
    } catch (error) {
      if (error?.cause?.code !== "ENOENT") throw error;
    }
    if (owner.exitCode !== null) {
      throw new Error(
        `managed launcher exited before READY (exit ${owner.exitCode}); inspect ${stderrFile}`,
      );
    }
    const remainingMs = timeoutMs - (Date.now() - started);
    if (remainingMs <= 0) break;
    await new Promise((done) => setTimeout(done, Math.min(250, remainingMs)));
  }
  throw new Error(
    `managed session did not reach READY within ${timeoutMs}ms; it may still be starting at ${sessionFile}`,
  );
}
