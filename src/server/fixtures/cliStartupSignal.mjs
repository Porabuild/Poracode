import { createRequire } from "node:module";
import { HostOwnerLease } from "../../backend/ownership/hostOwnerLease.ts";
import { resolveHostRootPaths } from "../../backend/ownership/hostRootPaths.ts";

// This owned child executes the real bundled CLI and signal helper. Only its
// application factory and diagnostics are synthetic; the profile lease is real.
const [entry, profile, stage, outcome] = process.argv.slice(2);
const opening = Promise.withResolvers();
const drained = Promise.withResolvers();
let lease;
let cancelled = false;
let startCalls = 0;
let disposeCalls = 0;
let diagnosticStops = 0;
let closing;
const reply = (message) => process.send?.(message);
const snapshot = () => ({
  type: "state",
  cancelled,
  startCalls,
  disposeCalls,
  diagnosticStops,
  exitCode: process.exitCode ?? null,
});

globalThis.__cliFixture = {
  async create(options) {
    lease = HostOwnerLease.acquire(resolveHostRootPaths(profile), "headless");
    options.signal?.addEventListener("abort", () => {
      cancelled = true;
      reply({ type: "cancelled" });
    });
    const host = {
      profileNamespace: profile,
      dataRoot: lease.paths.dataRoot,
      async start() {
        startCalls += 1;
        reply({ type: "pending", stage: "listener" });
        await opening.promise;
        return { httpBaseUrl: "http://127.0.0.1:1", wsBaseUrl: "ws://127.0.0.1:1" };
      },
      dispose() {
        if (closing) return closing;
        disposeCalls += 1;
        reply({ type: "disposing" });
        if (outcome === "hang") {
          // Plan 4.9: a disposal that never settles — the drain deadline must
          // force the exit and free the lease's kernel lock.
          closing = new Promise(() => undefined);
          return closing;
        }
        closing = Promise.all([opening.promise, drained.promise]).then(() => {
          if (outcome === "failed-join") throw new Error("Synthetic unconfirmed runtime join.");
          lease.release();
          reply({ type: "released" });
        });
        return closing;
      },
    };
    if (stage === "factory") {
      reply({ type: "pending", stage });
      await opening.promise;
    }
    return host;
  },
  async stopDiagnostics() {
    diagnosticStops += 1;
    setImmediate(() => reply({ ...snapshot(), type: "diagnostics-stopped" }));
  },
};

process.on("message", (message) => {
  if (message === "release-startup") opening.resolve();
  if (message === "release-drain") drained.resolve();
  if (message === "inspect") reply(snapshot());
});
process.argv = [process.execPath, entry];
createRequire(import.meta.url)(entry).runCli();
