import { fork } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { HostOwnerLease } from "../../backend/ownership/hostOwnerLease.ts";
import { resolveHostRootPaths } from "../../backend/ownership/hostRootPaths.ts";

// Plan D5 external-watchdog fixture. This process is the parent bound that a
// synchronously wedged child cannot affect: its wall-clock timer lives in a
// different event loop, so it can SIGKILL the child even though the child can
// neither run its own in-process deadline nor its SIGTERM handler. It reports
// whether the child's death actually released the owned profile lease and
// listening port, because "the parent killed it" is only useful if the
// successor can then enter.
const [profile, mode, deadlineArgument, watchdogArgument] = process.argv.slice(2);
const drainDeadlineMs = Number(deadlineArgument);
const watchdogMs = Number(watchdogArgument);
const reply = (message) => process.send?.(message);

const child = fork(
  fileURLToPath(new URL("./cliShutdownDeadline.mjs", import.meta.url)),
  [profile, mode, String(drainDeadlineMs)],
  {
    execArgv: process.execArgv,
    env: process.env,
    // The child's stderr rides this parent's stderr so the test sees whether
    // the child's own deadline ever fired before the external kill.
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  },
);
reply({ type: "child-started", pid: child.pid });

let signalledAt = 0;
let retainedPort = 0;
let watchdogFired = false;
let watchdogTimer;

child.on("error", (error) => {
  reply({ type: "child-error", message: error.message });
});

child.on("message", (message) => {
  if (message?.type !== "ready") return;
  retainedPort = message.port;
  signalledAt = Date.now();
  child.kill("SIGTERM");
  watchdogTimer = setTimeout(() => {
    watchdogFired = true;
    child.kill("SIGKILL");
  }, watchdogMs);
});

function leaseReleased() {
  let contender;
  try {
    contender = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
    return true;
  } catch {
    return false;
  } finally {
    contender?.release();
  }
}

async function portRebindable() {
  if (!retainedPort) return false;
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(retainedPort, "127.0.0.1", resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    await new Promise((resolve) => probe.close(() => resolve()));
  }
}

child.once("exit", (code, signal) => {
  clearTimeout(watchdogTimer);
  void (async () => {
    const waitedMs = signalledAt === 0 ? -1 : Date.now() - signalledAt;
    const released = leaseReleased();
    const rebindable = await portRebindable();
    reply({
      type: "watchdog-result",
      watchdogFired,
      waitedMs,
      code,
      signal,
      leaseReleased: released,
      portRebindable: rebindable,
    });
    process.exit(released && rebindable ? 0 : 1);
  })();
});
