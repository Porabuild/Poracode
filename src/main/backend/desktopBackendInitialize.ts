// Desktop initialize payload for the forked backend host child.
//
// Extracted from main.ts so the wire contract is unit-testable: the child's
// custody wiring depends on exact payload fields (the data-custody fence is
// acquired by the child BEFORE SQLite opens — see BackendHostCore), and a
// field silently dropped here starves that wiring while everything still
// "works" in a single-owner setup.

import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { PoracodeChannel } from "@/shared/channel";
import type { BackendHostInitializePayload } from "@/shared/backendHostProtocol";

export function buildDesktopBackendInitialize(input: {
  baseDir: string;
  dbPath: string;
  channel: PoracodeChannel;
  settingsPath: string;
  devServerUrl: string | undefined;
  supervisor: BackendHostInitializePayload["supervisor"];
}): BackendHostInitializePayload {
  return {
    baseDir: input.baseDir,
    dbPath: input.dbPath,
    desktop: {
      channel: input.channel,
      settingsPath: input.settingsPath,
      // Same canonical root mapping the desktop owner lease used at admission,
      // so the child holds the data-custody fence for its lifetime across a
      // killed main (an orphaned backend keeps excluding a successor owner).
      dataFencePath: resolveDesktopHostRootPaths(input.baseDir).dataFencePath,
      ...(input.devServerUrl ? { devServerUrl: input.devServerUrl } : {}),
    },
    supervisor: input.supervisor,
  };
}
