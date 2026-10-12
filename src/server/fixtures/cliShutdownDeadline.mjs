import { createServer } from "node:net";
import { HostOwnerLease } from "../../backend/ownership/hostOwnerLease.ts";
import { resolveHostRootPaths } from "../../backend/ownership/hostRootPaths.ts";
import { installShutdown } from "../cliRuntime.ts";

// This owned child holds a real profile lease plus retained handles (an open
// TCP socket and an interval timer) while the real installShutdown helper runs.
// The parent test drives SIGTERM and observes whether the hard deadline still
// terminates the process when disposal fails in each mode.
const [profile, mode, deadlineArgument] = process.argv.slice(2);
const deadlineMs = Number(deadlineArgument);
const lease = HostOwnerLease.acquire(resolveHostRootPaths(profile), "headless");
const retained = createServer();
await new Promise((resolve) => retained.listen(0, "127.0.0.1", resolve));
const retainedPort = retained.address().port;
const interval = setInterval(() => undefined, 250);
const reply = (message) => process.send?.(message);

const releaseHandles = async () => {
  clearInterval(interval);
  await new Promise((resolve) => retained.close(() => resolve()));
};

const dispose = (() => {
  switch (mode) {
    case "success":
      return async () => {
        await releaseHandles();
        lease.release();
        reply({ type: "released" });
      };
    case "sync-throw":
      return () => {
        reply({ type: "disposing" });
        throw new Error("Synthetic synchronous disposal failure");
      };
    case "async-reject":
      return async () => {
        reply({ type: "disposing" });
        await Promise.resolve();
        throw new Error("Synthetic asynchronous disposal failure");
      };
    case "hang":
      return () => {
        reply({ type: "disposing" });
        return new Promise(() => undefined);
      };
    case "wedge":
      // Deliberately blocks the event loop well past the deadline: the
      // in-process timer cannot fire, so only an external watchdog can bound
      // this mode. The parent suite SIGKILLs this child long before 5s.
      return () => {
        const until = Date.now() + 5_000;
        while (Date.now() < until) {
          // synchronous wedge
        }
        throw new Error("Synthetic wedged disposal failure");
      };
    default:
      throw new Error(`Unknown shutdown-deadline fixture mode: ${mode}`);
  }
})();

installShutdown("[shutdown-deadline-fixture]", dispose, { drainDeadlineMs: deadlineMs });
reply({ type: "ready", port: retainedPort });
