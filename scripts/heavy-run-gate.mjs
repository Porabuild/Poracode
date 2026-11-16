/**
 * Machine-wide admission gate for heavy local runs (full vitest, typecheck,
 * lint, format, build).
 *
 * Parallel worktrees each assume they own the machine, so N simultaneous
 * `bun run verify` runs oversubscribe the CPU and spend their time on process
 * starts and paging. This gate bounds how many heavy runs execute at once
 * across every worktree of one repository and queues the rest.
 *
 * - Slots are directories under `<git common dir>/poracode-heavy-gate/`, which
 *   every worktree shares and which does not depend on the environment (Turbo
 *   strict mode strips most variables). `mkdir` is the atomic acquire.
 * - A slot whose owner pid is dead (crash, kill) is reclaimed by the next waiter.
 * - Nested gated commands under a live holder run directly, so wrappers cannot
 *   deadlock against themselves.
 * - CI never gates: runners are isolated and always run fresh.
 *
 * Environment: `PORACODE_HEAVY_GATE_SLOTS` (default 2) caps concurrent runs;
 * `PORACODE_HEAVY_GATE_DISABLE=1` bypasses the gate. The wrapped command gets
 * `PORACODE_HEAVY_GATE_PEERS`, the number of holders (itself included) when it
 * started, so a test runner can split its worker budget with its peers.
 *
 * CLI: `node scripts/heavy-run-gate.mjs -- <command> [args...]`
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_SLOTS = 2;
const POLL_MS = 500;
const REPORT_MS = 30_000;
/** A slot directory with no readable owner file is a crash between mkdir and write. */
const ORPHAN_GRACE_MS = 10_000;

export function resolveSlots(env = process.env) {
  const slots = Number.parseInt(env.PORACODE_HEAVY_GATE_SLOTS ?? "", 10);
  return Number.isInteger(slots) && slots > 0 ? slots : DEFAULT_SLOTS;
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function gateBypassReason(env = process.env) {
  if (env.CI) return "CI";
  if (env.PORACODE_HEAVY_GATE_DISABLE === "1") return "disabled";
  const holder = Number.parseInt(env.PORACODE_HEAVY_GATE_HELD ?? "", 10);
  if (pidAlive(holder)) return "held by parent";
  return null;
}

export function resolveLockRoot(cwd = process.cwd()) {
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
    ).trim();
    if (common) return join(common, "poracode-heavy-gate");
  } catch {
    // Not a git checkout: fall back to a per-machine location.
  }
  return join(os.tmpdir(), "poracode-heavy-gate");
}

function readOwner(slotDir) {
  try {
    return JSON.parse(fs.readFileSync(join(slotDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function isStale(slotDir) {
  const owner = readOwner(slotDir);
  if (owner) return !pidAlive(owner.pid);
  try {
    return Date.now() - fs.statSync(slotDir).mtimeMs > ORPHAN_GRACE_MS;
  } catch {
    return false;
  }
}

/** Removes a dead slot. Renaming first lets exactly one waiter win the reclaim. */
function reclaim(slotDir) {
  const trash = `${slotDir}.stale-${process.pid}-${Date.now()}`;
  try {
    fs.renameSync(slotDir, trash);
  } catch {
    return;
  }
  if (!isStale(trash)) {
    // A new live owner took the slot between the check and the rename.
    try {
      fs.renameSync(trash, slotDir);
      return;
    } catch {
      // Lost the slot to another waiter; fall through and discard the copy.
    }
  }
  fs.rmSync(trash, { recursive: true, force: true });
}

/** Returns `{ dir, peers }` when a slot was taken, or `{ holders }` when all are busy. */
export function tryAcquire(root, slots, owner) {
  fs.mkdirSync(root, { recursive: true });
  const holders = [];
  for (let index = 0; index < slots; index += 1) {
    const dir = join(root, `slot-${index}`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        fs.mkdirSync(dir);
        fs.writeFileSync(join(dir, "owner.json"), JSON.stringify(owner));
        const peers = Array.from({ length: slots }, (_, slot) => join(root, `slot-${slot}`)).filter(
          (candidate) => fs.existsSync(candidate),
        ).length;
        return { dir, peers };
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (attempt === 0 && isStale(dir)) {
          reclaim(dir);
          continue;
        }
        holders.push(readOwner(dir));
        break;
      }
    }
  }
  return { holders };
}

export function release(slot) {
  fs.rmSync(slot.dir, { recursive: true, force: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describeHolder(holder) {
  return holder
    ? `${holder.command ?? "?"} in ${holder.cwd ?? "?"} (pid ${holder.pid})`
    : "unknown";
}

export async function acquire(root, slots, owner, { log = console.error } = {}) {
  let waitingSince = 0;
  let lastReport = 0;
  for (;;) {
    const result = tryAcquire(root, slots, owner);
    if (result.dir) {
      if (waitingSince) {
        log(
          `[heavy-run-gate] slot acquired after ${Math.round((Date.now() - waitingSince) / 1000)}s`,
        );
      }
      return result;
    }
    const now = Date.now();
    if (!waitingSince) waitingSince = now;
    if (now - lastReport >= REPORT_MS) {
      lastReport = now;
      log(
        `[heavy-run-gate] ${slots} heavy run(s) already active; waiting. Held by: ${result.holders
          .map(describeHolder)
          .join("; ")}`,
      );
    }
    await sleep(POLL_MS);
  }
}

/** Runs `command` once a slot is free (or immediately when the gate is bypassed). */
export async function runGated(command, args, { env = process.env, cwd = process.cwd() } = {}) {
  const run = (extraEnv) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: "inherit",
        windowsHide: true,
        env: { ...env, ...extraEnv },
      });
      const forward = (signal) => () => child.kill(signal);
      const onInt = forward("SIGINT");
      const onTerm = forward("SIGTERM");
      process.on("SIGINT", onInt);
      process.on("SIGTERM", onTerm);
      child.once("error", reject);
      child.once("close", (code, signal) => {
        process.off("SIGINT", onInt);
        process.off("SIGTERM", onTerm);
        resolve(code ?? (signal ? 1 : 0));
      });
    });

  if (gateBypassReason(env)) return run({});

  const slots = resolveSlots(env);
  const owner = {
    pid: process.pid,
    cwd,
    command: [command, ...args].slice(0, 4).join(" "),
    startedAt: new Date().toISOString(),
  };
  const root = resolveLockRoot(cwd);
  let slot = null;
  const dropSlot = () => {
    if (slot) release(slot);
    slot = null;
  };
  // While queued there is no child to forward to, so a signal just leaves the queue.
  const abort = (code) => () => {
    dropSlot();
    process.exit(code);
  };
  const onInt = abort(130);
  const onTerm = abort(143);
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  process.on("exit", dropSlot);
  try {
    slot = await acquire(root, slots, owner);
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    return await run({
      PORACODE_HEAVY_GATE_HELD: String(process.pid),
      PORACODE_HEAVY_GATE_SLOTS: String(slots),
      PORACODE_HEAVY_GATE_PEERS: String(slot.peers),
    });
  } finally {
    dropSlot();
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    process.off("exit", dropSlot);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const separator = process.argv.indexOf("--");
  const [command, ...args] = process.argv.slice(separator === -1 ? 2 : separator + 1);
  if (!command) {
    console.error("usage: node scripts/heavy-run-gate.mjs -- <command> [args...]");
    process.exit(2);
  }
  process.exit(await runGated(command, args));
}
