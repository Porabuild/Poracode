import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";
import { hostRunsOnThisMachine } from "@/renderer/state/hostLocality";

/**
 * The home directory of the machine a thread's host runs on, for provider
 * roots that live under it. The bridge reports this machine's home; a host on
 * another machine does not expose its own, so none is offered for it and its
 * provider roots stay unresolved instead of pointing at the wrong disk.
 */
export function threadHostHomeDir(thread: {
  readonly remoteServerId?: string | undefined;
}): string | undefined {
  return hostRunsOnThisMachine(thread) ? (readBridge()?.homeDir ?? undefined) : undefined;
}

/**
 * Provider-supplied filesystem roots for relative transcript images. Shared
 * chat code only consumes the generic roots; providers own their path rules.
 */
export function resolveThreadMarkdownImageRoots(input: {
  agentKind: string;
  sessionId?: string | undefined;
  projectLocation: ProjectLocation;
  homeDir?: string | undefined;
}): readonly string[] | undefined {
  return getProviderManifest(input.agentKind)?.resolveMarkdownImageRoots?.({
    projectLocation: input.projectLocation,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
  });
}
