// Desktop initialize payload for the forked backend host child.
//
// Extracted from main.ts so the wire contract is unit-testable: the child's
// custody wiring depends on exact payload fields (the data-custody fence is
// acquired by the child BEFORE SQLite opens — see BackendHostCore), and a
// field silently dropped here starves that wiring while everything still
// "works" in a single-owner setup.

import type { PoracodeChannel } from "@/shared/channel";
import type { BackendHostInitializePayload } from "@/shared/backendHostProtocol";

export function buildDesktopBackendInitialize(input: {
  baseDir: string;
  dbPath: string;
  channel: PoracodeChannel;
  settingsPath: string;
  devServerUrl: string | undefined;
  supervisor: BackendHostInitializePayload["supervisor"];
  /**
   * The data-custody fence path from the admission lease's canonical root
   * mapping, passed EXPLICITLY: since the data-root unification the prepared
   * `baseDir` IS the owned `.host-v1` data root, and re-deriving the mapping
   * from it refuses literal owned-root inputs by design (nesting guard). The
   * child holds this fence for its lifetime across a killed main (an
   * orphaned backend keeps excluding a successor owner).
   */
  dataFencePath: string;
  hostCapabilities?: import("@/shared/hostControlProtocol").HostServiceCapabilities;
}): BackendHostInitializePayload {
  return {
    baseDir: input.baseDir,
    dbPath: input.dbPath,
    desktop: {
      channel: input.channel,
      settingsPath: input.settingsPath,
      dataFencePath: input.dataFencePath,
      ...(input.devServerUrl ? { devServerUrl: input.devServerUrl } : {}),
      ...(input.hostCapabilities ? { hostCapabilities: input.hostCapabilities } : {}),
    },
    supervisor: input.supervisor,
  };
}
