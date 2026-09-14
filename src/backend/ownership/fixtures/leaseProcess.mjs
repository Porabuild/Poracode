import { setImmediate } from "node:timers/promises";
import { HostOwnerLease } from "../hostOwnerLease.ts";
import { resolveHostRootPaths } from "../hostRootPaths.ts";

let lease;
try {
  lease = HostOwnerLease.acquire(resolveHostRootPaths(process.argv[2]), process.argv[3]);
  process.send({ status: "owned", generation: lease.generation, pid: process.pid });
} catch (error) {
  process.send({ status: "refused", code: error.code, message: error.message });
}

async function abandonLease() {
  lease = undefined;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    globalThis.gc();
    await setImmediate();
  }
  process.send({ status: "abandoned" });
}

process.on("message", (message) => {
  if (message === "abandon") {
    void abandonLease();
    return;
  }
  lease?.release();
  process.exit(0);
});
process.on("disconnect", () => {
  lease?.release();
  process.exit(0);
});
