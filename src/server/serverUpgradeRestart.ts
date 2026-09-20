import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";

const STOP_TIMEOUT_MS = 10_000;
// Only actual children spawned by this upgrader can be stopped without a live
// control endpoint (a broken candidate may never initialize one).
const spawnedDaemons = new Map<string, ChildProcess>();

function guidance(): Error {
  return new Error(
    "Cannot verify or stop the running Poracode owner. Stop the daemon manually before upgrading.",
  );
}

async function stopOwnedChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolveStop, reject) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", exited);
      reject(guidance());
    }, STOP_TIMEOUT_MS);
    const exited = () => {
      clearTimeout(timeout);
      resolveStop();
    };
    child.once("exit", exited);
    child.kill("SIGTERM");
  });
}

async function stopAuthenticatedOwner(stoppedChildPid?: number): Promise<void> {
  const baseDir = process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  const paths = resolveDesktopHostRootPaths(baseDir);
  const record = readHostOwnerRecord(paths);
  if (!record || record.kind !== "headless" || record.phase === "stopped") return;
  if (record.pid === stoppedChildPid) return;
  if (record.pid <= 1 || record.pid === process.pid) throw guidance();
  // Discovery metadata and pid files cannot prove liveness or identity. The
  // mutually authenticated response proves this owner generation is serving.
  let response: Awaited<ReturnType<typeof callHostControl<"describe">>>;
  try {
    response = await callHostControl(paths, "describe", { timeoutMs: 3_000 });
  } catch {
    throw guidance();
  }
  const current = readHostOwnerRecord(paths);
  if (
    response.ownerGeneration !== record.generation ||
    response.result.mode !== "headless" ||
    !current ||
    current.generation !== record.generation ||
    current.pid !== record.pid ||
    current.kind !== "headless" ||
    current.phase === "stopped"
  )
    throw guidance();
  try {
    process.kill(record.pid, "SIGTERM");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return;
    throw guidance();
  }
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  for (;;) {
    try {
      process.kill(record.pid, 0);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return;
      throw guidance();
    }
    // Never escalate a persisted PID to SIGKILL: the process may have exited
    // and the OS may already have reused its number during this wait.
    if (Date.now() >= deadline) throw guidance();
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

export async function restartServerPrefix(prefix: string): Promise<void> {
  const key = resolve(prefix);
  // The shipped service is bound to /opt/poracode. A custom prefix must never
  // restart an unrelated globally installed service.
  if (key === "/opt/poracode") {
    try {
      execFileSync("systemctl", ["restart", "poracode-server"], { stdio: "pipe" });
      return;
    } catch {
      // Unmanaged installs use the authenticated owner control surface below.
    }
  }
  const owned = spawnedDaemons.get(key);
  if (owned) {
    await stopOwnedChild(owned);
    spawnedDaemons.delete(key);
  }
  await stopAuthenticatedOwner(owned?.pid);
  const entry = join(prefix, "current", "lib", "server.cjs");
  if (!existsSync(entry)) return;
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  await new Promise<void>((resolveSpawn, reject) => {
    child.once("error", reject);
    child.once("spawn", resolveSpawn);
  });
  spawnedDaemons.set(key, child);
  // This marker remains diagnostic/backward-compatible, never kill authority.
  if (child.pid) writeFileSync(join(prefix, "poracode-server.pid"), `${child.pid}\n`);
  child.unref();
}
