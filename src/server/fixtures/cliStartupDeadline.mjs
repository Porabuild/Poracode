import { createRequire } from "node:module";
import { createServer } from "node:net";
import { HostOwnerLease } from "../../backend/ownership/hostOwnerLease.ts";
import { resolveHostRootPaths } from "../../backend/ownership/hostRootPaths.ts";

// B1/D5 follow-through fixture: this owned child executes the real bundled CLI
// (only its headless factory is synthetic) and holds a real profile owner
// lease. Modes:
//   healthy   — start succeeds; the owner stays live until the parent's SIGTERM.
//   recovered — start fails and cleanup confirms and releases the owner (the
//               composition's one-shot retry seam has its own suite), so the
//               CLI must exit 1 immediately with no deadline linger.
//   reject / hang / wedge — start fails and cleanup cannot confirm; retained
//               handles (TCP socket + interval) keep the loop alive, so only
//               the bounded fatal-startup deadline can end the process.
//   bare      — cleanup cannot confirm but nothing retains the loop: the
//               process must still exit naturally at 1, with the armed
//               deadline never keeping it alive (the timer is unref'd).
const [entry, profile, mode] = process.argv.slice(2);
if (mode === "bare") process.disconnect();
const reply = (message) => {
  if (process.connected) process.send?.(message);
};
let lease;
let retained;
let interval;
let disposeCalls = 0;

const retainLoopHandles = async () => {
  retained = createServer();
  await new Promise((resolve) => retained.listen(0, "127.0.0.1", resolve));
  interval = setInterval(() => undefined, 100);
};

const releaseLoopHandles = async () => {
  clearInterval(interval);
  if (retained) await new Promise((resolve) => retained.close(() => resolve()));
};

globalThis.__cliFixture = {
  async create(options) {
    lease = HostOwnerLease.acquire(resolveHostRootPaths(profile), "headless");
    options.signal?.addEventListener("abort", () => reply({ type: "cancelled" }));
    const dataRoot = lease.paths.dataRoot;
    if (mode !== "bare") await retainLoopHandles();
    return {
      profileNamespace: profile,
      dataRoot,
      server: { flushAuditSync() {} },
      async start() {
        if (mode === "healthy") {
          reply({ type: "ready" });
          return { httpBaseUrl: "http://127.0.0.1:1", wsBaseUrl: "ws://127.0.0.1:1" };
        }
        reply({ type: "failing" });
        throw new Error(`Synthetic ${mode} listener startup failure`);
      },
      dispose() {
        disposeCalls += 1;
        reply({ type: "disposing", disposeCalls });
        switch (mode) {
          case "healthy":
          case "recovered":
            return releaseLoopHandles().then(() => {
              lease.release();
              reply({ type: "released" });
            });
          case "hang":
            return new Promise(() => undefined);
          case "bare":
          case "reject":
          case "wedge":
            return Promise.reject(new Error("Synthetic unconfirmed disposal failure"));
          default:
            return Promise.reject(new Error(`Unknown startup-deadline mode: ${mode}`));
        }
      },
    };
  },
  async stopDiagnostics() {
    if (mode === "wedge") {
      // A synchronous block after the bounded deadline was armed: the
      // in-process timer cannot fire inside it (the documented limitation),
      // so the forced exit can only follow the block.
      reply({ type: "wedging" });
      const until = Date.now() + 1_200;
      while (Date.now() < until) {
        // deliberately block the event loop
      }
    }
    reply({ type: "diagnostics-stopped", disposeCalls });
  },
};

process.argv = [process.execPath, entry];
createRequire(import.meta.url)(entry).runCli();
