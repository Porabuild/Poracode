// Dev-only safety net: reap orphaned dev supervisors left behind when an
// Electron main died without disposing its forked supervisor (crash,
// force-quit, `kill -9`, electronmon restart). macOS/Linux have no Job
// Object equivalent, so such supervisors are reparented to launchd/init and
// keep running — sometimes at 100% CPU. The in-app orphan watchdog covers
// most cases; this sweep catches supervisors that wedged before any of
// their timers could run.
//
// Detection is precise: a legitimate dev supervisor always has a live
// Electron parent (ppid !== 1), so concurrent worktree dev apps are never
// touched. Packaged-app supervisors (app.asar paths) are skipped. Windows
// is skipped because Job Objects take the tree down with the parent.

import { spawnSync } from "node:child_process";

const SUPERVISOR_COMMAND_PATTERN = /[/\\]dist[/\\]main[/\\]supervisor\.cjs\b/;
const SIGKILL_FOLLOW_UP_MS = 2_000;

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function parseSupervisorOrphans(psOutput) {
  const orphans = [];
  for (const line of psOutput.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }
    const [, pidRaw, ppidRaw, command] = match;
    // Only true orphans: reparented to init/launchd after the parent died.
    if (ppidRaw !== "1") {
      continue;
    }
    if (!SUPERVISOR_COMMAND_PATTERN.test(command)) {
      continue;
    }
    // Never touch packaged-app supervisors.
    if (command.includes("app.asar")) {
      continue;
    }
    orphans.push({ pid: Number(pidRaw), command });
  }
  return orphans;
}

export function sweepStaleSupervisors({ log = console.log } = {}) {
  if (process.platform === "win32") {
    return;
  }
  let output;
  try {
    const result = spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (result.status !== 0 || !result.stdout) {
      return;
    }
    output = result.stdout;
  } catch {
    return;
  }

  const orphans = parseSupervisorOrphans(output);
  if (orphans.length === 0) {
    return;
  }

  for (const orphan of orphans) {
    log(`[dev-launch] reaping stale supervisor pid=${orphan.pid}: ${orphan.command}`);
    try {
      process.kill(orphan.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }

  // Escalate survivors to SIGKILL; a wedged supervisor cannot handle signals.
  const followUp = setTimeout(() => {
    for (const orphan of orphans) {
      if (!pidIsAlive(orphan.pid)) {
        continue;
      }
      try {
        process.kill(orphan.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }, SIGKILL_FOLLOW_UP_MS);
  followUp.unref?.();
}
