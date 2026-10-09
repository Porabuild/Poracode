import type { ProjectLocation } from "@/shared/contracts";
import type { HostDiagnosticsSnapshot } from "@/shared/lsp";

export type HostDiagnosticsSource = (
  location: ProjectLocation,
  signal: AbortSignal,
) => Promise<HostDiagnosticsSnapshot | undefined>;

/** Capture the execution project before asynchronous work; never follow a mutated launch argument. */
export function bindHostDiagnosticsReader(
  location: ProjectLocation,
  source: HostDiagnosticsSource,
) {
  const owner = { ...location };
  return async (signal: AbortSignal): Promise<HostDiagnosticsSnapshot | undefined> => {
    signal.throwIfAborted();
    const snapshot = await source({ ...owner }, signal);
    signal.throwIfAborted();
    return snapshot;
  };
}
