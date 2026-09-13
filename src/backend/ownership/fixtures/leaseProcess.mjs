import { HostOwnerLease } from "../hostOwnerLease.ts";
import { resolveHostRootPaths } from "../hostRootPaths.ts";

let lease;
try {
  lease = HostOwnerLease.acquire(resolveHostRootPaths(process.argv[2]), process.argv[3]);
  process.send({ status: "owned", generation: lease.generation, pid: process.pid });
} catch (error) {
  process.send({ status: "refused", code: error.code, message: error.message });
}

process.on("message", () => {
  lease?.release();
  process.exit(0);
});
process.on("disconnect", () => {
  lease?.release();
  process.exit(0);
});
