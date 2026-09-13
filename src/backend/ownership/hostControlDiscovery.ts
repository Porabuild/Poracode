import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  HOST_CONTROL_DISCOVERY_FILE,
  HOST_CONTROL_DISCOVERY_VERSION,
  HOST_CONTROL_MAX_RESPONSE_BYTES,
  hostControlDiscoverySchema,
  type HostControlDiscovery,
} from "@/shared/hostControlProtocol";
import { readHostOwnerRecord, type HostOwnerLease } from "./hostOwnerLease";
import type { HostRootPaths } from "./hostRootPaths";
import { readPrivateHostFile } from "./privateHostFile";

function controlPath(paths: HostRootPaths): string {
  return join(paths.dataRoot, HOST_CONTROL_DISCOVERY_FILE);
}

export function readHostControlDiscovery(paths: HostRootPaths): HostControlDiscovery {
  try {
    const record = hostControlDiscoverySchema.parse(
      JSON.parse(
        readPrivateHostFile(
          paths,
          HOST_CONTROL_DISCOVERY_FILE,
          HOST_CONTROL_MAX_RESPONSE_BYTES,
        ).toString("utf8"),
      ),
    );
    const owner = readHostOwnerRecord(paths);
    if (
      record.profileNamespace !== paths.profileNamespace ||
      record.dataRoot !== paths.dataRoot ||
      !owner ||
      owner.phase === "stopped" ||
      record.ownerGeneration !== owner.generation
    )
      throw new Error("Host control discovery does not match this owner.");
    return record;
  } catch {
    throw new Error("Current Poracode host control is unavailable for this profile.");
  }
}

export function publishHostControlDiscovery(
  lease: HostOwnerLease,
  port: number,
  token: string,
): HostControlDiscovery {
  lease.assertActive();
  const record = hostControlDiscoverySchema.parse({
    formatVersion: HOST_CONTROL_DISCOVERY_VERSION,
    profileNamespace: lease.paths.profileNamespace,
    dataRoot: lease.paths.dataRoot,
    ownerGeneration: lease.generation,
    transport: { kind: "http-loopback", port },
    token,
  });
  writeFileAtomic(controlPath(lease.paths), `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return record;
}

export function removeHostControlDiscovery(lease: HostOwnerLease): void {
  lease.assertActive();
  let current: HostControlDiscovery;
  try {
    current = readHostControlDiscovery(lease.paths);
  } catch {
    return;
  }
  if (current.ownerGeneration === lease.generation) unlinkSync(controlPath(lease.paths));
}
