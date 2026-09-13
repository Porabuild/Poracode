import { execFileSync, spawnSync } from "node:child_process";

const pendingStops = new WeakMap();

/** Preserve stop order, attempt every sibling, then report all unconfirmed joins. */
export async function stopOwnedProcesses(children, options) {
  const failures = [];
  for (const child of children) {
    try {
      await stopOwnedProcess(child, options);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      failures.map((error) => (error instanceof Error ? error.message : String(error))).join("; "),
    );
}

/** Stop only this live ChildProcess's detached group, and join descendants after its leader exits. */
export function stopOwnedProcess(child, { graceMs = 5_000 } = {}) {
  if (!child?.pid) return Promise.resolve();
  let pending = pendingStops.get(child);
  if (!pending) {
    pending = stop(child, graceMs);
    pendingStops.set(child, pending);
  }
  return pending;
}

async function stop(child, graceMs) {
  if (process.platform === "win32") {
    // Never reuse a dead ChildProcess's numeric PID as authorization for taskkill.
    if (hasExited(child)) return;
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const deadline = Date.now() + graceMs;
    while (!hasExited(child) && Date.now() < deadline) await delay(25);
    if (!hasExited(child))
      throw new Error(
        `taskkill did not stop owned process tree ${child.pid} (exit ${result.status ?? "unknown"})`,
      );
    return;
  }

  const initial = groupMembers(child.pid);
  if (initial.length === 0) return;
  if (hasExited(child) || !initial.some((member) => member.pid === child.pid)) {
    throw new Error(
      `Cannot safely reclaim process group ${child.pid}: its parent exited before ownership could be verified; runtime artifacts were retained.`,
    );
  }
  let known = new Set(initial.map(identity));
  function remaining() {
    const members = groupMembers(child.pid);
    if (members.length === 0) return [];
    // A group may outlive its leader. Require continuity through a previously
    // observed live member, never a recycled parent PID or an unverified group.
    if (!members.some((member) => known.has(identity(member)))) {
      throw new Error(
        `Lost verified ownership of process group ${child.pid}; refusing to signal a potentially reused group.`,
      );
    }
    known = new Set(members.map(identity));
    return members;
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"]) {
    if (remaining().length === 0) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    const deadline = Date.now() + graceMs;
    do {
      await delay(25);
      if (remaining().length === 0) return;
    } while (Date.now() < deadline);
  }
  throw new Error(
    `Owned process group ${child.pid} still has executing descendants after SIGKILL; runtime artifacts were retained.`,
  );
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}
function delay(ms) {
  return new Promise((done) => setTimeout(done, ms));
}
function identity(member) {
  return `${member.pid}:${member.started}`;
}

function groupMembers(groupId) {
  const table = execFileSync("ps", ["-axo", "pid=,pgid=,stat=,lstart="], { encoding: "utf8" });
  return table.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match || Number(match[2]) !== groupId || match[3].startsWith("Z")) return [];
    return [{ pid: Number(match[1]), started: match[4] }];
  });
}
